from collections.abc import Awaitable, Callable
from datetime import UTC, datetime

import pytest
from fakeredis import FakeAsyncRedis
from httpx import AsyncClient

from app.services import reports

PERIOD = "/api/v1/biorhythms"
CRITICAL = "/api/v1/biorhythms/critical-days"
TODAY = "/api/v1/biorhythms/today"
PROFILE = "/api/v1/profile"

PARAMS = {"date_from": "2026-11-15", "date_to": "2026-11-21"}
PERIOD_KEY = "bio:v1:2000-01-01:2026-11-15:2026-11-21"
CRITICAL_KEY = "crit:v1:2000-01-01:2026-11-15:2026-11-21"

MakeHeaders = Callable[[str], Awaitable[dict[str, str]]]


async def put_profile(client: AsyncClient, headers: dict[str, str], birth_date: str) -> None:
    response = await client.put(PROFILE, headers=headers, json={"birth_date": birth_date})
    assert response.status_code == 200, response.text


@pytest.fixture
async def headers(client: AsyncClient, auth_headers: dict[str, str]) -> dict[str, str]:
    await put_profile(client, auth_headers, "2000-01-01")
    return auth_headers


@pytest.fixture
def period_calls(monkeypatch: pytest.MonkeyPatch) -> list[tuple]:
    """Журнал вызовов расчёта периода: видно, сколько раз ответ считали, а не брали из кэша."""
    calls: list[tuple] = []
    original = reports.period_report

    def counting(*args, **kwargs):
        calls.append(args)
        return original(*args, **kwargs)

    monkeypatch.setattr(reports, "period_report", counting)
    return calls


@pytest.fixture
def critical_calls(monkeypatch: pytest.MonkeyPatch) -> list[tuple]:
    calls: list[tuple] = []
    original = reports.critical_report

    def counting(*args, **kwargs):
        calls.append(args)
        return original(*args, **kwargs)

    monkeypatch.setattr(reports, "critical_report", counting)
    return calls


# ---------- период ----------


async def test_period_second_request_is_served_from_cache(
    client: AsyncClient, headers: dict[str, str], period_calls: list[tuple]
) -> None:
    first = await client.get(PERIOD, headers=headers, params=PARAMS)
    second = await client.get(PERIOD, headers=headers, params=PARAMS)

    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()
    assert len(period_calls) == 1


async def test_period_is_stored_in_redis_with_ttl(
    client: AsyncClient, headers: dict[str, str], redis_client: FakeAsyncRedis
) -> None:
    await client.get(PERIOD, headers=headers, params=PARAMS)

    assert await redis_client.get(PERIOD_KEY) is not None
    assert 0 < await redis_client.ttl(PERIOD_KEY) <= 86400


async def test_other_period_is_computed_separately(
    client: AsyncClient, headers: dict[str, str], period_calls: list[tuple]
) -> None:
    await client.get(PERIOD, headers=headers, params=PARAMS)
    await client.get(PERIOD, headers=headers, params={**PARAMS, "date_to": "2026-11-22"})

    assert len(period_calls) == 2


async def test_cached_response_is_identical_to_computed_one(
    client: AsyncClient, headers: dict[str, str]
) -> None:
    computed = await client.get(PERIOD, headers=headers, params=PARAMS)
    cached = await client.get(PERIOD, headers=headers, params=PARAMS)

    assert cached.json() == computed.json()
    assert cached.json()["disclaimer"]
    assert cached.json()["days"][0]["cycles"][0]["percent"] == -100


# ---------- критические дни ----------


async def test_critical_days_are_cached_separately(
    client: AsyncClient,
    headers: dict[str, str],
    critical_calls: list[tuple],
    redis_client: FakeAsyncRedis,
) -> None:
    first = await client.get(CRITICAL, headers=headers, params=PARAMS)
    second = await client.get(CRITICAL, headers=headers, params=PARAMS)

    assert first.json() == second.json()
    assert len(critical_calls) == 1
    assert await redis_client.get(CRITICAL_KEY) is not None
    assert await redis_client.get(PERIOD_KEY) is None  # разные ключи для разных эндпоинтов


# ---------- today ----------


async def test_today_shares_cache_with_single_day_period(
    client: AsyncClient,
    headers: dict[str, str],
    set_now: Callable[[datetime], None],
    period_calls: list[tuple],
) -> None:
    set_now(datetime(2026, 11, 15, 12, 0, tzinfo=UTC))

    one_day = {"date_from": "2026-11-15", "date_to": "2026-11-15"}
    await client.get(PERIOD, headers=headers, params=one_day)
    today = await client.get(TODAY, headers=headers)

    assert today.status_code == 200
    assert today.json()["date"] == "2026-11-15"
    assert len(period_calls) == 1  # /today взял запись, созданную запросом периода


async def test_today_matches_uncached_and_cached(
    client: AsyncClient, headers: dict[str, str], set_now: Callable[[datetime], None]
) -> None:
    set_now(datetime(2026, 11, 15, 12, 0, tzinfo=UTC))

    first = await client.get(TODAY, headers=headers)
    second = await client.get(TODAY, headers=headers)

    assert first.json() == second.json()
    assert [c["percent"] for c in second.json()["cycles"]] == [-100, -22, 46]
    assert second.json()["disclaimer"]


# ---------- изменение профиля и общий кэш ----------


async def test_changing_birth_date_does_not_return_stale_data(
    client: AsyncClient, headers: dict[str, str], period_calls: list[tuple]
) -> None:
    before = await client.get(PERIOD, headers=headers, params=PARAMS)
    await put_profile(client, headers, "1990-05-17")
    after = await client.get(PERIOD, headers=headers, params=PARAMS)

    assert before.json()["days"] != after.json()["days"]
    assert len(period_calls) == 2  # ключ содержит дату рождения, поэтому инвалидация не нужна


async def test_users_with_same_birth_date_share_cache(
    client: AsyncClient, make_headers: MakeHeaders, period_calls: list[tuple]
) -> None:
    alice = await make_headers("alice@idealday.app")
    bob = await make_headers("bob@idealday.app")
    await put_profile(client, alice, "2000-01-01")
    await put_profile(client, bob, "2000-01-01")

    await client.get(PERIOD, headers=alice, params=PARAMS)
    await client.get(PERIOD, headers=bob, params=PARAMS)

    assert len(period_calls) == 1


async def test_users_with_different_birth_dates_do_not_share_cache(
    client: AsyncClient, make_headers: MakeHeaders
) -> None:
    alice = await make_headers("alice@idealday.app")
    bob = await make_headers("bob@idealday.app")
    await put_profile(client, alice, "2000-01-01")
    await put_profile(client, bob, "1985-06-15")

    alice_period = await client.get(PERIOD, headers=alice, params=PARAMS)
    bob_period = await client.get(PERIOD, headers=bob, params=PARAMS)

    assert alice_period.json()["days"] != bob_period.json()["days"]


# ---------- Redis недоступен ----------


@pytest.mark.parametrize("path", [PERIOD, CRITICAL])
async def test_endpoints_work_when_redis_is_down(
    client: AsyncClient, headers: dict[str, str], app, broken_redis, path: str
) -> None:
    app.state.redis = broken_redis

    response = await client.get(path, headers=headers, params=PARAMS)

    assert response.status_code == 200


async def test_today_works_when_redis_is_down(
    client: AsyncClient,
    headers: dict[str, str],
    app,
    broken_redis,
    set_now: Callable[[datetime], None],
) -> None:
    app.state.redis = broken_redis
    set_now(datetime(2026, 11, 15, 12, 0, tzinfo=UTC))

    response = await client.get(TODAY, headers=headers)

    assert response.status_code == 200
    assert [c["percent"] for c in response.json()["cycles"]] == [-100, -22, 46]


async def test_data_is_correct_without_cache_and_with_it(
    client: AsyncClient, headers: dict[str, str], app, broken_redis, redis_client: FakeAsyncRedis
) -> None:
    app.state.redis = broken_redis
    without_cache = await client.get(PERIOD, headers=headers, params=PARAMS)
    app.state.redis = redis_client
    with_cache = await client.get(PERIOD, headers=headers, params=PARAMS)

    assert without_cache.json() == with_cache.json()
