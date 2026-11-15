import asyncio
from collections.abc import AsyncIterator, Awaitable, Callable
from datetime import datetime
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fakeredis import FakeAsyncRedis, FakeServer
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from app.core.clock import get_clock
from app.core.config import get_settings
from app.main import create_app

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PASSWORD = "correct-horse-battery"


async def _ensure_database_exists(url: str) -> None:
    """Создаёт тестовую БД, если её ещё нет (подключаясь к служебной БД postgres)."""
    parsed = make_url(url)
    admin = create_async_engine(
        parsed.set(database="postgres"), isolation_level="AUTOCOMMIT", poolclass=NullPool
    )
    try:
        async with admin.connect() as conn:
            exists = await conn.scalar(
                text("SELECT 1 FROM pg_database WHERE datname = :name"), {"name": parsed.database}
            )
            if not exists:
                await conn.execute(text(f'CREATE DATABASE "{parsed.database}"'))
    finally:
        await admin.dispose()


@pytest.fixture(scope="session")
def test_database_url() -> str:
    url = get_settings().test_database_url
    if url is None:
        pytest.fail(
            "TEST_DATABASE_URL не задан, запускайте тесты через docker compose", pytrace=False
        )
    asyncio.run(_ensure_database_exists(url))
    return url


@pytest.fixture(scope="session")
def alembic_cfg(test_database_url: str) -> Config:
    cfg = Config(str(ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(ROOT / "alembic"))
    cfg.set_main_option("sqlalchemy.url", test_database_url.replace("%", "%%"))
    return cfg


@pytest.fixture(scope="session")
def migrated_database(alembic_cfg: Config) -> None:
    """Схема тестовой БД создаётся настоящими миграциями: заодно они проверяются тестами."""
    command.upgrade(alembic_cfg, "head")


@pytest.fixture
async def engine(test_database_url: str) -> AsyncIterator[AsyncEngine]:
    # NullPool: каждое соединение закрывается сразу, без привязки к event loop между тестами
    engine = create_async_engine(test_database_url, poolclass=NullPool)
    yield engine
    await engine.dispose()


@pytest.fixture
async def db_session_factory(
    engine: AsyncEngine, migrated_database: None
) -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    """Все сессии теста работают внутри одной внешней транзакции, которая откатывается в конце.

    commit() в коде приложения освобождает только savepoint, поэтому тесты не оставляют данных.
    """
    async with engine.connect() as connection:
        transaction = await connection.begin()
        factory = async_sessionmaker(
            bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint"
        )
        yield factory
        await transaction.rollback()


@pytest.fixture
def redis_client() -> FakeAsyncRedis:
    # Свой FakeServer на каждый тест: иначе экземпляры FakeAsyncRedis делят данные между тестами
    return FakeAsyncRedis(server=FakeServer(), decode_responses=True)


class BrokenRedis:
    """Имитация недоступного Redis: любая операция падает."""

    async def ping(self) -> bool:
        raise ConnectionError("redis недоступен")

    async def get(self, *args: object, **kwargs: object) -> None:
        raise ConnectionError("redis недоступен")

    async def set(self, *args: object, **kwargs: object) -> None:
        raise ConnectionError("redis недоступен")


@pytest.fixture
def broken_redis() -> BrokenRedis:
    return BrokenRedis()


@pytest.fixture
def app(
    engine: AsyncEngine,
    db_session_factory: async_sessionmaker[AsyncSession],
    redis_client: FakeAsyncRedis,
) -> FastAPI:
    app = create_app()
    # ASGITransport не запускает lifespan, поэтому состояние приложения выставляем вручную
    app.state.engine = engine
    app.state.session_factory = db_session_factory
    app.state.redis = redis_client
    return app


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client


MakeHeaders = Callable[[str], Awaitable[dict[str, str]]]


@pytest.fixture
def make_headers(client: AsyncClient) -> MakeHeaders:
    """Фабрика: регистрирует пользователя с данным email и возвращает заголовок Authorization."""

    async def _make(email: str) -> dict[str, str]:
        registered = await client.post(
            "/api/v1/auth/register", json={"email": email, "password": DEFAULT_PASSWORD}
        )
        assert registered.status_code == 201, registered.text
        login = await client.post(
            "/api/v1/auth/login", data={"username": email, "password": DEFAULT_PASSWORD}
        )
        assert login.status_code == 200, login.text
        return {"Authorization": f"Bearer {login.json()['access_token']}"}

    return _make


@pytest.fixture
async def auth_headers(make_headers: MakeHeaders) -> dict[str, str]:
    return await make_headers("alice@idealday.app")


@pytest.fixture
def set_now(app: FastAPI) -> Callable[[datetime], None]:
    """Фиксирует «текущий момент» приложения (aware datetime): «сегодня» не плавает."""

    def _set(moment: datetime) -> None:
        app.dependency_overrides[get_clock] = lambda: lambda: moment

    return _set
