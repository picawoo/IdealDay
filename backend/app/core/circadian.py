import math
from dataclasses import dataclass

from app.core.enums import Chronotype, TaskType


@dataclass(frozen=True, slots=True)
class Peak:
    center: float  # час суток, на который приходится пик
    sigma: float  # ширина пика в часах
    weight: float  # относительная высота пика


@dataclass(frozen=True, slots=True)
class ChronotypeParams:
    shift_hours: float  # на сколько часов сдвигаются все пики относительно «голубя»
    wake_hour: int  # час начала активного времени


CHRONOTYPES: dict[Chronotype, ChronotypeParams] = {
    Chronotype.LARK: ChronotypeParams(shift_hours=-1.5, wake_hour=6),
    Chronotype.DOVE: ChronotypeParams(shift_hours=0.0, wake_hour=7),
    Chronotype.OWL: ChronotypeParams(shift_hours=2.0, wake_hour=9),
}

PROFILES: dict[TaskType, tuple[Peak, ...]] = {
    TaskType.INTELLECTUAL: (Peak(10.75, 1.1, 1.0), Peak(14.0, 0.9, 0.75)),
    TaskType.PHYSICAL: (Peak(15.5, 1.5, 1.0),),
    TaskType.SOCIAL_CREATIVE: (Peak(17.0, 2.5, 1.0),),
}

ACTIVE_HOURS = 16
DAY_END_HOUR = 24

MIN_PEAK_SCORE = 0.4
WINDOW_RELATIVE_THRESHOLD = 0.7
ROUTINE_MAX_SCORE = 0.2
MAX_WINDOWS_PER_TYPE = 2
SLOT_SAMPLES = 4
MAX_ROUTINE_WINDOWS = 3


def circadian_level(task_type: TaskType, hour: float, chronotype: Chronotype) -> float:
    """Суточный профиль типа задач в момент hour (0..24) для хронотипа, от 0 до 1."""
    x = hour - CHRONOTYPES[chronotype].shift_hours
    total = sum(
        peak.weight * math.exp(-((x - peak.center) ** 2) / (2 * peak.sigma**2))
        for peak in PROFILES[task_type]
    )
    return min(1.0, total)


def slot_level(task_type: TaskType, start_hour: int, chronotype: Chronotype) -> float:
    """Средний уровень профиля за часовой слот [start_hour, start_hour + 1).

    Усреднение по четырём точкам внутри часа делает результат независимым от того,
    как сдвиг хронотипа ложится на сетку часов (иначе окна «прыгали» бы на полчаса).
    """
    samples = [start_hour + (i + 0.5) / SLOT_SAMPLES for i in range(SLOT_SAMPLES)]
    return sum(circadian_level(task_type, h, chronotype) for h in samples) / SLOT_SAMPLES
