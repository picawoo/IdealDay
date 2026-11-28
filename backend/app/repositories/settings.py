from uuid import UUID

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.settings import UserSettings


async def get(session: AsyncSession, user_id: UUID) -> UserSettings | None:
    return await session.get(UserSettings, user_id)


async def upsert(
    session: AsyncSession, user_id: UUID, *, enabled: bool, minute: int
) -> None:
    prefs = {"email_notifications_enabled": enabled, "reminder_minute": minute}
    query = insert(UserSettings).values(user_id=user_id, **prefs).on_conflict_do_update(
        index_elements=[UserSettings.user_id], set_=prefs
    )
    await session.execute(query)
    await session.commit()
