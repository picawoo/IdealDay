from datetime import UTC, date, datetime
from email.message import EmailMessage
from unittest.mock import Mock
from uuid import UUID

import pytest
from pydantic import ValidationError

from app.schemas.settings import SettingsWrite
from app.services import email_reminders
from app.services.email_reminders import SMTPTransport, build_email, local_reminder_time

NOW = datetime(2026, 11, 21, 22, 30, tzinfo=UTC)


def test_reminder_date_and_time_are_local() -> None:
    assert local_reminder_time(NOW, "Asia/Yekaterinburg") == (date(2026, 11, 22), 210)
    assert local_reminder_time(NOW, "America/New_York") == (date(2026, 11, 21), 1050)


@pytest.mark.parametrize("value", ["8:30", "24:00", "00:60", "08:00:00", "08:00\n"])
def test_reminder_time_requires_hhmm(value: str) -> None:
    with pytest.raises(ValidationError):
        SettingsWrite(email_notifications_enabled=True, email_reminder_time=value)


def message(titles: list[str]) -> EmailMessage:
    return build_email(
        sender="notify@example.com",
        recipient="alice@example.com",
        user_id=UUID(int=7),
        target=date(2026, 11, 22),
        task_titles=titles,
        now=NOW,
    )


def test_digest_uses_plain_text_and_limits_tasks() -> None:
    titles = [f"Задача #{i}" for i in range(31)]
    delivery = message(titles)

    assert delivery.get_content_type() == "text/plain"
    assert delivery["To"] == "alice@example.com"
    assert str(delivery["Subject"]).endswith("22.11.2026")
    assert delivery.get_content().count("• ") == 30
    assert "Задача #30" not in delivery.get_content()
    assert "Остальные задачи" in delivery.get_content()
    assert delivery["Message-ID"] == message([])["Message-ID"]
    assert "На сегодня задач нет." in message([]).get_content()


def test_starttls_precedes_smtp_auth_and_delivery(monkeypatch: pytest.MonkeyPatch) -> None:
    client = Mock()
    smtp = Mock(return_value=client)
    monkeypatch.setattr(email_reminders.smtplib, "SMTP", smtp)
    transport = SMTPTransport("smtp.example.com", 587, "starttls", 10, "user", "fake-secret")

    transport.send(message(["Задача"]))

    smtp.assert_called_once_with("smtp.example.com", 587, timeout=10)
    methods = [call[0] for call in client.method_calls]
    assert methods == ["starttls", "login", "send_message", "close"]
    assert "fake-secret" not in repr(transport)


def test_smtp_error_closes_socket_and_is_propagated(monkeypatch: pytest.MonkeyPatch) -> None:
    client = Mock()
    client.send_message.side_effect = OSError("connection closed")
    monkeypatch.setattr(email_reminders.smtplib, "SMTP_SSL", Mock(return_value=client))

    with pytest.raises(OSError):
        SMTPTransport("smtp.example.com", 465, "ssl", 10).send(message([]))
    client.close.assert_called_once_with()
