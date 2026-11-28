from datetime import date
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import TaskNotFoundError
from app.models.task import Task
from app.models.user import User


async def lock_writes(session: AsyncSession, user_id: UUID) -> None:
    """Сериализует проверку занятости и изменение расписания для одного пользователя."""
    await session.execute(select(User.id).where(User.id == user_id).with_for_update())


async def get_owned(session: AsyncSession, user_id: UUID, task_id: UUID) -> Task:
    task = await session.scalar(select(Task).where(Task.user_id == user_id, Task.id == task_id))
    if task is None:
        raise TaskNotFoundError()
    return task


async def list_owned(
    session: AsyncSession,
    user_id: UUID,
    *,
    target: date | None,
    limit: int | None = None,
    offset: int = 0,
) -> list[Task]:
    query = select(Task).where(Task.user_id == user_id)
    if target is not None:
        query = query.where(Task.scheduled_date == target)
    query = (
        query.order_by(Task.scheduled_date, Task.created_at, Task.id)
        .limit(limit)
        .offset(offset)
    )
    return list(await session.scalars(query))
