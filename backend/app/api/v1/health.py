import asyncio
import logging

from fastapi import APIRouter, Depends, Response, status
from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.deps import get_engine, get_redis
from app.schemas.health import ComponentStatus, HealthComponents, HealthResponse

logger = logging.getLogger(__name__)
router = APIRouter(tags=["health"])

DB_CHECK_TIMEOUT = 2.0
REDIS_CHECK_TIMEOUT = 1.0


async def _check_database(engine: AsyncEngine) -> ComponentStatus:
    try:
        async with asyncio.timeout(DB_CHECK_TIMEOUT):
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
        return "ok"
    except Exception:
        logger.warning("Health: проверка БД не пройдена", exc_info=True)
        return "unavailable"


async def _check_redis(redis: Redis) -> ComponentStatus:
    try:
        async with asyncio.timeout(REDIS_CHECK_TIMEOUT):
            await redis.ping()
        return "ok"
    except Exception:
        logger.warning("Health: проверка Redis не пройдена", exc_info=True)
        return "unavailable"


@router.get("/health", response_model=HealthResponse)
async def health(
    response: Response,
    engine: AsyncEngine = Depends(get_engine),
    redis: Redis = Depends(get_redis),
) -> HealthResponse:
    """БД критична (без неё 503), Redis — нет: без кэша сервис работает, статус `degraded`."""
    database = await _check_database(engine)
    redis_status = await _check_redis(redis)

    if database != "ok":
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        overall = "down"
    elif redis_status != "ok":
        overall = "degraded"
    else:
        overall = "ok"

    return HealthResponse(
        status=overall,
        components=HealthComponents(database=database, redis=redis_status),
    )
