from datetime import date, timedelta

import pytest

from app.services.biorhythm import CYCLE_PERIODS, CycleName
from app.services.critical import (
    CriticalLevel,
    Transition,
    analyze_day,
    cycle_transition,
    find_critical_days,
)

BIRTH = date(2000, 1, 1)
N2P = Transition.NEGATIVE_TO_POSITIVE
P2N = Transition.POSITIVE_TO_NEGATIVE


def day_at(days: int) -> date:
    return BIRTH + timedelta(days=days)


# ---------- правило для одного цикла ----------


@pytest.mark.parametrize(
    ("period", "r", "expected"),
    [
        (23, 0, N2P),
        (23, 11, P2N),  # нечётный период: знак меняется между r=11 и r=12
        (23, 12, None),
        (28, 0, N2P),
        (28, 14, P2N),  # чётный период: ровно ноль
        (28, 13, None),
        (33, 0, N2P),
        (33, 16, P2N),
        (33, 17, None),
    ],
)
def test_cycle_transition_table(period: int, r: int, expected: Transition | None) -> None:
    assert cycle_transition(r, period) == expected
    assert cycle_transition(r + 7 * period, period) == expected  # периодичность


@pytest.mark.parametrize("period", [23, 28, 33])
def test_two_critical_days_per_period(period: int) -> None:
    for start in (0, 3, 100):
        found = [d for d in range(start, start + period) if cycle_transition(d, period)]
        assert len(found) == 2


@pytest.mark.parametrize("period", [23, 28, 33])
def test_integer_rule_matches_naive_sign_change(period: int) -> None:
    import math

    eps = 1e-9

    def snap(v: float) -> float:
        return 0.0 if abs(v) < eps else v

    for days in range(5000):
        current = snap(math.sin(2 * math.pi * days / period))
        following = snap(math.sin(2 * math.pi * (days + 1) / period))
        naive = current == 0 or current * following < 0
        assert naive == (cycle_transition(days, period) is not None), (period, days)


# ---------- уровни одного дня ----------


def test_triple_critical_day_on_birth_date() -> None:
    day = analyze_day(BIRTH, BIRTH)
    assert day.level is CriticalLevel.TRIPLE
    assert [c.cycle for c in day.cycles] == list(CYCLE_PERIODS)
    assert all(c.transition is N2P for c in day.cycles)


def test_double_critical_day() -> None:
    # 644 = НОК(23, 28): физический и эмоциональный в нуле; у интеллектуального r = 17
    day = analyze_day(BIRTH, day_at(644))
    assert day.level is CriticalLevel.DOUBLE
    assert [c.cycle for c in day.cycles] == [CycleName.PHYSICAL, CycleName.EMOTIONAL]


def test_next_triple_critical_day() -> None:
    day = analyze_day(BIRTH, day_at(7210))
    assert day.level is CriticalLevel.TRIPLE


@pytest.mark.parametrize(
    ("days", "cycle"),
    [
        (11, CycleName.PHYSICAL),
        (14, CycleName.EMOTIONAL),
        (16, CycleName.INTELLECTUAL),
    ],
)
def test_single_critical_days(days: int, cycle: CycleName) -> None:
    day = analyze_day(BIRTH, day_at(days))
    assert day.level is CriticalLevel.SINGLE
    assert len(day.cycles) == 1
    assert day.cycles[0].cycle is cycle
    assert day.cycles[0].transition is P2N


def test_regular_day_is_not_critical() -> None:
    day = analyze_day(BIRTH, date(2026, 11, 15))
    assert day.level is CriticalLevel.NONE
    assert day.cycles == ()


def test_analyze_day_before_birth_raises() -> None:
    with pytest.raises(ValueError):
        analyze_day(BIRTH, date(1999, 12, 31))


# ---------- период ----------


def test_find_critical_days_in_period() -> None:
    found = find_critical_days(BIRTH, date(2026, 11, 15), date(2026, 11, 29))

    assert [d.date for d in found] == [date(2026, 11, 17), date(2026, 11, 21), date(2026, 11, 28)]
    assert [(d.cycles[0].cycle, d.cycles[0].transition) for d in found] == [
        (CycleName.INTELLECTUAL, P2N),
        (CycleName.PHYSICAL, N2P),
        (CycleName.EMOTIONAL, N2P),
    ]
    assert all(d.level is CriticalLevel.SINGLE for d in found)


def test_find_critical_days_returns_only_critical() -> None:
    found = find_critical_days(BIRTH, BIRTH, day_at(100))
    assert found
    assert all(d.level is not CriticalLevel.NONE for d in found)


def test_find_critical_days_includes_boundaries() -> None:
    found = find_critical_days(BIRTH, BIRTH, BIRTH)
    assert [d.date for d in found] == [BIRTH]
    assert found[0].level is CriticalLevel.TRIPLE


def test_find_critical_days_without_critical_days_returns_empty_list() -> None:
    assert find_critical_days(BIRTH, date(2026, 11, 15), date(2026, 11, 16)) == []


def test_find_critical_days_with_reversed_dates_raises() -> None:
    with pytest.raises(ValueError):
        find_critical_days(BIRTH, date(2026, 11, 21), date(2026, 11, 15))
