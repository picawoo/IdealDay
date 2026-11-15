"""Рекомендации на день: окна для типов задач по биоритмам и хронотипу. Чистые функции."""

from dataclasses import dataclass
from datetime import date
from enum import StrEnum

from app.core.circadian import (
    ACTIVE_HOURS,
    CHRONOTYPES,
    DAY_END_HOUR,
    MAX_ROUTINE_WINDOWS,
    MAX_WINDOWS_PER_TYPE,
    MIN_PEAK_SCORE,
    ROUTINE_MAX_SCORE,
    WINDOW_RELATIVE_THRESHOLD,
    slot_level,
)
from app.core.enums import Chronotype, TaskType
from app.services.biorhythm import CycleName, calculate_day
from app.services.critical import CriticalLevel, analyze_day

CYCLE_FOR_TYPE: dict[TaskType, CycleName] = {
    TaskType.INTELLECTUAL: CycleName.INTELLECTUAL,
    TaskType.PHYSICAL: CycleName.PHYSICAL,
    TaskType.SOCIAL_CREATIVE: CycleName.EMOTIONAL,
}
FOCUS_TYPES = tuple(CYCLE_FOR_TYPE)

LABELS: dict[TaskType, str] = {
    TaskType.INTELLECTUAL: "Сложные интеллектуальные задачи",
    TaskType.PHYSICAL: "Физическая активность",
    TaskType.SOCIAL_CREATIVE: "Общение и творчество",
    TaskType.ROUTINE: "Рутина и лёгкие дела",
}

CRITICAL_MESSAGES: dict[CycleName, str] = {
    CycleName.PHYSICAL: "Физический цикл пересекает ноль: избегайте тяжёлых нагрузок "
    "и тренировок на пределе возможностей.",
    CycleName.EMOTIONAL: "Эмоциональный цикл пересекает ноль: возможны перепады настроения, "
    "лучше отложить сложные переговоры и острые разговоры.",
    CycleName.INTELLECTUAL: "Интеллектуальный цикл пересекает ноль: избегайте рискованных "
    "решений и сложной аналитической работы.",
}
DOUBLE_MESSAGE = (
    "Двойной критический день: значительно снизьте нагрузку, избегайте рискованных решений "
    "и больше отдыхайте."
)
TRIPLE_MESSAGE = (
    "Тройной критический день: снизьте нагрузку до минимума, не принимайте рискованных "
    "решений и отдыхайте."
)


class Severity(StrEnum):
    WARNING = "warning"
    CRITICAL = "critical"


@dataclass(frozen=True, slots=True)
class FocusWindow:
    task_type: TaskType
    start_hour: int  # включительно, локальное время
    end_hour: int  # не включительно, до 24
    # Для типов задач: средняя оценка слотов окна (0..1).
    # Для рутины: насколько окно свободно от пиков (чем ближе к 1, тем спокойнее).
    score: float


@dataclass(frozen=True, slots=True)
class RecommendationWarning:
    code: str
    severity: Severity
    message: str


@dataclass(frozen=True, slots=True)
class Recommendation:
    date: date
    chronotype: Chronotype
    critical_level: CriticalLevel
    rest_recommended: bool
    summary: str
    focus_windows: tuple[FocusWindow, ...]
    warnings: tuple[RecommendationWarning, ...]


def active_hours(chronotype: Chronotype) -> range:
    """Часы активного времени суток в пределах одного календарного дня."""
    wake = CHRONOTYPES[chronotype].wake_hour
    return range(wake, min(wake + ACTIVE_HOURS, DAY_END_HOUR))


def slot_scores(
    amplitude: float, task_type: TaskType, chronotype: Chronotype
) -> list[tuple[int, float]]:
    """Оценка каждого часового слота: амплитуда цикла дня на суточный профиль."""
    amplitude = max(0.0, amplitude)  # на спаде цикла пиков нет
    return [
        (hour, amplitude * slot_level(task_type, hour, chronotype))
        for hour in active_hours(chronotype)
    ]


def _contiguous(slots: list[tuple[int, float]]) -> list[list[tuple[int, float]]]:
    groups: list[list[tuple[int, float]]] = []
    for slot in slots:
        if groups and slot[0] == groups[-1][-1][0] + 1:
            groups[-1].append(slot)
        else:
            groups.append([slot])
    return groups


def _mean(slots: list[tuple[int, float]]) -> float:
    return sum(score for _, score in slots) / len(slots)


def find_windows(
    amplitude: float, task_type: TaskType, chronotype: Chronotype
) -> list[FocusWindow]:
    """До двух лучших окон дня для типа задач (по возрастанию времени начала)."""
    scores = slot_scores(amplitude, task_type, chronotype)
    day_best = max(score for _, score in scores)

    threshold = WINDOW_RELATIVE_THRESHOLD * day_best
    strong = [slot for slot in scores if slot[1] >= threshold]
    windows = [
        FocusWindow(task_type, group[0][0], group[-1][0] + 1, round(_mean(group), 2))
        for group in _contiguous(strong)
    ]
    # Слабые окна (средняя оценка ниже порога) не рекомендуем: на слабом цикле пика нет
    windows = [w for w in windows if w.score >= MIN_PEAK_SCORE]
    best = sorted(windows, key=lambda w: w.score, reverse=True)[:MAX_WINDOWS_PER_TYPE]
    return sorted(best, key=lambda w: w.start_hour)


def find_routine_windows(
    amplitudes: dict[TaskType, float], chronotype: Chronotype
) -> list[FocusWindow]:
    """Часы, в которые ни один из переданных типов задач не на пике: время для рутины."""
    per_type = [slot_scores(a, t, chronotype) for t, a in amplitudes.items()]
    hours = active_hours(chronotype)
    busiest = [
        (hour, max((scores[i][1] for scores in per_type), default=0.0))
        for i, hour in enumerate(hours)
    ]

    calm = [slot for slot in busiest if slot[1] < ROUTINE_MAX_SCORE]
    windows = [
        FocusWindow(TaskType.ROUTINE, g[0][0], g[-1][0] + 1, round(1 - _mean(g), 2))
        for g in _contiguous(calm)
    ]
    longest = sorted(windows, key=lambda w: w.end_hour - w.start_hour, reverse=True)
    return sorted(longest[:MAX_ROUTINE_WINDOWS], key=lambda w: w.start_hour)


def format_window(window: FocusWindow) -> str:
    return f"{window.start_hour:02d}:00–{window.end_hour:02d}:00"


def _type_sentence(
    task_type: TaskType, windows: list[FocusWindow], critical: bool
) -> str | None:
    label = LABELS[task_type]
    if critical:
        return f"{label}: сегодня критический день, от таких задач лучше воздержаться."
    if windows:
        return f"{label}: {', '.join(format_window(w) for w in windows)}."
    if task_type is TaskType.ROUTINE:
        return None
    return f"{label}: выраженного пика сегодня нет."


def recommend(birth_date: date, target_date: date, chronotype: Chronotype) -> Recommendation:
    day = calculate_day(birth_date, target_date)
    critical = analyze_day(birth_date, target_date)
    amplitudes = {c.cycle: c.value for c in day.cycles}
    critical_cycles = {c.cycle for c in critical.cycles}

    focus: list[FocusWindow] = []
    sentences: list[str] = []
    active: dict[TaskType, float] = {}  # типы, по которым сегодня не критический день

    for task_type in FOCUS_TYPES:
        cycle = CYCLE_FOR_TYPE[task_type]
        if cycle in critical_cycles:
            sentences.append(_type_sentence(task_type, [], critical=True) or "")
            continue
        active[task_type] = amplitudes[cycle]
        windows = find_windows(amplitudes[cycle], task_type, chronotype)
        focus.extend(windows)
        sentences.append(_type_sentence(task_type, windows, critical=False) or "")

    routine = find_routine_windows(active, chronotype)
    focus.extend(routine)
    routine_sentence = _type_sentence(TaskType.ROUTINE, routine, critical=False)
    if routine_sentence:
        sentences.append(routine_sentence)

    warnings = [
        RecommendationWarning(
            code=f"CRITICAL_{c.cycle.name}",
            severity=Severity.WARNING,
            message=CRITICAL_MESSAGES[c.cycle],
        )
        for c in critical.cycles
    ]
    headline = ""
    if critical.level is CriticalLevel.DOUBLE:
        warnings.append(
            RecommendationWarning("DOUBLE_CRITICAL", Severity.WARNING, DOUBLE_MESSAGE)
        )
        headline = DOUBLE_MESSAGE
    elif critical.level is CriticalLevel.TRIPLE:
        warnings.append(
            RecommendationWarning("TRIPLE_CRITICAL", Severity.CRITICAL, TRIPLE_MESSAGE)
        )
        headline = TRIPLE_MESSAGE

    return Recommendation(
        date=target_date,
        chronotype=chronotype,
        critical_level=critical.level,
        rest_recommended=critical.level in (CriticalLevel.DOUBLE, CriticalLevel.TRIPLE),
        summary=" ".join(part for part in [headline, *sentences] if part),
        focus_windows=tuple(focus),
        warnings=tuple(warnings),
    )
