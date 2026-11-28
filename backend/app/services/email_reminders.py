import smtplib
import ssl
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date, datetime
from email.message import EmailMessage
from email.utils import format_datetime
from enum import StrEnum
from typing import Literal
from uuid import UUID
from zoneinfo import ZoneInfo

DEFAULT_REMINDER_TIME = "08:00"
MAX_EMAIL_TASKS = 30


class DeliveryStatus(StrEnum):
    PENDING = "pending"
    SENDING = "sending"
    SENT = "sent"
    FAILED = "failed"
    SKIPPED = "skipped"


def format_reminder_time(minute: int) -> str:
    hour, minute = divmod(minute, 60)
    return f"{hour:02d}:{minute:02d}"


def reminder_minute(value: str) -> int:
    hour, minute = map(int, value.split(":"))
    return hour * 60 + minute


def local_reminder_time(now: datetime, timezone: str) -> tuple[date, int]:
    if now.tzinfo is None:
        raise ValueError("Текущее время должно содержать часовой пояс")
    local = now.astimezone(ZoneInfo(timezone))
    return local.date(), local.hour * 60 + local.minute


def build_email(
    *,
    sender: str,
    recipient: str,
    user_id: UUID,
    target: date,
    task_titles: Sequence[str],
    now: datetime,
) -> EmailMessage:
    message = EmailMessage()
    message["From"] = sender
    message["To"] = recipient
    message["Date"] = format_datetime(now)
    message["Message-ID"] = f"<idealday.{user_id}.{target}@{sender.rsplit('@', 1)[1]}>"
    message["Subject"] = f"Идеальный День — задачи на {target:%d.%m.%Y}"
    lines = [f"Задачи на {target:%d.%m.%Y}:", ""]
    lines.extend(f"• {' '.join(title.split())}" for title in task_titles[:MAX_EMAIL_TASKS])
    if len(task_titles) > MAX_EMAIL_TASKS:
        lines.append("Остальные задачи доступны в приложении.")
    if not task_titles:
        lines.append("На сегодня задач нет.")
    message.set_content("\n".join(lines))
    return message


@dataclass(frozen=True, slots=True)
class SMTPTransport:
    host: str
    port: int
    security: Literal["starttls", "ssl", "plain"]
    timeout: float
    username: str | None = None
    password: str | None = field(default=None, repr=False)

    def send(self, message: EmailMessage) -> None:
        context = ssl.create_default_context() if self.security != "plain" else None
        if self.security == "ssl":
            client = smtplib.SMTP_SSL(self.host, self.port, timeout=self.timeout, context=context)
        else:
            client = smtplib.SMTP(self.host, self.port, timeout=self.timeout)
        # Закрываем сокет без QUIT: ответ на DATA уже определяет принятие письма сервером.
        try:
            if self.security == "starttls":
                client.starttls(context=context)
            if self.username is not None and self.password is not None:
                client.login(self.username, self.password)
            client.send_message(message)
        finally:
            client.close()
