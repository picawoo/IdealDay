from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import NotificationDelivery
from app.models.profile import UserProfile
from app.models.settings import UserSettings
from app.models.task import Task
from app.models.user import User
from app.services.email_reminders import (
    MAX_EMAIL_TASKS,
    DeliveryStatus,
    local_reminder_time,
)

MAX_ATTEMPTS = 3
CLAIM_LEASE = timedelta(minutes=15)
_TIMEZONE = func.coalesce(UserProfile.timezone, "UTC")


@dataclass(frozen=True, slots=True)
class DeliveryClaim:
    user_id: UUID
    local_date: date
    attempts: int
    email: str
    task_titles: tuple[str, ...]


async def history(session: AsyncSession, user_id: UUID, limit: int) -> list[NotificationDelivery]:
    query = (
        select(NotificationDelivery)
        .where(NotificationDelivery.user_id == user_id)
        .order_by(NotificationDelivery.local_date.desc())
        .limit(limit)
    )
    return list(await session.scalars(query))


async def eligible_accounts(
    session: AsyncSession, after: UUID | None, limit: int
) -> Sequence[tuple[UUID, int, str]]:
    query = (
        select(UserSettings.user_id, UserSettings.reminder_minute, _TIMEZONE)
        .outerjoin(UserProfile, UserProfile.user_id == UserSettings.user_id)
        .where(UserSettings.email_notifications_enabled.is_(True))
        .order_by(UserSettings.user_id)
        .limit(limit)
    )
    if after is not None:
        query = query.where(UserSettings.user_id > after)
    return (await session.execute(query)).tuples().all()


async def enqueue(
    session: AsyncSession, due: Sequence[tuple[UUID, date]], now: datetime
) -> None:
    if not due:
        return
    values = [
        {
            "user_id": user_id,
            "local_date": target,
            "status": DeliveryStatus.PENDING,
            "attempts": 0,
            "available_at": now,
        }
        for user_id, target in due
    ]
    await session.execute(insert(NotificationDelivery).values(values).on_conflict_do_nothing())


async def claim(session: AsyncSession, now: datetime) -> DeliveryClaim | None:
    query = (
        select(NotificationDelivery)
        .where(
            NotificationDelivery.status.in_((DeliveryStatus.PENDING, DeliveryStatus.SENDING)),
            NotificationDelivery.available_at <= now,
        )
        .order_by(NotificationDelivery.available_at, NotificationDelivery.user_id)
        .limit(25)
        .with_for_update(skip_locked=True)
    )
    for row in await session.scalars(query):
        if row.attempts >= MAX_ATTEMPTS:
            row.status = DeliveryStatus.FAILED
            continue
        recipient = await session.execute(
            select(User.email, UserSettings.reminder_minute, _TIMEZONE)
            .join(UserSettings, UserSettings.user_id == User.id)
            .outerjoin(UserProfile, UserProfile.user_id == User.id)
            .where(User.id == row.user_id, UserSettings.email_notifications_enabled.is_(True))
        )
        account = recipient.one_or_none()
        if account is None:
            row.status = DeliveryStatus.SKIPPED
            continue
        email, minute, timezone = account
        target, local_minute = local_reminder_time(now, timezone)
        if target != row.local_date:
            row.status = DeliveryStatus.SKIPPED
            continue
        if local_minute < minute:
            row.available_at = now + timedelta(minutes=1)
            continue
        titles = await session.scalars(
            select(Task.title)
            .where(Task.user_id == row.user_id, Task.scheduled_date == target)
            .order_by(Task.priority.desc(), Task.created_at, Task.id)
            .limit(MAX_EMAIL_TASKS + 1)
        )
        row.status = DeliveryStatus.SENDING
        row.attempts += 1
        row.available_at = now + CLAIM_LEASE
        return DeliveryClaim(row.user_id, target, row.attempts, email, tuple(titles))
    return None


async def finish(
    session: AsyncSession, job: DeliveryClaim, now: datetime, *, sent: bool
) -> None:
    if sent:
        values = {"status": DeliveryStatus.SENT, "sent_at": now}
    elif job.attempts >= MAX_ATTEMPTS:
        values = {"status": DeliveryStatus.FAILED}
    else:
        values = {
            "status": DeliveryStatus.PENDING,
            "available_at": now + timedelta(minutes=5 * 2 ** (job.attempts - 1)),
        }
    # Старая попытка после истечения аренды не может перезаписать результат новой.
    await session.execute(
        update(NotificationDelivery)
        .where(
            NotificationDelivery.user_id == job.user_id,
            NotificationDelivery.local_date == job.local_date,
            NotificationDelivery.status == DeliveryStatus.SENDING,
            NotificationDelivery.attempts == job.attempts,
        )
        .values(**values)
    )
