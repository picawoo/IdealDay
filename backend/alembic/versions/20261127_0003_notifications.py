"""User preferences and daily email delivery history."""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_settings",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("email_notifications_enabled", sa.Boolean(), nullable=False),
        sa.Column("reminder_minute", sa.Integer(), nullable=False),
        sa.CheckConstraint(
            "reminder_minute BETWEEN 0 AND 1439",
            name=op.f("ck_user_settings_reminder_minute_valid"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"],
            name=op.f("fk_user_settings_user_id_users"), ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("user_id", name=op.f("pk_user_settings")),
    )
    op.create_table(
        "notification_deliveries",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("local_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(8), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("available_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('pending', 'sending', 'sent', 'failed', 'skipped')",
            name=op.f("ck_notification_deliveries_status_valid"),
        ),
        sa.CheckConstraint("attempts >= 0", name=op.f("ck_notification_deliveries_attempts_valid")),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"],
            name=op.f("fk_notification_deliveries_user_id_users"), ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("user_id", "local_date", name=op.f("pk_notification_deliveries")),
    )
    op.create_index(
        "ix_notification_deliveries_status_available_at", "notification_deliveries",
        ["status", "available_at"],
    )


def downgrade() -> None:
    op.drop_table("notification_deliveries")
    op.drop_table("user_settings")
