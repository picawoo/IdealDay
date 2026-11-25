"""Repeatable CPU measurements without PostgreSQL, Redis or SMTP."""

import argparse
import platform
from collections.abc import Callable
from datetime import UTC, date, datetime
from statistics import median, quantiles
from time import perf_counter_ns
from uuid import UUID

from app.core.enums import Chronotype, TaskType
from app.services.email_reminders import build_email, local_reminder_time
from app.services.recommender import recommend
from app.services.scheduler import PlanningTask, build_schedule

BIRTH = date(2000, 1, 1)
DAY = date(2024, 9, 11)
NOW = datetime(2024, 9, 11, 3, 0, tzinfo=UTC)


def measure(name: str, operation: Callable[[], object], iterations: int) -> None:
    for _ in range(5):
        operation()
    samples = []
    for _ in range(iterations):
        started = perf_counter_ns()
        operation()
        samples.append((perf_counter_ns() - started) / 1_000_000)
    p95 = quantiles(samples, n=20, method="inclusive")[18]
    print(f"{name:<30} p50={median(samples):7.3f} ms  p95={p95:7.3f} ms")


def measure_schedule(size: int, iterations: int) -> None:
    kinds = tuple(TaskType)
    tasks = [
        PlanningTask(UUID(int=i + 1), f"Task {i + 1}", kinds[i % 4], 15 + i % 4 * 5, i % 5 + 1)
        for i in range(size)
    ]
    measure(
        f"schedule ({size} tasks)",
        lambda: build_schedule(tasks, BIRTH, DAY, Chronotype.DOVE),
        iterations,
    )


def main(iterations: int) -> None:
    print(f"Python {platform.python_version()} on {platform.system()}, {iterations} samples")
    measure("recommendations", lambda: recommend(BIRTH, DAY, Chronotype.DOVE), iterations)
    for size in (10, 100, 1000):
        measure_schedule(size, iterations)
    timezones = ("UTC", "Asia/Yekaterinburg", "Asia/Tokyo", "America/New_York") * 250
    measure(
        "reminder times (1000 users)",
        lambda: [local_reminder_time(NOW, zone) for zone in timezones],
        iterations,
    )
    titles = [f"Задача {i}" for i in range(30)]
    measure(
        "email MIME (30 tasks)",
        lambda: build_email(
            sender="sender@example.com",
            recipient="user@example.com",
            user_id=UUID(int=1),
            target=DAY,
            task_titles=titles,
            now=NOW,
        ).as_bytes(),
        iterations,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--iterations", type=int, default=100)
    args = parser.parse_args()
    if args.iterations < 20:
        parser.error("at least 20 iterations are required")
    main(args.iterations)
