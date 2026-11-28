from datetime import date, timedelta

import pytest

from app.core.errors import DateBeforeBirthError, InvalidPeriodError, PeriodTooLongError
from app.services.periods import ensure_not_before_birth, validate_period

BIRTH = date(2000, 1, 1)
START = date(2026, 1, 1)


def test_period_of_one_day_is_valid() -> None:
    validate_period(BIRTH, START, START, max_days=92)


def test_period_of_max_length_is_valid() -> None:
    validate_period(BIRTH, START, START + timedelta(days=91), max_days=92)  # ровно 92 дня


def test_period_longer_than_max_is_rejected() -> None:
    with pytest.raises(PeriodTooLongError) as exc:
        validate_period(BIRTH, START, START + timedelta(days=92), max_days=92)  # 93 дня

    assert "92" in exc.value.message


def test_reversed_period_is_rejected() -> None:
    with pytest.raises(InvalidPeriodError):
        validate_period(BIRTH, START + timedelta(days=1), START, max_days=92)


def test_reversed_check_goes_before_length_check() -> None:
    with pytest.raises(InvalidPeriodError):
        validate_period(BIRTH, date(2030, 1, 1), date(2026, 1, 1), max_days=92)


def test_period_starting_before_birth_is_rejected() -> None:
    with pytest.raises(DateBeforeBirthError):
        validate_period(BIRTH, date(1999, 12, 31), date(2000, 1, 2), max_days=92)


def test_period_starting_on_birth_date_is_valid() -> None:
    validate_period(BIRTH, BIRTH, date(2000, 1, 3), max_days=92)


def test_ensure_not_before_birth() -> None:
    ensure_not_before_birth(BIRTH, BIRTH)
    ensure_not_before_birth(BIRTH, date(2026, 1, 1))
    with pytest.raises(DateBeforeBirthError):
        ensure_not_before_birth(BIRTH, date(1999, 12, 31))


def test_error_codes_and_statuses() -> None:
    assert (InvalidPeriodError.status_code, InvalidPeriodError.code) == (422, "INVALID_PERIOD")
    assert (PeriodTooLongError.status_code, PeriodTooLongError.code) == (422, "PERIOD_TOO_LONG")
    assert (DateBeforeBirthError.status_code, DateBeforeBirthError.code) == (
        422,
        "DATE_BEFORE_BIRTH",
    )
