import pytest

from app.core.circadian import CHRONOTYPES, circadian_level, slot_level
from app.core.enums import Chronotype, TaskType

PROFILED_TYPES = [TaskType.INTELLECTUAL, TaskType.PHYSICAL, TaskType.SOCIAL_CREATIVE]
GRID = [i / 4 for i in range(0, 96)]  # каждые 15 минут


def argmax_hour(task_type: TaskType, chronotype: Chronotype) -> float:
    return max(GRID, key=lambda h: circadian_level(task_type, h, chronotype))


@pytest.mark.parametrize("task_type", PROFILED_TYPES)
@pytest.mark.parametrize("chronotype", list(Chronotype))
def test_levels_are_between_zero_and_one(task_type: TaskType, chronotype: Chronotype) -> None:
    for hour in GRID:
        assert 0.0 <= circadian_level(task_type, hour, chronotype) <= 1.0
    for start in range(24):
        assert 0.0 <= slot_level(task_type, start, chronotype) <= 1.0


@pytest.mark.parametrize(
    ("task_type", "expected_peak"),
    [
        (TaskType.INTELLECTUAL, 10.75),
        (TaskType.PHYSICAL, 15.5),
        (TaskType.SOCIAL_CREATIVE, 17.0),
    ],
)
def test_dove_peaks_are_where_the_profile_says(task_type: TaskType, expected_peak: float) -> None:
    assert abs(argmax_hour(task_type, Chronotype.DOVE) - expected_peak) <= 0.5


@pytest.mark.parametrize("task_type", PROFILED_TYPES)
def test_chronotype_shifts_the_whole_curve(task_type: TaskType) -> None:
    lark = argmax_hour(task_type, Chronotype.LARK)
    dove = argmax_hour(task_type, Chronotype.DOVE)
    owl = argmax_hour(task_type, Chronotype.OWL)

    assert dove - lark == -CHRONOTYPES[Chronotype.LARK].shift_hours
    assert owl - dove == CHRONOTYPES[Chronotype.OWL].shift_hours
    assert 3 <= owl - lark <= 4  # требование ТЗ: сова позже жаворонка на 3–4 часа


@pytest.mark.parametrize("task_type", PROFILED_TYPES)
def test_night_level_is_negligible(task_type: TaskType) -> None:
    assert circadian_level(task_type, 3.0, Chronotype.DOVE) < 0.01


def test_second_intellectual_wave_is_lower_than_the_morning_peak() -> None:
    morning = circadian_level(TaskType.INTELLECTUAL, 10.75, Chronotype.DOVE)
    afternoon = circadian_level(TaskType.INTELLECTUAL, 14.0, Chronotype.DOVE)
    lunch_dip = circadian_level(TaskType.INTELLECTUAL, 12.5, Chronotype.DOVE)

    assert afternoon < morning
    assert lunch_dip < afternoon  # между волнами есть провал


def test_slot_level_lies_between_neighbouring_point_values() -> None:
    values = [circadian_level(TaskType.PHYSICAL, 15 + i / 8, Chronotype.DOVE) for i in range(9)]

    assert min(values) <= slot_level(TaskType.PHYSICAL, 15, Chronotype.DOVE) <= max(values)


def test_wake_hours_and_shifts_match_chronotype_order() -> None:
    lark, dove, owl = (CHRONOTYPES[c] for c in (Chronotype.LARK, Chronotype.DOVE, Chronotype.OWL))

    assert lark.wake_hour < dove.wake_hour < owl.wake_hour
    assert lark.shift_hours < dove.shift_hours < owl.shift_hours
