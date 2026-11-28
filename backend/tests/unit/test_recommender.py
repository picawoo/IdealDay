from datetime import date, timedelta

import pytest

from app.core.circadian import MAX_ROUTINE_WINDOWS, MAX_WINDOWS_PER_TYPE, MIN_PEAK_SCORE
from app.core.enums import Chronotype, TaskType
from app.services.biorhythm import CycleName
from app.services.critical import CriticalLevel, analyze_day
from app.services.recommender import (
    CYCLE_FOR_TYPE,
    FOCUS_TYPES,
    Severity,
    active_hours,
    find_routine_windows,
    find_windows,
    format_window,
    recommend,
)

BIRTH = date(2000, 1, 1)
FOCUS = [TaskType.INTELLECTUAL, TaskType.PHYSICAL, TaskType.SOCIAL_CREATIVE]
TYPE_FOR_CYCLE = {cycle: task_type for task_type, cycle in CYCLE_FOR_TYPE.items()}


def day(days_since_birth: int) -> date:
    return BIRTH + timedelta(days=days_since_birth)


def spans(windows) -> list[tuple[int, int]]:
    return [(w.start_hour, w.end_hour) for w in windows]


# ---------- активное время ----------


@pytest.mark.parametrize(
    ("chronotype", "expected"),
    [
        (Chronotype.LARK, range(6, 22)),
        (Chronotype.DOVE, range(7, 23)),
        (Chronotype.OWL, range(9, 24)),  # окна не выходят за полночь
    ],
)
def test_active_hours(chronotype: Chronotype, expected: range) -> None:
    assert active_hours(chronotype) == expected


# ---------- окна одного типа задач ----------


def test_dove_intellectual_peak_matches_project_description() -> None:
    # В описании проекта: пик интеллектуального цикла с 10:00 до 12:00, вторая волна после обеда
    windows = find_windows(0.95, TaskType.INTELLECTUAL, Chronotype.DOVE)

    assert spans(windows) == [(10, 12), (13, 14)]


def test_dove_physical_window_contains_afternoon_slot_from_description() -> None:
    # В описании проекта: физический пик около 15:00–16:00
    (window,) = find_windows(0.8, TaskType.PHYSICAL, Chronotype.DOVE)

    assert window.start_hour <= 15 and window.end_hour >= 16


@pytest.mark.parametrize("task_type", FOCUS)
@pytest.mark.parametrize("chronotype", list(Chronotype))
@pytest.mark.parametrize("amplitude", [-1.0, -0.2, 0.0, 0.3])
def test_weak_or_negative_cycle_has_no_windows(
    task_type: TaskType, chronotype: Chronotype, amplitude: float
) -> None:
    assert find_windows(amplitude, task_type, chronotype) == []


@pytest.mark.parametrize("task_type", FOCUS)
@pytest.mark.parametrize("chronotype", list(Chronotype))
def test_strong_cycle_always_has_a_window(task_type: TaskType, chronotype: Chronotype) -> None:
    assert find_windows(1.0, task_type, chronotype) != []


@pytest.mark.parametrize("task_type", FOCUS)
@pytest.mark.parametrize("chronotype", list(Chronotype))
@pytest.mark.parametrize("amplitude", [0.5, 0.65, 0.8, 1.0])
def test_window_invariants(task_type: TaskType, chronotype: Chronotype, amplitude: float) -> None:
    windows = find_windows(amplitude, task_type, chronotype)
    hours = active_hours(chronotype)

    assert 1 <= len(windows) <= MAX_WINDOWS_PER_TYPE
    for w in windows:
        assert w.task_type is task_type
        assert hours.start <= w.start_hour < w.end_hour <= 24
        assert w.score >= MIN_PEAK_SCORE
    for earlier, later in zip(windows, windows[1:], strict=False):
        assert earlier.end_hour < later.start_hour  # отсортированы и не касаются друг друга


@pytest.mark.parametrize("task_type", FOCUS)
def test_stronger_cycle_gives_better_window(task_type: TaskType) -> None:
    best = [
        max(w.score for w in find_windows(a, task_type, Chronotype.DOVE))
        for a in (0.5, 0.7, 0.9, 1.0)
    ]

    assert best == sorted(best)
    assert best[0] < best[-1]


@pytest.mark.parametrize("task_type", FOCUS)
@pytest.mark.parametrize("amplitude", [0.6, 0.8, 1.0])
def test_owl_windows_are_three_to_four_hours_later_than_lark(
    task_type: TaskType, amplitude: float
) -> None:
    lark = find_windows(amplitude, task_type, Chronotype.LARK)[0].start_hour
    dove = find_windows(amplitude, task_type, Chronotype.DOVE)[0].start_hour
    owl = find_windows(amplitude, task_type, Chronotype.OWL)[0].start_hour

    assert lark < dove < owl
    assert 3 <= owl - lark <= 4  # требование ТЗ


# ---------- рутина ----------


def test_without_active_types_the_whole_day_is_routine() -> None:
    for chronotype in Chronotype:
        windows = find_routine_windows({}, chronotype)
        hours = active_hours(chronotype)

        assert spans(windows) == [(hours.start, hours.stop)]
        assert windows[0].task_type is TaskType.ROUTINE
        assert windows[0].score == 1.0


def test_routine_windows_avoid_peaks() -> None:
    amplitudes = {TaskType.INTELLECTUAL: 0.95, TaskType.PHYSICAL: 0.8}

    windows = find_routine_windows(amplitudes, Chronotype.DOVE)
    busy = set()
    for task_type, amplitude in amplitudes.items():
        for w in find_windows(amplitude, task_type, Chronotype.DOVE):
            busy.update(range(w.start_hour, w.end_hour))
    routine_hours = {h for w in windows for h in range(w.start_hour, w.end_hour)}

    assert windows
    assert len(windows) <= MAX_ROUTINE_WINDOWS
    assert not routine_hours & busy


def test_format_window() -> None:
    windows = find_windows(0.95, TaskType.INTELLECTUAL, Chronotype.DOVE)

    assert format_window(windows[0]) == "10:00–12:00"


# ---------- рекомендации на день ----------


def test_normal_day_without_critical_cycles() -> None:
    # 2024-09-11: все три цикла сильные и положительные, критических дней нет
    result = recommend(BIRTH, date(2024, 9, 11), Chronotype.DOVE)
    types = {w.task_type for w in result.focus_windows}

    assert result.critical_level is CriticalLevel.NONE
    assert result.rest_recommended is False
    assert result.warnings == ()
    assert types == {*FOCUS, TaskType.ROUTINE}


def test_negative_cycles_give_no_windows_for_their_types() -> None:
    # 2026-11-15: физический и эмоциональный циклы на спаде (−1.00 и −0.22)
    result = recommend(BIRTH, date(2026, 11, 15), Chronotype.DOVE)
    types = {w.task_type for w in result.focus_windows}

    assert TaskType.PHYSICAL not in types
    assert TaskType.SOCIAL_CREATIVE not in types
    assert TaskType.ROUTINE in types
    assert "выраженного пика сегодня нет" in result.summary


def test_single_critical_day_excludes_only_that_type() -> None:
    result = recommend(BIRTH, day(11), Chronotype.DOVE)  # физический цикл пересекает ноль
    types = {w.task_type for w in result.focus_windows}

    assert result.critical_level is CriticalLevel.SINGLE
    assert TaskType.PHYSICAL not in types
    assert {TaskType.INTELLECTUAL, TaskType.SOCIAL_CREATIVE} <= types
    assert [w.code for w in result.warnings] == ["CRITICAL_PHYSICAL"]
    assert result.warnings[0].severity is Severity.WARNING
    assert result.rest_recommended is False
    assert "критический день" in result.summary


def test_double_critical_day() -> None:
    result = recommend(BIRTH, day(644), Chronotype.DOVE)  # физический и эмоциональный в нуле

    assert result.critical_level is CriticalLevel.DOUBLE
    assert result.rest_recommended is True
    assert [w.code for w in result.warnings] == [
        "CRITICAL_PHYSICAL",
        "CRITICAL_EMOTIONAL",
        "DOUBLE_CRITICAL",
    ]
    assert {w.task_type for w in result.focus_windows} == {TaskType.ROUTINE}
    assert "Двойной критический день" in result.summary


def test_triple_critical_day() -> None:
    result = recommend(BIRTH, BIRTH, Chronotype.DOVE)

    assert result.critical_level is CriticalLevel.TRIPLE
    assert result.rest_recommended is True
    assert [w.code for w in result.warnings] == [
        "CRITICAL_PHYSICAL",
        "CRITICAL_EMOTIONAL",
        "CRITICAL_INTELLECTUAL",
        "TRIPLE_CRITICAL",
    ]
    assert result.warnings[-1].severity is Severity.CRITICAL
    assert spans(result.focus_windows) == [(7, 23)]  # на рутину всё активное время
    assert "Тройной критический день" in result.summary


def test_chronotype_changes_windows() -> None:
    results = {c: recommend(BIRTH, date(2024, 9, 11), c) for c in Chronotype}
    first_windows = {c: spans(r.focus_windows)[0] for c, r in results.items()}

    assert len(set(first_windows.values())) == 3
    assert all(r.chronotype is c for c, r in results.items())


def test_recommendation_is_deterministic() -> None:
    first = recommend(BIRTH, date(2024, 9, 11), Chronotype.OWL)
    second = recommend(BIRTH, date(2024, 9, 11), Chronotype.OWL)

    assert first == second


def test_date_before_birth_is_rejected() -> None:
    with pytest.raises(ValueError):
        recommend(BIRTH, date(1999, 12, 31), Chronotype.DOVE)


def test_windows_are_ordered_by_type_then_time() -> None:
    result = recommend(BIRTH, date(2024, 9, 11), Chronotype.DOVE)
    order = [*FOCUS_TYPES, TaskType.ROUTINE]
    keys = [(order.index(w.task_type), w.start_hour) for w in result.focus_windows]

    assert keys == sorted(keys)


# ---------- свойства на трёх годах для каждого хронотипа ----------


@pytest.mark.parametrize("chronotype", list(Chronotype))
def test_invariants_hold_for_every_day_of_three_years(chronotype: Chronotype) -> None:
    for offset in range(9000, 9000 + 3 * 365):
        target = day(offset)
        result = recommend(BIRTH, target, chronotype)
        critical = analyze_day(BIRTH, target)
        hours = active_hours(chronotype)
        critical_types = {TYPE_FOR_CYCLE[c.cycle] for c in critical.cycles}
        where = (chronotype, target)

        # уровень и отдых согласованы с расчётом критических дней
        assert result.critical_level is critical.level, where
        assert result.rest_recommended is (
            critical.level in (CriticalLevel.DOUBLE, CriticalLevel.TRIPLE)
        ), where

        # предупреждения: по одному на критический цикл плюс общее при double/triple
        expected = [f"CRITICAL_{c.cycle.name}" for c in critical.cycles]
        if critical.level is CriticalLevel.DOUBLE:
            expected.append("DOUBLE_CRITICAL")
        if critical.level is CriticalLevel.TRIPLE:
            expected.append("TRIPLE_CRITICAL")
        assert [w.code for w in result.warnings] == expected, where

        # окна: в пределах активного времени, критические типы исключены, число ограничено
        by_type: dict[TaskType, list] = {}
        for w in result.focus_windows:
            assert hours.start <= w.start_hour < w.end_hour <= 24, where
            assert w.task_type not in critical_types, where
            by_type.setdefault(w.task_type, []).append(w)
        for task_type, windows in by_type.items():
            limit = MAX_ROUTINE_WINDOWS if task_type is TaskType.ROUTINE else MAX_WINDOWS_PER_TYPE
            assert len(windows) <= limit, where
            if task_type is not TaskType.ROUTINE:
                assert all(w.score >= MIN_PEAK_SCORE for w in windows), where

        # рутина не пересекается с окнами других типов задач
        routine = {
            h
            for w in by_type.get(TaskType.ROUTINE, [])
            for h in range(w.start_hour, w.end_hour)
        }
        busy = {
            h
            for t, ws in by_type.items()
            if t is not TaskType.ROUTINE
            for w in ws
            for h in range(w.start_hour, w.end_hour)
        }
        assert not routine & busy, where

        # текст содержит каждое окно и не пустой
        assert result.summary, where
        for w in result.focus_windows:
            assert format_window(w) in result.summary, where


def test_all_cycle_names_are_mapped_to_task_types() -> None:
    assert set(TYPE_FOR_CYCLE) == set(CycleName)
