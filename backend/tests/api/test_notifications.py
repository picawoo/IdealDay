from collections.abc import Awaitable, Callable
from datetime import UTC, date, datetime, timedelta
from email.message import EmailMessage
from smtplib import SMTPServerDisconnected

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.repositories import notifications
from app.repositories.users import get_by_email
from app.workers.email_notifications import run_cycle

SETTINGS = "/api/v1/settings"
HISTORY = "/api/v1/notifications"
SENDER = "notify@example.com"
ENABLED = {"email_notifications_enabled": True, "email_reminder_time": "08:00"}


async def test_settings_default_and_update(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    assert (await client.get(SETTINGS)).status_code == 401
    assert (await client.get(HISTORY)).status_code == 401
    response = await client.get(SETTINGS, headers=auth_headers)
    assert response.json() == {**ENABLED, "email_notifications_enabled": False, "timezone": "UTC"}

    body = {**ENABLED, "email_reminder_time": "06:45"}
    response = await client.put(SETTINGS, headers=auth_headers, json=body)
    assert response.status_code == 200
    assert (await client.get(SETTINGS, headers=auth_headers)).json() == {**body, "timezone": "UTC"}
    invalid = await client.put(
        SETTINGS, headers=auth_headers, json={**body, "email_reminder_time": "25:00"}
    )
    assert invalid.status_code == 422


async def test_reminder_uses_time_zone_and_sends_once(
    client: AsyncClient,
    auth_headers: dict[str, str],
    make_headers: Callable[[str], Awaitable[dict[str, str]]],
    db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    profile = await client.put(
        "/api/v1/profile",
        headers=auth_headers,
        json={"birth_date": "2000-01-01", "timezone": "Asia/Tokyo"},
    )
    assert profile.status_code == 200
    preferences = await client.put(SETTINGS, headers=auth_headers, json=ENABLED)
    assert preferences.json()["timezone"] == "Asia/Tokyo"
    task = await client.post(
        "/api/v1/tasks",
        headers=auth_headers,
        json={
            "title": "Проверить план",
            "task_type": "routine",
            "duration_minutes": 30,
            "scheduled_date": "2026-11-22",
        },
    )
    assert task.status_code == 201
    bob = await make_headers("bob@idealday.app")
    sent: list[EmailMessage] = []
    due = datetime(2026, 11, 21, 23, 0, tzinfo=UTC)

    early = due - timedelta(minutes=1)
    assert await run_cycle(db_session_factory, sent.append, SENDER, lambda: early) == 0
    assert await run_cycle(db_session_factory, sent.append, SENDER, lambda: due) == 1
    assert await run_cycle(db_session_factory, sent.append, SENDER, lambda: due) == 0

    assert len(sent) == 1
    assert "Проверить план" in sent[0].get_content()
    assert str(sent[0]["To"]) == "alice@idealday.app"
    history = await client.get(HISTORY, headers=auth_headers)
    assert history.status_code == 200
    (delivery,) = history.json()
    assert delivery["local_date"] == "2026-11-22"
    assert (delivery["status"], delivery["attempts"]) == ("sent", 1)
    assert delivery["sent_at"]
    assert (await client.get(HISTORY, headers=bob)).json() == []


async def test_temporary_smtp_failure_is_retried(
    client: AsyncClient,
    auth_headers: dict[str, str],
    db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    response = await client.put(SETTINGS, headers=auth_headers, json=ENABLED)
    assert response.status_code == 200
    attempts: list[str] = []

    def fail_once(email: EmailMessage) -> None:
        attempts.append(str(email["Message-ID"]))
        if len(attempts) == 1:
            raise SMTPServerDisconnected("temporary failure")

    due = datetime(2026, 11, 21, 8, 0, tzinfo=UTC)
    assert await run_cycle(db_session_factory, fail_once, SENDER, lambda: due) == 0
    assert await run_cycle(db_session_factory, fail_once, SENDER, lambda: due) == 0
    retry_at = due + timedelta(minutes=5)
    assert await run_cycle(db_session_factory, fail_once, SENDER, lambda: retry_at) == 1

    assert len(attempts) == 2 and attempts[0] == attempts[1]
    (delivery,) = (await client.get(HISTORY, headers=auth_headers)).json()
    assert (delivery["status"], delivery["attempts"]) == ("sent", 2)


async def test_disabled_settings_skip_pending_delivery(
    client: AsyncClient,
    auth_headers: dict[str, str],
    db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    due = datetime(2026, 11, 21, 8, 0, tzinfo=UTC)
    async with db_session_factory.begin() as session:
        user = await get_by_email(session, "alice@idealday.app")
        assert user is not None
        await notifications.enqueue(session, [(user.id, date(2026, 11, 21))], due)
    response = await client.put(
        SETTINGS, headers=auth_headers, json={**ENABLED, "email_notifications_enabled": False}
    )
    assert response.status_code == 200
    sent: list[EmailMessage] = []
    assert await run_cycle(db_session_factory, sent.append, SENDER, lambda: due) == 0
    assert sent == []
    (delivery,) = (await client.get(HISTORY, headers=auth_headers)).json()
    assert (delivery["status"], delivery["attempts"]) == ("skipped", 0)
