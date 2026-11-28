from datetime import date

import pytest

from app.schemas.biorhythm import (
    DISCLAIMER,
    CriticalDaysResponse,
    DayResponse,
    PeriodResponse,
    TodayResponse,
)
from app.services.critical import CriticalLevel
from app.services.reports import (
    critical_report,
    day_report,
    period_report,
    today_from_period,
)

BIRTH = date(2000, 1, 1)
EXAMPLE_DAY = date(2026, 11, 15)  # t = 9815, пример из отчёта


def test_day_report_matches_known_example() -> None:
    day = day_report(BIRTH, EXAMPLE_DAY)

    assert day.date == EXAMPLE_DAY
    assert [c.cycle.value for c in day.cycles] == ["physical", "emotional", "intellectual"]
    assert [c.percent for c in day.cycles] == [-100, -22, 46]
    assert [c.day_in_cycle for c in day.cycles] == [17, 15, 14]
    assert day.critical.level is CriticalLevel.NONE
    assert day.critical.cycles == []


def test_day_report_marks_critical_day() -> None:
    day = day_report(BIRTH, date(2000, 1, 12))  # t = 11: физический цикл пересекает ноль

    assert day.critical.level is CriticalLevel.SINGLE
    assert [(c.cycle.value, c.transition.value) for c in day.critical.cycles] == [
        ("physical", "positive_to_negative")
    ]


def test_today_from_period_has_disclaimer_and_same_data_as_day_report() -> None:
    today = today_from_period(period_report(BIRTH, EXAMPLE_DAY, EXAMPLE_DAY))

    assert isinstance(today, TodayResponse)
    assert today.disclaimer == DISCLAIMER
    assert today.model_dump(exclude={"disclaimer"}) == day_report(BIRTH, EXAMPLE_DAY).model_dump()


def test_period_report_shape() -> None:
    report = period_report(BIRTH, date(2026, 11, 15), date(2026, 11, 21))

    assert (report.date_from, report.date_to) == (date(2026, 11, 15), date(2026, 11, 21))
    assert len(report.days) == 7
    assert report.days[0].date == date(2026, 11, 15)
    assert report.days[-1].date == date(2026, 11, 21)
    assert report.disclaimer == DISCLAIMER
    assert report.days[2].critical.level is CriticalLevel.SINGLE  # 17 ноября: интеллектуальный


def test_period_report_days_equal_day_reports() -> None:
    report = period_report(BIRTH, date(2026, 11, 1), date(2026, 11, 30))

    for day in report.days:
        assert day == day_report(BIRTH, day.date)


def test_critical_report_for_known_period() -> None:
    report = critical_report(BIRTH, date(2026, 11, 15), date(2026, 11, 29))

    assert [d.date for d in report.critical_days] == [
        date(2026, 11, 17),
        date(2026, 11, 21),
        date(2026, 11, 28),
    ]
    first_cycles = [
        (d.cycles[0].cycle.value, d.cycles[0].transition.value) for d in report.critical_days
    ]
    assert first_cycles == [
        ("intellectual", "positive_to_negative"),
        ("physical", "negative_to_positive"),
        ("emotional", "negative_to_positive"),
    ]
    assert report.disclaimer == DISCLAIMER


def test_critical_report_without_critical_days_is_empty() -> None:
    report = critical_report(BIRTH, date(2026, 11, 15), date(2026, 11, 16))

    assert report.critical_days == []


@pytest.mark.parametrize(
    ("builder", "model"),
    [
        (lambda: today_from_period(period_report(BIRTH, EXAMPLE_DAY, EXAMPLE_DAY)), TodayResponse),
        (lambda: day_report(BIRTH, EXAMPLE_DAY), DayResponse),
        (lambda: period_report(BIRTH, date(2026, 11, 1), date(2026, 11, 30)), PeriodResponse),
        (lambda: critical_report(BIRTH, date(2026, 1, 1), date(2026, 3, 31)), CriticalDaysResponse),
    ],
)
def test_reports_survive_json_roundtrip(builder, model) -> None:
    """Кэш хранит ответы как JSON: из JSON должен восстанавливаться равный объект."""
    report = builder()

    assert model.model_validate_json(report.model_dump_json()) == report
