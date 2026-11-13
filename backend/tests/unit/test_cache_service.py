import asyncio
import time
from datetime import date

import pytest
from fakeredis import FakeAsyncRedis, FakeServer
from pydantic import BaseModel

from app.services.cache import CACHE_VERSION, CacheService, biorhythm_key, critical_key


class Item(BaseModel):
    name: str
    values: list[int]


ITEM = Item(name="x", values=[1, 2, 3])
KEY = "test:key"


class Counter:
    """compute-функция, которая считает свои вызовы."""

    def __init__(self, value: Item = ITEM) -> None:
        self.value = value
        self.calls = 0

    def __call__(self) -> Item:
        self.calls += 1
        return self.value


class FailingRedis:
    def __init__(self, *, fail_get: bool = True, fail_set: bool = True) -> None:
        self.fail_get = fail_get
        self.fail_set = fail_set
        self.get_calls = 0
        self.set_calls = 0

    async def get(self, key: str) -> None:
        self.get_calls += 1
        if self.fail_get:
            raise ConnectionError("redis недоступен")
        return None

    async def set(self, key: str, value: str, ex: int | None = None) -> None:
        self.set_calls += 1
        if self.fail_set:
            raise ConnectionError("redis недоступен")


class HangingRedis:
    async def get(self, key: str) -> None:
        await asyncio.sleep(10)

    async def set(self, key: str, value: str, ex: int | None = None) -> None:
        await asyncio.sleep(10)


@pytest.fixture
def redis() -> FakeAsyncRedis:
    return FakeAsyncRedis(server=FakeServer(), decode_responses=True)


def make_cache(
    redis, *, enabled: bool = True, ttl: int = 60, timeout: float = 0.2
) -> CacheService:
    return CacheService(redis, enabled=enabled, default_ttl=ttl, timeout=timeout)


# ---------- обычная работа ----------


async def test_miss_computes_and_stores(redis: FakeAsyncRedis) -> None:
    compute = Counter()

    result = await make_cache(redis).get_or_compute(KEY, Item, compute)

    assert result == ITEM
    assert compute.calls == 1
    assert await redis.get(KEY) == ITEM.model_dump_json()
    assert 0 < await redis.ttl(KEY) <= 60


async def test_hit_does_not_call_compute(redis: FakeAsyncRedis) -> None:
    cache = make_cache(redis)
    compute = Counter()

    first = await cache.get_or_compute(KEY, Item, compute)
    second = await cache.get_or_compute(KEY, Item, compute)

    assert compute.calls == 1
    assert first == second == ITEM
    assert isinstance(second, Item)


async def test_custom_ttl_overrides_default(redis: FakeAsyncRedis) -> None:
    await make_cache(redis, ttl=60).get_or_compute(KEY, Item, Counter(), ttl=5)

    assert 0 < await redis.ttl(KEY) <= 5


async def test_different_keys_are_independent(redis: FakeAsyncRedis) -> None:
    cache = make_cache(redis)
    other = Item(name="y", values=[])

    first = await cache.get_or_compute("k1", Item, Counter(ITEM))
    second = await cache.get_or_compute("k2", Item, Counter(other))

    assert (first, second) == (ITEM, other)


async def test_disabled_cache_never_touches_redis() -> None:
    redis = FailingRedis()
    compute = Counter()

    result = await make_cache(redis, enabled=False).get_or_compute(KEY, Item, compute)

    assert result == ITEM
    assert (redis.get_calls, redis.set_calls) == (0, 0)


# ---------- мягкая деградация ----------


async def test_read_failure_computes_and_skips_write() -> None:
    redis = FailingRedis(fail_get=True)
    compute = Counter()

    result = await make_cache(redis).get_or_compute(KEY, Item, compute)

    assert result == ITEM
    assert compute.calls == 1
    assert (redis.get_calls, redis.set_calls) == (1, 0)  # запись пропущена: Redis не отвечает


async def test_write_failure_still_returns_value() -> None:
    redis = FailingRedis(fail_get=False, fail_set=True)

    result = await make_cache(redis).get_or_compute(KEY, Item, Counter())

    assert result == ITEM
    assert redis.set_calls == 1


async def test_hanging_redis_is_cut_by_timeout() -> None:
    cache = make_cache(HangingRedis(), timeout=0.05)
    started = time.monotonic()

    result = await cache.get_or_compute(KEY, Item, Counter())

    assert result == ITEM
    assert time.monotonic() - started < 1.0


async def test_corrupted_entry_is_recomputed_and_overwritten(redis: FakeAsyncRedis) -> None:
    await redis.set(KEY, "{not json")
    compute = Counter()

    result = await make_cache(redis).get_or_compute(KEY, Item, compute)

    assert result == ITEM
    assert compute.calls == 1
    assert await redis.get(KEY) == ITEM.model_dump_json()


async def test_entry_with_outdated_schema_is_treated_as_miss(redis: FakeAsyncRedis) -> None:
    await redis.set(KEY, '{"name": "x"}')  # нет обязательного поля values
    compute = Counter()

    result = await make_cache(redis).get_or_compute(KEY, Item, compute)

    assert result == ITEM
    assert compute.calls == 1


# ---------- ключи ----------


def test_biorhythm_key_format() -> None:
    key = biorhythm_key(date(2000, 1, 1), date(2026, 11, 15), date(2026, 11, 21))

    assert key == f"bio:{CACHE_VERSION}:2000-01-01:2026-11-15:2026-11-21"


def test_critical_key_format() -> None:
    key = critical_key(date(2000, 1, 1), date(2026, 11, 15), date(2026, 11, 21))

    assert key == f"crit:{CACHE_VERSION}:2000-01-01:2026-11-15:2026-11-21"


def test_keys_differ_by_every_argument_and_kind() -> None:
    base = (date(2000, 1, 1), date(2026, 11, 15), date(2026, 11, 21))
    keys = {
        biorhythm_key(*base),
        critical_key(*base),
        biorhythm_key(date(2000, 1, 2), base[1], base[2]),
        biorhythm_key(base[0], date(2026, 11, 14), base[2]),
        biorhythm_key(base[0], base[1], date(2026, 11, 22)),
    }

    assert len(keys) == 5


def test_keys_do_not_contain_user_identifiers() -> None:
    # Ключ зависит только от даты рождения и периода: кэш общий для всех пользователей
    key = biorhythm_key(date(2000, 1, 1), date(2026, 11, 15), date(2026, 11, 15))

    assert key.count(":") == 4
