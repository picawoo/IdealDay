"""Критические дни: дни, когда цикл пересекает нулевую отметку. Чистые функции."""

from dataclasses import dataclass
from datetime import date
from enum import StrEnum

from app.services.biorhythm import CYCLE_PERIODS, CycleName, days_since_birth, iter_days


class CriticalLevel(StrEnum):
    NONE = "none"
    SINGLE = "single"
    DOUBLE = "double"
    TRIPLE = "triple"


class Transition(StrEnum):
    NEGATIVE_TO_POSITIVE = "negative_to_positive"
    POSITIVE_TO_NEGATIVE = "positive_to_negative"


_LEVEL_BY_COUNT = {
    0: CriticalLevel.NONE,
    1: CriticalLevel.SINGLE,
    2: CriticalLevel.DOUBLE,
    3: CriticalLevel.TRIPLE,
}


@dataclass(frozen=True, slots=True)
class CriticalCycle:
    cycle: CycleName
    transition: Transition


@dataclass(frozen=True, slots=True)
class CriticalDay:
    date: date
    level: CriticalLevel
    cycles: tuple[CriticalCycle, ...]


def cycle_transition(days: int, period: int) -> Transition | None:
    """Переход цикла в этот день или None, если день для цикла не критический.

    Целочисленное правило по остатку r = days mod T:
    - r == 0: значение ровно 0, цикл идёт с минуса на плюс;
    - r == T // 2: для чётного T значение ровно 0, для нечётного знак меняется между днями
      r и r + 1 (день r помечается критическим); в обоих случаях переход с плюса на минус.
    """
    r = days % period
    if r == 0:
        return Transition.NEGATIVE_TO_POSITIVE
    if r == period // 2:
        return Transition.POSITIVE_TO_NEGATIVE
    return None


def analyze_day(birth_date: date, target_date: date) -> CriticalDay:
    days = days_since_birth(birth_date, target_date)
    cycles = tuple(
        CriticalCycle(cycle=cycle, transition=transition)
        for cycle, period in CYCLE_PERIODS.items()
        if (transition := cycle_transition(days, period)) is not None
    )
    return CriticalDay(date=target_date, level=_LEVEL_BY_COUNT[len(cycles)], cycles=cycles)


def find_critical_days(birth_date: date, date_from: date, date_to: date) -> list[CriticalDay]:
    """Только критические дни периода (уровень не ниже single)."""
    analyzed = (analyze_day(birth_date, day) for day in iter_days(date_from, date_to))
    return [day for day in analyzed if day.level is not CriticalLevel.NONE]
