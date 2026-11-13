import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest

from app.core.config import Settings
from app.core.errors import UnauthorizedError
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)

TEST_DATABASE = "postgresql+asyncpg://test:test@localhost/test"


def make_settings(secret: str) -> Settings:
    # Секреты обязательны и значений по умолчанию не имеют, поэтому задаём их явно
    return Settings(jwt_secret=secret, database_url=TEST_DATABASE)


SETTINGS = make_settings("test-secret-test-secret-test-secret-123")


def test_password_hash_roundtrip() -> None:
    hashed = hash_password("correct-horse-battery")

    assert hashed != "correct-horse-battery"
    assert verify_password("correct-horse-battery", hashed)
    assert not verify_password("wrong-password", hashed)


def test_same_password_gives_different_hashes() -> None:
    assert hash_password("same-password-123") != hash_password("same-password-123")


def test_token_roundtrip() -> None:
    user_id = uuid.uuid4()

    token = create_access_token(user_id, SETTINGS)

    assert decode_access_token(token, SETTINGS) == user_id


def test_expired_token_is_rejected() -> None:
    token = create_access_token(uuid.uuid4(), SETTINGS, expires_delta=timedelta(minutes=-1))

    with pytest.raises(UnauthorizedError):
        decode_access_token(token, SETTINGS)


def test_token_signed_with_other_secret_is_rejected() -> None:
    other = make_settings("another-secret-another-secret-another-1")
    token = create_access_token(uuid.uuid4(), other)

    with pytest.raises(UnauthorizedError):
        decode_access_token(token, SETTINGS)


def test_token_without_subject_is_rejected() -> None:
    payload = {"exp": datetime.now(UTC) + timedelta(minutes=5)}
    token = jwt.encode(payload, SETTINGS.jwt_secret, algorithm="HS256")

    with pytest.raises(UnauthorizedError):
        decode_access_token(token, SETTINGS)


def test_token_with_non_uuid_subject_is_rejected() -> None:
    payload = {"sub": "not-a-uuid", "exp": datetime.now(UTC) + timedelta(minutes=5)}
    token = jwt.encode(payload, SETTINGS.jwt_secret, algorithm="HS256")

    with pytest.raises(UnauthorizedError):
        decode_access_token(token, SETTINGS)


def test_unsigned_token_with_alg_none_is_rejected() -> None:
    payload = {"sub": str(uuid.uuid4()), "exp": datetime.now(UTC) + timedelta(minutes=5)}
    token = jwt.encode(payload, None, algorithm="none")

    with pytest.raises(UnauthorizedError):
        decode_access_token(token, SETTINGS)


def test_garbage_token_is_rejected() -> None:
    with pytest.raises(UnauthorizedError):
        decode_access_token("not-a-token", SETTINGS)
