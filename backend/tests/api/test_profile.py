from collections.abc import Awaitable, Callable
from datetime import date, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.profile import UserProfile

PROFILE = "/api/v1/profile"


async def test_get_profile_before_creation_returns_404(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    response = await client.get(PROFILE, headers=auth_headers)

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "PROFILE_NOT_FOUND"


async def test_put_creates_profile(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    response = await client.put(
        PROFILE,
        headers=auth_headers,
        json={"birth_date": "2000-01-01", "chronotype": "owl", "timezone": "Europe/Moscow"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["birth_date"] == "2000-01-01"
    assert body["chronotype"] == "owl"
    assert body["timezone"] == "Europe/Moscow"
    assert body["created_at"]
    assert body["updated_at"]


async def test_put_applies_defaults(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    response = await client.put(PROFILE, headers=auth_headers, json={"birth_date": "2000-01-01"})

    assert response.status_code == 200
    assert response.json()["chronotype"] == "dove"
    assert response.json()["timezone"] == "UTC"


async def test_get_returns_saved_profile(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    await client.put(
        PROFILE, headers=auth_headers, json={"birth_date": "1995-07-20", "chronotype": "lark"}
    )

    response = await client.get(PROFILE, headers=auth_headers)

    assert response.status_code == 200
    assert response.json()["birth_date"] == "1995-07-20"
    assert response.json()["chronotype"] == "lark"


async def test_put_twice_updates_the_same_profile(
    client: AsyncClient,
    auth_headers: dict[str, str],
    db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    first = await client.put(
        PROFILE, headers=auth_headers, json={"birth_date": "2000-01-01", "chronotype": "dove"}
    )
    second = await client.put(
        PROFILE,
        headers=auth_headers,
        json={"birth_date": "1999-12-31", "chronotype": "owl", "timezone": "Asia/Tokyo"},
    )

    assert second.status_code == 200
    assert second.json()["birth_date"] == "1999-12-31"
    assert second.json()["chronotype"] == "owl"
    assert second.json()["timezone"] == "Asia/Tokyo"
    assert second.json()["created_at"] == first.json()["created_at"]
    assert second.json()["updated_at"] >= first.json()["updated_at"]

    async with db_session_factory() as session:
        count = await session.scalar(select(func.count()).select_from(UserProfile))
    assert count == 1


async def test_put_is_full_replace_not_patch(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    await client.put(
        PROFILE,
        headers=auth_headers,
        json={"birth_date": "2000-01-01", "chronotype": "owl", "timezone": "Asia/Tokyo"},
    )

    response = await client.put(PROFILE, headers=auth_headers, json={"birth_date": "2000-01-01"})

    # Пропущенные поля вернулись к значениям по умолчанию
    assert response.json()["chronotype"] == "dove"
    assert response.json()["timezone"] == "UTC"


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"birth_date": "1899-12-31"},
        {"birth_date": (date.today() + timedelta(days=2)).isoformat()},
        {"birth_date": "not-a-date"},
        {"birth_date": "2000-01-01", "chronotype": "hawk"},
        {"birth_date": "2000-01-01", "timezone": "Mars/Olympus"},
    ],
)
async def test_put_validation_errors(
    client: AsyncClient, auth_headers: dict[str, str], payload: dict[str, str]
) -> None:
    response = await client.put(PROFILE, headers=auth_headers, json=payload)

    assert response.status_code == 422


async def test_put_without_token_is_unauthorized(client: AsyncClient) -> None:
    response = await client.put(PROFILE, json={"birth_date": "2000-01-01"})

    assert response.status_code == 401


async def test_profiles_are_isolated_between_users(
    client: AsyncClient, make_headers: Callable[[str], Awaitable[dict[str, str]]]
) -> None:
    alice = await make_headers("alice@idealday.app")
    bob = await make_headers("bob@idealday.app")
    await client.put(
        PROFILE, headers=alice, json={"birth_date": "2000-01-01", "chronotype": "owl"}
    )

    bob_view = await client.get(PROFILE, headers=bob)
    await client.put(
        PROFILE, headers=bob, json={"birth_date": "1980-03-03", "chronotype": "lark"}
    )
    alice_view = await client.get(PROFILE, headers=alice)

    assert bob_view.status_code == 404
    assert alice_view.json()["birth_date"] == "2000-01-01"
    assert alice_view.json()["chronotype"] == "owl"
