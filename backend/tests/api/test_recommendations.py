import json
from collections.abc import Callable
from datetime import UTC, datetime

import pytest
from fakeredis import FakeAsyncRedis
from fastapi import FastAPI
from httpx import AsyncClient

from app.schemas.biorhythm import DISCLAIMER
from app.services import reports

PATH = "/api/v1/recommendations"
PROFILE = "/api/v1/profile"


async def put_profile(client: AsyncClient, headers: dict[str, str], **data: str) -> None:
    payload = {"birth_date": "2000-01-01", "chronotype": "owl", "timezone": "Asia/Tokyo", **data}
    response = await client.put(PROFILE, headers=headers, json=payload)
    assert response.status_code == 200, response.text


@pytest.fixture
async def headers(client: AsyncClient, auth_headers: dict[str, str]) -> dict[str, str]:
    await put_profile(client, auth_headers)
    return auth_headers


async def test_recommendations_require_authentication(client: AsyncClient) -> None:
    response = await client.get(PATH)

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


async def test_recommendations_require_profile(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    response = await client.get(PATH, headers=auth_headers)

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "PROFILE_NOT_FOUND"


async def test_recommendations_for_explicit_date(
    client: AsyncClient, headers: dict[str, str]
) -> None:
    response = await client.get(PATH, headers=headers, params={"date": "2000-01-01"})

    assert response.status_code == 200
    body = response.json()
    assert body["date"] == "2000-01-01"
    assert body["chronotype"] == "owl"
    assert body["critical_level"] == "triple"
    assert body["rest_recommended"] is True
    assert body["summary"]
    assert body["disclaimer"] == DISCLAIMER
    assert body["focus_windows"] == [
        {"task_type": "routine", "start_hour": 9, "end_hour": 24, "score": 1.0}
    ]
    assert [warning["code"] for warning in body["warnings"]] == [
        "CRITICAL_PHYSICAL",
        "CRITICAL_EMOTIONAL",
        "CRITICAL_INTELLECTUAL",
        "TRIPLE_CRITICAL",
    ]
    assert body["warnings"][-1]["severity"] == "critical"
    assert all(warning["message"] for warning in body["warnings"])


async def test_local_today_and_explicit_date_share_cache(
    client: AsyncClient,
    headers: dict[str, str],
    set_now: Callable[[datetime], None],
    redis_client: FakeAsyncRedis,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    set_now(datetime(2026, 11, 15, 23, 30, tzinfo=UTC))
    first = await client.get(PATH, headers=headers)

    assert first.status_code == 200
    assert first.json()["date"] == "2026-11-16"
    key = "rec:v1:2000-01-01:owl:2026-11-16"
    cached = await redis_client.get(key)
    assert cached is not None
    assert json.loads(cached) == first.json()
    assert 0 < await redis_client.ttl(key) <= 86400

    def unexpected_compute(*args: object) -> None:
        pytest.fail("Расчёт вызван при попадании в кэш")

    monkeypatch.setattr(reports, "recommendation_report", unexpected_compute)
    second = await client.get(PATH, headers=headers, params={"date": "2026-11-16"})

    assert second.status_code == 200
    assert second.json() == first.json()


@pytest.mark.parametrize("invalid_date", ["", "never", "2026-02-29", "20261115", "0"])
async def test_recommendations_reject_invalid_date(
    client: AsyncClient, headers: dict[str, str], invalid_date: str
) -> None:
    response = await client.get(PATH, headers=headers, params={"date": invalid_date})

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["query", "date"]


async def test_recommendations_reject_date_before_birth(
    client: AsyncClient, headers: dict[str, str]
) -> None:
    response = await client.get(PATH, headers=headers, params={"date": "1999-12-31"})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "DATE_BEFORE_BIRTH"


async def test_changing_chronotype_uses_new_cache_key(
    client: AsyncClient, headers: dict[str, str], redis_client: FakeAsyncRedis
) -> None:
    params = {"date": "2024-09-11"}
    before = await client.get(PATH, headers=headers, params=params)
    await put_profile(client, headers, chronotype="lark")
    after = await client.get(PATH, headers=headers, params=params)

    assert before.status_code == after.status_code == 200
    assert after.json()["chronotype"] == "lark"
    assert before.json()["focus_windows"] != after.json()["focus_windows"]
    assert set(await redis_client.keys("rec:*")) == {
        "rec:v1:2000-01-01:owl:2024-09-11",
        "rec:v1:2000-01-01:lark:2024-09-11",
    }


async def test_recommendations_work_when_redis_is_down(
    client: AsyncClient, headers: dict[str, str], app: FastAPI, broken_redis
) -> None:
    params = {"date": "2024-09-11"}
    with_cache = await client.get(PATH, headers=headers, params=params)
    app.state.redis = broken_redis

    without_cache = await client.get(PATH, headers=headers, params=params)

    assert with_cache.status_code == without_cache.status_code == 200
    assert without_cache.json() == with_cache.json()
