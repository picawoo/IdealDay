"""Tasks and manually fixed start times."""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tasks",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("task_type", sa.String(16), nullable=False),
        sa.Column("scheduled_date", sa.Date(), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False),
        sa.Column("fixed_start_minute", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "task_type IN ('intellectual', 'physical', 'social_creative', 'routine')",
            name=op.f("ck_tasks_task_type_valid"),
        ),
        sa.CheckConstraint(
            "duration_minutes BETWEEN 5 AND 960 AND duration_minutes % 5 = 0",
            name=op.f("ck_tasks_duration_valid"),
        ),
        sa.CheckConstraint("priority BETWEEN 1 AND 5", name=op.f("ck_tasks_priority_valid")),
        sa.CheckConstraint(
            "fixed_start_minute BETWEEN 0 AND 1435 AND fixed_start_minute % 5 = 0 "
            "AND fixed_start_minute + duration_minutes <= 1440",
            name=op.f("ck_tasks_fixed_start_valid"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_tasks_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_tasks")),
    )
    op.create_index("ix_tasks_user_id_scheduled_date", "tasks", ["user_id", "scheduled_date"])


def downgrade() -> None:
    op.drop_table("tasks")
