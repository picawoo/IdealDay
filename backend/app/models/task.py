import uuid
from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Task(Base):
    __tablename__ = "tasks"
    __table_args__ = (
        CheckConstraint(
            "task_type IN ('intellectual', 'physical', 'social_creative', 'routine')",
            name="task_type_valid",
        ),
        CheckConstraint(
            "duration_minutes BETWEEN 5 AND 960 AND duration_minutes % 5 = 0",
            name="duration_valid",
        ),
        CheckConstraint("priority BETWEEN 1 AND 5", name="priority_valid"),
        CheckConstraint(
            "fixed_start_minute BETWEEN 0 AND 1435 AND fixed_start_minute % 5 = 0 "
            "AND fixed_start_minute + duration_minutes <= 1440",
            name="fixed_start_valid",
        ),
        Index("ix_tasks_user_id_scheduled_date", "user_id", "scheduled_date"),
    )
    __mapper_args__ = {"eager_defaults": True}

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(200))
    task_type: Mapped[str] = mapped_column(String(16))
    scheduled_date: Mapped[date] = mapped_column(Date)
    duration_minutes: Mapped[int]
    priority: Mapped[int]
    fixed_start_minute: Mapped[int | None]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
