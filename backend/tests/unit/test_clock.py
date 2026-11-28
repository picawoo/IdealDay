from datetime import UTC, date, datetime, timedelta, timezone

import pytest

from app.core.clock import system_clock, today_in

NOW = datetime(2026, 11, 15, 23, 30, tzinfo=UTC)


@pytest.mark.parametrize(
    ("tz", "expected"),
    [
        ("UTC", date(2026, 11, 15)),
        ("Europe/Moscow", date(2026, 11, 16)),  # UTC+3: уже за полночь
        ("Asia/Tokyo", date(2026, 11, 16)),
        ("Pacific/Kiritimati", date(2026, 11, 16)),  # UTC+14
        ("America/New_York", date(2026, 11, 15)),
        ("Pacific/Pago_Pago", date(2026, 11, 15)),  # UTC-11
    ],
)
def test_today_depends_on_timezone(tz: str, expected: date) -> None:
    assert today_in(tz, NOW) == expected


def test_today_before_local_midnight_is_previous_day() -> None:
    early = datetime(2026, 11, 15, 0, 30, tzinfo=UTC)

    assert today_in("America/New_York", early) == date(2026, 11, 14)


def test_today_accepts_any_aware_datetime() -> None:
    moment = datetime(2026, 11, 16, 2, 30, tzinfo=timezone(timedelta(hours=3)))  # = 23:30 UTC 15-го

    assert today_in("UTC", moment) == date(2026, 11, 15)


def test_naive_datetime_is_rejected() -> None:
    with pytest.raises(ValueError):
        today_in("UTC", datetime(2026, 11, 15, 12, 0))


def test_system_clock_is_aware_utc() -> None:
    assert system_clock().tzinfo is not None
    assert system_clock().utcoffset() == timedelta(0)
