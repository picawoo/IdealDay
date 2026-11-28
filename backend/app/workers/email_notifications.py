import argparse
import asyncio
import logging
from collections.abc import Callable
from email.message import EmailMessage
from smtplib import SMTPException

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.clock import Clock, system_clock
from app.core.config import get_settings
from app.db.session import create_engine, create_session_factory
from app.repositories import notifications
from app.services.email_reminders import SMTPTransport, build_email, local_reminder_time

logger = logging.getLogger(__name__)

ACCOUNT_BATCH_SIZE = 200
MAX_DELIVERIES_PER_CYCLE = 25


async def run_cycle(
    sessions: async_sessionmaker[AsyncSession],
    send_email: Callable[[EmailMessage], None],
    sender: str,
    clock: Clock = system_clock,
) -> int:
    now = clock()
    after = None
    while True:
        async with sessions.begin() as session:
            accounts = await notifications.eligible_accounts(session, after, ACCOUNT_BATCH_SIZE)
            due = []
            for user_id, minute, timezone in accounts:
                target, local_minute = local_reminder_time(now, timezone)
                if local_minute >= minute:
                    due.append((user_id, target))
            await notifications.enqueue(session, due, now)
        if len(accounts) < ACCOUNT_BATCH_SIZE:
            break
        after = accounts[-1][0]

    delivered = 0
    for _ in range(MAX_DELIVERIES_PER_CYCLE):
        async with sessions.begin() as session:
            job = await notifications.claim(session, clock())
        if job is None:
            break
        message = build_email(
            sender=sender,
            recipient=job.email,
            user_id=job.user_id,
            target=job.local_date,
            task_titles=job.task_titles,
            now=clock(),
        )
        try:
            await asyncio.to_thread(send_email, message)
        except (SMTPException, OSError) as exc:
            logger.warning(
                "SMTP delivery failed on attempt %d (%s)", job.attempts, type(exc).__name__
            )
            sent = False
        else:
            sent = True
            delivered += 1
        async with sessions.begin() as session:
            await notifications.finish(session, job, clock(), sent=sent)
    return delivered


async def main(*, once: bool) -> None:
    settings = get_settings()
    if not settings.smtp_host or not settings.smtp_from:
        raise SystemExit("Для запуска уведомлений задайте SMTP_HOST и SMTP_FROM")
    mailer = SMTPTransport(
        host=settings.smtp_host,
        port=settings.smtp_port,
        security=settings.smtp_security,
        timeout=settings.smtp_timeout_seconds,
        username=settings.smtp_username,
        password=settings.smtp_password.get_secret_value() if settings.smtp_password else None,
    )
    engine = create_engine(settings.database_url)
    sessions = create_session_factory(engine)
    try:
        if once:
            delivered = await run_cycle(sessions, mailer.send, settings.smtp_from)
            logger.info("Accepted by SMTP: %d", delivered)
            return
        while True:
            try:
                await run_cycle(sessions, mailer.send, settings.smtp_from)
            except (SQLAlchemyError, OSError) as exc:
                logger.error("Notification cycle failed (%s)", type(exc).__name__)
            await asyncio.sleep(settings.notification_poll_seconds)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Доставка email-уведомлений IdealDay")
    parser.add_argument("--once", action="store_true", help="Выполнить только один цикл очереди")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main(once=args.once))
