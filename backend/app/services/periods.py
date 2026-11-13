"""Проверки дат и периодов запроса. Бросают доменные ошибки (422)."""

from datetime import date

from app.core.errors import DateBeforeBirthError, InvalidPeriodError, PeriodTooLongError


def ensure_not_before_birth(birth_date: date, target_date: date) -> None:
    if target_date < birth_date:
        raise DateBeforeBirthError()


def validate_period(birth_date: date, date_from: date, date_to: date, max_days: int) -> None:
    if date_from > date_to:
        raise InvalidPeriodError()
    if (date_to - date_from).days + 1 > max_days:
        raise PeriodTooLongError(f"Период не может быть длиннее {max_days} дн.")
    ensure_not_before_birth(birth_date, date_from)
