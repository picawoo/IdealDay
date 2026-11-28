import uuid
from datetime import UTC, datetime, timedelta
from functools import lru_cache

import jwt
from pwdlib import PasswordHash

from app.core.config import Settings
from app.core.errors import UnauthorizedError


@lru_cache
def _hasher() -> PasswordHash:
    return PasswordHash.recommended()


def hash_password(password: str) -> str:
    return _hasher().hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return _hasher().verify(password, password_hash)


@lru_cache
def _dummy_hash() -> str:
    return hash_password("dummy-password-for-timing")


def verify_dummy(password: str) -> None:
    """Проверка «вхолостую» для неизвестного email: время ответа не выдаёт, что пользователя нет."""
    verify_password(password, _dummy_hash())


def create_access_token(
    user_id: uuid.UUID, settings: Settings, expires_delta: timedelta | None = None
) -> str:
    now = datetime.now(UTC)
    expires = expires_delta if expires_delta is not None else timedelta(
        minutes=settings.jwt_expire_minutes
    )
    payload = {"sub": str(user_id), "iat": now, "exp": now + expires}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str, settings: Settings) -> uuid.UUID:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            options={"require": ["exp", "sub"]},
        )
        return uuid.UUID(payload["sub"])
    except (jwt.PyJWTError, ValueError, KeyError):
        raise UnauthorizedError() from None
