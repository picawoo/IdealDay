import asyncio
from datetime import date

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from sqlalchemy import inspect
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from app.db.base import Base
from app.models.profile import UserProfile
from app.models.user import User


def _run_on_database(url: str, fn):
    """Выполняет синхронную функцию над соединением (для inspect и compare_metadata)."""

    async def _inner():
        engine = create_async_engine(url, poolclass=NullPool)
        try:
            async with engine.connect() as connection:
                return await connection.run_sync(fn)
        finally:
            await engine.dispose()

    return asyncio.run(_inner())


def test_models_match_migrations(test_database_url: str, migrated_database: None) -> None:
    """После миграций схема совпадает с моделями: autogenerate не находит расхождений."""

    def diff(connection):
        return compare_metadata(MigrationContext.configure(connection), Base.metadata)

    assert _run_on_database(test_database_url, diff) == []


def test_downgrade_and_upgrade_roundtrip(
    alembic_cfg: Config, test_database_url: str, migrated_database: None
) -> None:
    def tables(connection):
        return set(inspect(connection).get_table_names())

    assert {"users", "user_profiles"} <= _run_on_database(test_database_url, tables)

    command.downgrade(alembic_cfg, "base")
    try:
        after_downgrade = _run_on_database(test_database_url, tables)
        assert not {"users", "user_profiles"} & after_downgrade
    finally:
        command.upgrade(alembic_cfg, "head")

    assert {"users", "user_profiles"} <= _run_on_database(test_database_url, tables)


async def _create_user(session: AsyncSession, email: str = "db@idealday.app") -> User:
    user = User(email=email, password_hash="hash")
    session.add(user)
    await session.flush()
    return user


async def test_profile_chronotype_check_constraint(
    db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with db_session_factory() as session:
        user = await _create_user(session)
        session.add(UserProfile(user_id=user.id, birth_date=date(2000, 1, 1), chronotype="hawk"))

        with pytest.raises(IntegrityError):
            await session.flush()


async def test_profile_birth_date_lower_bound_constraint(
    db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with db_session_factory() as session:
        user = await _create_user(session)
        session.add(UserProfile(user_id=user.id, birth_date=date(1899, 12, 31)))

        with pytest.raises(IntegrityError):
            await session.flush()


async def test_profile_server_defaults(
    db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with db_session_factory() as session:
        user = await _create_user(session)
        profile = UserProfile(user_id=user.id, birth_date=date(2000, 1, 1))
        session.add(profile)
        await session.flush()

        assert profile.chronotype == "dove"
        assert profile.timezone == "UTC"
        assert profile.created_at is not None
        assert profile.updated_at is not None


async def test_email_is_unique(db_session_factory: async_sessionmaker[AsyncSession]) -> None:
    async with db_session_factory() as session:
        await _create_user(session, "same@idealday.app")
        session.add(User(email="same@idealday.app", password_hash="hash"))

        with pytest.raises(IntegrityError):
            await session.flush()


async def test_deleting_user_cascades_to_profile(
    db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with db_session_factory() as session:
        user = await _create_user(session)
        session.add(UserProfile(user_id=user.id, birth_date=date(2000, 1, 1)))
        await session.flush()
        user_id = user.id

        await session.delete(user)
        await session.flush()
        session.expunge_all()

        assert await session.get(UserProfile, user_id) is None
