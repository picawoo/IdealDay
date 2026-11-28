from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import create_async_engine


class BrokenRedis:
    async def ping(self) -> bool:
        raise ConnectionError("redis недоступен")


async def test_health_ok(client: AsyncClient) -> None:
    response = await client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "components": {"database": "ok", "redis": "ok"},
    }


async def test_health_degraded_when_redis_is_down(app: FastAPI, client: AsyncClient) -> None:
    app.state.redis = BrokenRedis()

    response = await client.get("/api/v1/health")

    # Redis не критичен: сервис работает без кэша, поэтому 200, но статус degraded
    assert response.status_code == 200
    assert response.json() == {
        "status": "degraded",
        "components": {"database": "ok", "redis": "unavailable"},
    }


async def test_health_down_when_database_is_down(app: FastAPI, client: AsyncClient) -> None:
    app.state.engine = create_async_engine("postgresql+asyncpg://x:x@127.0.0.1:1/x")

    response = await client.get("/api/v1/health")

    assert response.status_code == 503
    assert response.json() == {
        "status": "down",
        "components": {"database": "unavailable", "redis": "ok"},
    }

    await app.state.engine.dispose()


async def test_openapi_is_available(client: AsyncClient) -> None:
    response = await client.get("/openapi.json")

    assert response.status_code == 200
    assert "/api/v1/health" in response.json()["paths"]
