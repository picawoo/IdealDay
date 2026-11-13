from collections.abc import Callable
from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

Clock = Callable[[], datetime]


def system_clock() -> datetime:
    return datetime.now(UTC)


def get_clock() -> Clock:
    """Зависимость FastAPI. Тесты подменяют её, чтобы «сегодня» было детерминированным."""
    return system_clock


def today_in(timezone: str, now: datetime) -> date:
    """Календарная дата «сегодня» в заданном часовом поясе (IANA-имя)."""
    if now.tzinfo is None:
        raise ValueError("now должен быть с часовым поясом (aware datetime)")
    return now.astimezone(ZoneInfo(timezone)).date()
