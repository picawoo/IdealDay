"""Расчёт биоритмов. Чистые функции: без БД, Redis и HTTP, результат зависит только от аргументов."""

import math
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import date, timedelta
from enum import StrEnum


class CycleName(StrEnum):
    PHYSICAL = "physical"
    EMOTIONAL = "emotional"
    INTELLECTUAL = "intellectual"


# Порядок важен: он же порядок циклов во всех ответах
CYCLE_PERIODS: dict[CycleName, int] = {
    CycleName.PHYSICAL: 23,
    CycleName.EMOTIONAL: 28,
    CycleName.INTELLECTUAL: 33,
}


class Sign(StrEnum):
    POSITIVE = "positive"
    NEGATIVE = "negative"
    ZERO = "zero"  # ровно на нулевой отметке (критический день с точным нулём)


class Trend(StrEnum):
    RISING = "rising"
    FALLING = "falling"


@dataclass(frozen=True, slots=True)
class CycleValue:
    cycle: CycleName
    period: int
    day_in_cycle: int  # t mod T
    value: float  # от -1 до +1, округлено до 4 знаков
    percent: int  # от -100 до +100
    sign: Sign
    trend: Trend


@dataclass(frozen=True, slots=True)
class DayBiorhythm:
    date: date
    cycles: tuple[CycleValue, ...]


def days_since_birth(birth_date: date, target_date: date) -> int:
    if target_date < birth_date:
        raise ValueError("Дата расчёта не может быть раньше даты рождения")
    return (target_date - birth_date).days


def iter_days(date_from: date, date_to: date) -> Iterator[date]:
    """Все даты периода включительно."""
    if date_from > date_to:
        raise ValueError("date_from не может быть позже date_to")
    for offset in range((date_to - date_from).days + 1):
        yield date_from + timedelta(days=offset)


# Знак и направление определяются целочисленной арифметикой по остатку r = t mod T.
# Сравнение float здесь ненадёжно: sin(2π) даёт около -2.4e-16, а не 0, и cos(π/2) не равен 0.


def _sign(r: int, period: int) -> Sign:
    if r == 0 or 2 * r == period:
        return Sign.ZERO
    return Sign.POSITIVE if 2 * r < period else Sign.NEGATIVE


def _trend(r: int, period: int) -> Trend:
    # Рост на участках [0, T/4) и [3T/4, T), спад на [T/4, 3T/4).
    # В точке пика (r = T/4) цикл начинает спадать, в точке минимума (r = 3T/4) начинает расти.
    return Trend.FALLING if period <= 4 * r < 3 * period else Trend.RISING


def calculate_cycle(cycle: CycleName, days: int) -> CycleValue:
    period = CYCLE_PERIODS[cycle]
    r = days % period
    sign = _sign(r, period)
    raw = 0.0 if sign is Sign.ZERO else math.sin(2 * math.pi * r / period)
    return CycleValue(
        cycle=cycle,
        period=period,
        day_in_cycle=r,
        value=round(raw, 4),
        percent=round(raw * 100),
        sign=sign,
        trend=_trend(r, period),
    )


def calculate_day(birth_date: date, target_date: date) -> DayBiorhythm:
    days = days_since_birth(birth_date, target_date)
    return DayBiorhythm(
        date=target_date,
        cycles=tuple(calculate_cycle(cycle, days) for cycle in CYCLE_PERIODS),
    )


def calculate_period(birth_date: date, date_from: date, date_to: date) -> list[DayBiorhythm]:
    return [calculate_day(birth_date, day) for day in iter_days(date_from, date_to)]
