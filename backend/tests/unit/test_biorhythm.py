import math
from datetime import date, timedelta

import pytest

from app.services.biorhythm import (
    CYCLE_PERIODS,
    CycleName,
    Sign,
    Trend,
    calculate_cycle,
    calculate_day,
    calculate_period,
    days_since_birth,
)

BIRTH = date(2000, 1, 1)


def cycle(days: int, name: CycleName):
    return calculate_cycle(name, days)


# ---------- дни и даты ----------


def test_days_since_birth() -> None:
    assert days_since_birth(BIRTH, BIRTH) == 0
    assert days_since_birth(BIRTH, date(2000, 1, 11)) == 10


def test_target_before_birth_raises() -> None:
    with pytest.raises(ValueError):
        days_since_birth(BIRTH, date(1999, 12, 31))


def test_leap_year_is_counted() -> None:
    # 2000 год високосный: 29 февраля существует
    assert days_since_birth(date(2000, 2, 28), date(2000, 3, 1)) == 2
    assert days_since_birth(date(2001, 2, 28), date(2001, 3, 1)) == 1


def test_birth_on_29_february_is_supported() -> None:
    day = calculate_day(date(2000, 2, 29), date(2024, 2, 29))
    assert len(day.cycles) == 3


# ---------- контрольные точки формулы ----------


def test_day_zero_all_cycles_are_exactly_zero() -> None:
    day = calculate_day(BIRTH, BIRTH)
    for c in day.cycles:
        assert c.value == 0.0
        assert c.percent == 0
        assert c.sign is Sign.ZERO
        assert c.day_in_cycle == 0
        assert c.trend is Trend.RISING  # с нуля цикл идёт вверх


def test_period_28_peak_and_trough_are_exact() -> None:
    peak = cycle(7, CycleName.EMOTIONAL)
    assert peak.value == 1.0
    assert peak.percent == 100
    assert peak.sign is Sign.POSITIVE
    assert peak.trend is Trend.FALLING  # после пика цикл начинает спадать

    trough = cycle(21, CycleName.EMOTIONAL)
    assert trough.value == -1.0
    assert trough.percent == -100
    assert trough.sign is Sign.NEGATIVE
    assert trough.trend is Trend.RISING  # после минимума цикл начинает расти


@pytest.mark.parametrize(
    ("name", "peak_day", "trough_day"),
    [
        (CycleName.PHYSICAL, 6, 17),  # T=23: T/4 ≈ 5.75, 3T/4 ≈ 17.25
        (CycleName.EMOTIONAL, 7, 21),  # T=28: ровно T/4 и 3T/4
        (CycleName.INTELLECTUAL, 8, 25),  # T=33: T/4 ≈ 8.25, 3T/4 ≈ 24.75
    ],
)
def test_peak_and_trough_are_close_to_extremes(
    name: CycleName, peak_day: int, trough_day: int
) -> None:
    assert cycle(peak_day, name).value == pytest.approx(1.0, abs=0.01)
    assert cycle(trough_day, name).value == pytest.approx(-1.0, abs=0.01)


@pytest.mark.parametrize("name", list(CycleName))
@pytest.mark.parametrize("days", [0, 1, 5, 13, 100, 9815])
def test_cycle_is_periodic(name: CycleName, days: int) -> None:
    period = CYCLE_PERIODS[name]
    assert cycle(days, name) == cycle(days + period, name)
    assert cycle(days, name) == cycle(days + 5 * period, name)


def test_known_example_matches_report() -> None:
    # Дата рождения 2000-01-01, дата расчёта 2026-11-15 (t = 9815): пример из отчёта
    day = calculate_day(BIRTH, date(2026, 11, 15))
    physical, emotional, intellectual = day.cycles

    assert (physical.cycle, physical.period, physical.day_in_cycle) == (CycleName.PHYSICAL, 23, 17)
    assert physical.value == -0.9977
    assert physical.percent == -100
    assert (physical.sign, physical.trend) == (Sign.NEGATIVE, Trend.FALLING)

    assert emotional.day_in_cycle == 15
    assert emotional.value == -0.2225
    assert emotional.percent == -22
    assert (emotional.sign, emotional.trend) == (Sign.NEGATIVE, Trend.FALLING)

    assert intellectual.day_in_cycle == 14
    assert intellectual.value == 0.4582
    assert intellectual.percent == 46
    assert (intellectual.sign, intellectual.trend) == (Sign.POSITIVE, Trend.FALLING)


# ---------- целочисленные sign/trend против float-формул ----------


@pytest.mark.parametrize("name", list(CycleName))
def test_sign_and_trend_agree_with_float_math(name: CycleName) -> None:
    period = CYCLE_PERIODS[name]
    for r in range(period):
        angle = 2 * math.pi * r / period
        c = cycle(r, name)

        sin_value = math.sin(angle)
        if abs(sin_value) > 1e-9:
            expected = Sign.POSITIVE if sin_value > 0 else Sign.NEGATIVE
            assert c.sign is expected, (name, r)
        else:
            assert c.sign is Sign.ZERO, (name, r)

        cos_value = math.cos(angle)
        if abs(cos_value) > 1e-9:  # в точках пика и минимума производная равна нулю
            expected_trend = Trend.RISING if cos_value > 0 else Trend.FALLING
            assert c.trend is expected_trend, (name, r)


@pytest.mark.parametrize("name", list(CycleName))
def test_value_range_and_percent_consistency(name: CycleName) -> None:
    for days in range(200):
        c = cycle(days, name)
        assert -1.0 <= c.value <= 1.0
        assert -100 <= c.percent <= 100
        assert abs(c.percent - c.value * 100) <= 0.51


# ---------- день и период ----------


def test_day_has_three_cycles_in_fixed_order() -> None:
    day = calculate_day(BIRTH, date(2026, 11, 15))
    assert [c.cycle for c in day.cycles] == [
        CycleName.PHYSICAL,
        CycleName.EMOTIONAL,
        CycleName.INTELLECTUAL,
    ]
    assert [c.period for c in day.cycles] == [23, 28, 33]


def test_period_is_inclusive_and_ordered() -> None:
    days = calculate_period(BIRTH, date(2026, 11, 15), date(2026, 11, 21))
    assert len(days) == 7
    assert days[0].date == date(2026, 11, 15)
    assert days[-1].date == date(2026, 11, 21)
    assert [d.date for d in days] == [date(2026, 11, 15) + timedelta(days=i) for i in range(7)]


def test_period_matches_single_day_calculation() -> None:
    days = calculate_period(BIRTH, date(2026, 1, 1), date(2026, 3, 1))
    for day in days:
        assert day == calculate_day(BIRTH, day.date)


def test_single_day_period() -> None:
    days = calculate_period(BIRTH, date(2026, 11, 15), date(2026, 11, 15))
    assert len(days) == 1


def test_period_with_reversed_dates_raises() -> None:
    with pytest.raises(ValueError):
        calculate_period(BIRTH, date(2026, 11, 21), date(2026, 11, 15))


def test_period_starting_before_birth_raises() -> None:
    with pytest.raises(ValueError):
        calculate_period(BIRTH, date(1999, 12, 30), date(2000, 1, 2))
