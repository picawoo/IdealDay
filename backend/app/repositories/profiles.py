import uuid

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.profile import UserProfile
from app.schemas.profile import ProfileUpsert


async def get(session: AsyncSession, user_id: uuid.UUID) -> UserProfile | None:
    return await session.scalar(select(UserProfile).where(UserProfile.user_id == user_id))


async def upsert(session: AsyncSession, user_id: uuid.UUID, data: ProfileUpsert) -> UserProfile:
    """Создаёт или обновляет профиль одним запросом (без гонки между проверкой и вставкой)."""
    values = {
        "birth_date": data.birth_date,
        "chronotype": data.chronotype.value,
        "timezone": data.timezone,
    }
    statement = insert(UserProfile).values(user_id=user_id, **values)
    statement = statement.on_conflict_do_update(
        index_elements=[UserProfile.user_id],
        set_={**values, "updated_at": func.now()},
    ).returning(UserProfile)

    result = await session.execute(statement, execution_options={"populate_existing": True})
    profile = result.scalar_one()
    await session.commit()
    return profile
