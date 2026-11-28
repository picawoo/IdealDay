from collections.abc import Awaitable, Callable
from datetime import UTC, date, datetime, timedelta

import pytest
from httpx import AsyncClient

from app.schemas.biorhythm import DISCLAIMER

TODAY = "/api/v1/biorhythms/today"
PERIOD = "/api/v1/biorhythms"
CRITICAL = "/api/v1/biorhythms/critical-days"
PROFILE = "/api/v1/profile"

SetNow = Callable[[datetime], None]
MakeHeaders = Callable[[str], Awaitable[dict[str, str]]]


def moment(year: int, month: int, day: int, hour: int = 12, minute: int = 0) -> datetime:
    return datetime(year, month, day, hour, minute, tzinfo=UTC)


async def put_profile(client: AsyncClient, headers: dict[str, str], **data: str) -> None:
    payload = {"birth_date": "2000-01-01", **data}
    response = await client.put(PROFILE, headers=headers, json=payload)
    assert response.status_code == 200, response.text


@pytest.fixture
async def headers(client: AsyncClient, auth_headers: dict[str, str]) -> dict[str, str]:
    """Пользователь с профилем: дата рождения 2000-01-01, часовой пояс UTC."""
    await put_profile(client, auth_headers)
    return auth_headers


# ---------- общее: доступ ----------


@pytest.mark.parametrize("path", [TODAY, f"{PERIOD}?date_from=2026-11-15&date_to=2026-11-16"])
async def test_endpoints_require_token(client: AsyncClient, path: str) -> None:
    response = await client.get(path)

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


@pytest.mark.parametrize(
    "path",
    [
        TODAY,
        f"{PERIOD}?date_from=2026-11-15&date_to=2026-11-16",
        f"{CRITICAL}?date_from=2026-11-15&date_to=2026-11-16",
    ],
)
async def test_endpoints_require_profile(
    client: AsyncClient, auth_headers: dict[str, str], path: str
) -> None:
    response = await client.get(path, headers=auth_headers)

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "PROFILE_NOT_FOUND"


# ---------- today ----------


async def test_today_returns_known_values(
    client: AsyncClient, headers: dict[str, str], set_now: SetNow
) -> None:
    set_now(moment(2026, 11, 15))

    response = await client.get(TODAY, headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["date"] == "2026-11-15"
    assert [c["cycle"] for c in body["cycles"]] == ["physical", "emotional", "intellectual"]
    assert [c["period"] for c in body["cycles"]] == [23, 28, 33]
    assert [c["day_in_cycle"] for c in body["cycles"]] == [17, 15, 14]
    assert [c["percent"] for c in body["cycles"]] == [-100, -22, 46]
    assert [c["value"] for c in body["cycles"]] == [-0.9977, -0.2225, 0.4582]
    assert [c["sign"] for c in body["cycles"]] == ["negative", "negative", "positive"]
    assert [c["trend"] for c in body["cycles"]] == ["falling"] * 3
    assert body["critical"] == {"level": "none", "cycles": []}
    assert body["disclaimer"] == DISCLAIMER


@pytest.mark.parametrize(
    ("timezone", "expected"),
    [("Asia/Tokyo", "2026-11-16"), ("America/New_York", "2026-11-15"), ("UTC", "2026-11-15")],
)
async def test_today_uses_profile_timezone(
    client: AsyncClient,
    auth_headers: dict[str, str],
    set_now: SetNow,
    timezone: str,
    expected: str,
) -> None:
    await put_profile(client, auth_headers, timezone=timezone)
    set_now(moment(2026, 11, 15, 23, 30))

    response = await client.get(TODAY, headers=auth_headers)

    assert response.json()["date"] == expected


async def test_today_single_critical_day(
    client: AsyncClient, headers: dict[str, str], set_now: SetNow
) -> None:
    set_now(moment(2000, 1, 12))  # t = 11

    body = (await client.get(TODAY, headers=headers)).json()

    assert body["critical"] == {
        "level": "single",
        "cycles": [{"cycle": "physical", "transition": "positive_to_negative"}],
    }


async def test_today_triple_critical_day_on_birth_date(
    client: AsyncClient, headers: dict[str, str], set_now: SetNow
) -> None:
    set_now(moment(2000, 1, 1))  # t = 0

    body = (await client.get(TODAY, headers=headers)).json()

    assert body["critical"]["level"] == "triple"
    assert len(body["critical"]["cycles"]) == 3
    assert [c["percent"] for c in body["cycles"]] == [0, 0, 0]
    assert [c["sign"] for c in body["cycles"]] == ["zero"] * 3


async def test_today_before_birth_is_rejected(
    client: AsyncClient, headers: dict[str, str], set_now: SetNow
) -> None:
    set_now(moment(1999, 12, 31))

    response = await client.get(TODAY, headers=headers)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "DATE_BEFORE_BIRTH"


async def test_different_users_get_their_own_values(
    client: AsyncClient, make_headers: MakeHeaders, set_now: SetNow
) -> None:
    alice = await make_headers("alice@idealday.app")
    bob = await make_headers("bob@idealday.app")
    await put_profile(client, alice, birth_date="2000-01-01")
    await put_profile(client, bob, birth_date="1985-06-15")
    set_now(moment(2026, 11, 15))

    alice_today = (await client.get(TODAY, headers=alice)).json()
    bob_today = (await client.get(TODAY, headers=bob)).json()

    assert alice_today["cycles"] != bob_today["cycles"]
    assert [c["percent"] for c in alice_today["cycles"]] == [-100, -22, 46]


# ---------- period ----------


async def test_period_returns_all_days_with_critical_marks(
    client: AsyncClient, headers: dict[str, str]
) -> None:
    response = await client.get(
        PERIOD, headers=headers, params={"date_from": "2026-11-15", "date_to": "2026-11-21"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["date_from"] == "2026-11-15"
    assert body["date_to"] == "2026-11-21"
    assert [d["date"] for d in body["days"]] == [
        (date(2026, 11, 15) + timedelta(days=i)).isoformat() for i in range(7)
    ]
    assert all(len(d["cycles"]) == 3 for d in body["days"])
    assert body["days"][0]["cycles"][0]["percent"] == -100  # 15 ноября совпадает с /today
    levels = {d["date"]: d["critical"]["level"] for d in body["days"]}
    assert levels["2026-11-17"] == "single"  # интеллектуальный цикл
    assert levels["2026-11-21"] == "single"  # физический цикл
    assert levels["2026-11-16"] == "none"
    assert body["disclaimer"] == DISCLAIMER


async def test_period_of_single_day(client: AsyncClient, headers: dict[str, str]) -> None:
    response = await client.get(
        PERIOD, headers=headers, params={"date_from": "2026-11-15", "date_to": "2026-11-15"}
    )

    assert response.status_code == 200
    assert len(response.json()["days"]) == 1


# ---------- critical-days ----------


async def test_critical_days_for_known_period(
    client: AsyncClient, headers: dict[str, str]
) -> None:
    response = await client.get(
        CRITICAL, headers=headers, params={"date_from": "2026-11-15", "date_to": "2026-11-29"}
    )

    assert response.status_code == 200
    body = response.json()
    assert [d["date"] for d in body["critical_days"]] == ["2026-11-17", "2026-11-21", "2026-11-28"]
    assert body["critical_days"][0] == {
        "date": "2026-11-17",
        "level": "single",
        "cycles": [{"cycle": "intellectual", "transition": "positive_to_negative"}],
    }
    assert body["disclaimer"] == DISCLAIMER


async def test_critical_days_empty_when_none(client: AsyncClient, headers: dict[str, str]) -> None:
    response = await client.get(
        CRITICAL, headers=headers, params={"date_from": "2026-11-15", "date_to": "2026-11-16"}
    )

    assert response.status_code == 200
    assert response.json()["critical_days"] == []


async def test_critical_days_include_birth_date_as_triple(
    client: AsyncClient, headers: dict[str, str]
) -> None:
    response = await client.get(
        CRITICAL, headers=headers, params={"date_from": "2000-01-01", "date_to": "2000-01-03"}
    )

    assert response.status_code == 200
    first = response.json()["critical_days"][0]
    assert (first["date"], first["level"]) == ("2000-01-01", "triple")


# ---------- валидация периода (одинаковая для обоих эндпоинтов) ----------


@pytest.mark.parametrize("path", [PERIOD, CRITICAL])
async def test_period_boundaries(client: AsyncClient, headers: dict[str, str], path: str) -> None:
    start = date(2026, 1, 1)
    last_valid = start + timedelta(days=91)  # 92-й день включительно
    first_invalid = start + timedelta(days=92)  # 93-й день

    ok = await client.get(
        path,
        headers=headers,
        params={"date_from": start.isoformat(), "date_to": last_valid.isoformat()},
    )
    too_long = await client.get(
        path,
        headers=headers,
        params={"date_from": start.isoformat(), "date_to": first_invalid.isoformat()},
    )

    assert ok.status_code == 200  # ровно 92 дня
    assert too_long.status_code == 422  # 93 дня
    assert too_long.json()["error"]["code"] == "PERIOD_TOO_LONG"


@pytest.mark.parametrize("path", [PERIOD, CRITICAL])
async def test_reversed_period_is_rejected(
    client: AsyncClient, headers: dict[str, str], path: str
) -> None:
    response = await client.get(
        path, headers=headers, params={"date_from": "2026-11-21", "date_to": "2026-11-15"}
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_PERIOD"


@pytest.mark.parametrize("path", [PERIOD, CRITICAL])
async def test_period_before_birth_is_rejected(
    client: AsyncClient, headers: dict[str, str], path: str
) -> None:
    response = await client.get(
        path, headers=headers, params={"date_from": "1999-12-31", "date_to": "2000-01-02"}
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "DATE_BEFORE_BIRTH"


@pytest.mark.parametrize("path", [PERIOD, CRITICAL])
@pytest.mark.parametrize(
    "params",
    [
        {},
        {"date_from": "2026-11-15"},
        {"date_to": "2026-11-15"},
        {"date_from": "not-a-date", "date_to": "2026-11-15"},
        {"date_from": "2026-13-45", "date_to": "2026-11-15"},
    ],
)
async def test_invalid_or_missing_params_are_rejected(
    client: AsyncClient, headers: dict[str, str], path: str, params: dict[str, str]
) -> None:
    response = await client.get(path, headers=headers, params=params)

    assert response.status_code == 422
