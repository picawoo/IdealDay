import asyncio
import logging
from collections.abc import Callable
from datetime import date

from pydantic import BaseModel, ValidationError
from redis.asyncio import Redis

logger = logging.getLogger(__name__)

CACHE_VERSION = "v1"


def biorhythm_key(birth_date: date, date_from: date, date_to: date) -> str:
    """Циклы на период. День — это период из одной даты (так же кэшируется /today)."""
    return f"bio:{CACHE_VERSION}:{birth_date}:{date_from}:{date_to}"


def critical_key(birth_date: date, date_from: date, date_to: date) -> str:
    return f"crit:{CACHE_VERSION}:{birth_date}:{date_from}:{date_to}"


class CacheService:
    def __init__(self, redis: Redis, *, enabled: bool, default_ttl: int, timeout: float) -> None:
        self._redis = redis
        self._enabled = enabled
        self._default_ttl = default_ttl
        self._timeout = timeout

    async def get_or_compute[M: BaseModel](
        self,
        key: str,
        model: type[M],
        compute: Callable[[], M],
        ttl: int | None = None,
    ) -> M:
        """Значение из кэша или результат compute() с записью в кэш.

        Ключ должен однозначно определяться аргументами compute: ответы не зависят от
        пользователя и текущего времени, поэтому ручная инвалидация не нужна.
        """
        if not self._enabled:
            return compute()

        try:
            async with asyncio.timeout(self._timeout):
                raw = await self._redis.get(key)
        except Exception as exc:
            logger.warning("Кэш недоступен при чтении %s: %r. Считаем заново", key, exc)
            return compute()

        if raw is not None:
            try:
                return model.model_validate_json(raw)
            except ValidationError:
                logger.warning("Некорректная запись кэша %s, пересчитываем", key)

        value = compute()
        try:
            async with asyncio.timeout(self._timeout):
                await self._redis.set(key, value.model_dump_json(), ex=ttl or self._default_ttl)
        except Exception as exc:
            logger.warning("Не удалось записать в кэш %s: %r", key, exc)
        return value
