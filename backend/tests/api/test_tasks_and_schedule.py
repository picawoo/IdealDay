from collections.abc import Awaitable, Callable
from datetime import UTC, datetime

import pytest
from httpx import AsyncClient

TASKS = "/api/v1/tasks"
SCHEDULE = "/api/v1/schedule"
PROFILE = "/api/v1/profile"
DAY = "2024-09-11"
TASK = {
    "title": "Проверить отчёт",
    "task_type": "routine",
    "scheduled_date": DAY,
    "duration_minutes": 30,
    "priority": 3,
}


async def add_task(client: AsyncClient, headers: dict[str, str], **changes) -> dict:
    response = await client.post(TASKS, headers=headers, json={**TASK, **changes})
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture
async def with_profile(client: AsyncClient, auth_headers: dict[str, str]) -> dict[str, str]:
    response = await client.put(
        PROFILE,
        headers=auth_headers,
        json={"birth_date": "2000-01-01", "chronotype": "dove", "timezone": "Asia/Tokyo"},
    )
    assert response.status_code == 200, response.text
    return auth_headers


async def test_task_crud_and_date_filter(client: AsyncClient, auth_headers: dict[str, str]) -> None:
    task = await add_task(client, auth_headers, title="  Проверить отчёт  ")
    await add_task(client, auth_headers, scheduled_date="2024-09-12")
    path = f"{TASKS}/{task['id']}"

    assert task["title"] == TASK["title"]
    assert task["fixed_start_minute"] is None
    assert (await client.get(path, headers=auth_headers)).json() == task
    listed = await client.get(TASKS, headers=auth_headers, params={"date": DAY, "limit": 1})
    assert listed.status_code == 200
    assert listed.json() == [task]

    updated = await client.put(path, headers=auth_headers, json={**TASK, "priority": 5})
    assert updated.status_code == 200
    assert updated.json()["priority"] == 5
    assert (await client.delete(path, headers=auth_headers)).status_code == 204
    assert (await client.get(path, headers=auth_headers)).status_code == 404


@pytest.mark.parametrize(
    "field,value", [("duration_minutes", 7), ("title", "   "), ("priority", 6)]
)
async def test_task_input_validation(
    client: AsyncClient, auth_headers: dict[str, str], field: str, value: str | int
) -> None:
    response = await client.post(TASKS, headers=auth_headers, json={**TASK, field: value})

    assert response.status_code == 422


async def test_schedule_requires_auth_and_profile(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    assert (await client.get(TASKS)).status_code == 401
    assert (await client.get(SCHEDULE)).status_code == 401
    response = await client.get(SCHEDULE, headers=auth_headers)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "PROFILE_NOT_FOUND"


async def test_other_users_tasks_are_private(
    client: AsyncClient,
    with_profile: dict[str, str],
    make_headers: Callable[[str], Awaitable[dict[str, str]]],
) -> None:
    bob = await make_headers("bob@idealday.app")
    task_id = (await add_task(client, bob))["id"]
    task_path = f"{TASKS}/{task_id}"

    assert (await client.get(TASKS, headers=with_profile)).json() == []
    assert (await client.get(task_path, headers=with_profile)).status_code == 404
    assert (await client.put(task_path, headers=with_profile, json=TASK)).status_code == 404
    assert (await client.delete(task_path, headers=with_profile)).status_code == 404
    response = await client.patch(
        f"{SCHEDULE}/tasks/{task_id}", headers=with_profile, json={"start_minute": 600}
    )
    assert response.status_code == 404
    day = await client.get(SCHEDULE, headers=with_profile, params={"date": DAY})
    assert day.status_code == 200
    assert day.json()["placements"] == []


async def test_schedule_defaults_to_profile_date_and_includes_lunch(
    client: AsyncClient, with_profile: dict[str, str], set_now: Callable[[datetime], None]
) -> None:
    set_now(datetime(2024, 9, 10, 23, 30, tzinfo=UTC))
    task = await add_task(client, with_profile)
    await add_task(client, with_profile, scheduled_date="2024-09-10")

    response = await client.get(SCHEDULE, headers=with_profile)
    assert response.status_code == 200
    plan = response.json()
    assert plan["date"] == DAY
    assert plan["timezone"] == "Asia/Tokyo"
    assert [item["task_id"] for item in plan["placements"]] == [task["id"]]
    assert plan["placements"][0]["source"] == "automatic"
    assert plan["breaks"] == [{"start_minute": 780, "end_minute": 810, "kind": "lunch"}]


async def test_manual_placement_replans_and_can_be_removed(
    client: AsyncClient, with_profile: dict[str, str]
) -> None:
    pins = await add_task(client, with_profile)
    automatic = await add_task(client, with_profile, task_type="intellectual")
    path = f"{SCHEDULE}/tasks/{pins['id']}"
    response = await client.patch(path, headers=with_profile, json={"start_minute": 630})

    assert response.status_code == 200, response.text
    plan = response.json()
    by_id = {item["task_id"]: item for item in plan["placements"]}
    assert by_id[pins["id"]]["source"] == "manual"
    assert by_id[pins["id"]]["start_minute"] == 630
    auto = by_id[automatic["id"]]
    assert auto["end_minute"] <= 620 or auto["start_minute"] >= 670
    assert any(br["kind"] == "between_tasks" for br in plan["breaks"])
    assert (await client.get(SCHEDULE, headers=with_profile, params={"date": DAY})).json() == plan

    response = await client.patch(path, headers=with_profile, json={"start_minute": None})
    assert response.status_code == 200
    assert all(item["source"] == "automatic" for item in response.json()["placements"])


async def test_schedule_returns_a_reason_for_deferred_tasks(
    client: AsyncClient, with_profile: dict[str, str]
) -> None:
    day = "2000-01-12"
    task = await add_task(client, with_profile, task_type="physical", scheduled_date=day)
    response = await client.get(SCHEDULE, headers=with_profile, params={"date": day})

    assert response.status_code == 200
    assert response.json()["placements"] == []
    assert response.json()["unscheduled"] == [
        {"task_id": task["id"], "reason": "critical_cycle"}
    ]


async def test_manual_conflicts_do_not_change_existing_placement(
    client: AsyncClient, with_profile: dict[str, str]
) -> None:
    first = await add_task(client, with_profile)
    second = await add_task(client, with_profile)
    first_path = f"{SCHEDULE}/tasks/{first['id']}"
    second_path = f"{SCHEDULE}/tasks/{second['id']}"
    result = await client.patch(first_path, headers=with_profile, json={"start_minute": 600})
    assert result.status_code == 200
    for conflict in (635, 775, 1435):
        result = await client.patch(
            second_path, headers=with_profile, json={"start_minute": conflict}
        )
        assert result.status_code == 409
        assert result.json()["error"]["code"] == "SCHEDULE_CONFLICT"

    saved = await client.get(f"{TASKS}/{first['id']}", headers=with_profile)
    assert saved.json()["fixed_start_minute"] == 600
    saved = await client.get(f"{TASKS}/{second['id']}", headers=with_profile)
    assert saved.json()["fixed_start_minute"] is None


async def test_updating_task_preserves_manual_invariants(
    client: AsyncClient, with_profile: dict[str, str]
) -> None:
    task_id = (await add_task(client, with_profile))["id"]
    pinned = await client.patch(
        f"{SCHEDULE}/tasks/{task_id}", headers=with_profile, json={"start_minute": 750}
    )
    assert pinned.status_code == 200
    path = f"{TASKS}/{task_id}"
    rejected = await client.put(path, headers=with_profile, json={**TASK, "duration_minutes": 35})
    assert rejected.status_code == 409
    assert (await client.get(path, headers=with_profile)).json()["duration_minutes"] == 30

    moved = await client.put(
        path, headers=with_profile, json={**TASK, "scheduled_date": "2024-09-12"}
    )
    assert moved.status_code == 200
    assert moved.json()["fixed_start_minute"] is None
