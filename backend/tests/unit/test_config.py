import pytest
from pydantic import ValidationError

from app.core.config import Settings

DATABASE = "postgresql+asyncpg://test:test@localhost/test"


def test_jwt_secret_is_required(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("JWT_SECRET", raising=False)

    with pytest.raises(ValidationError):
        Settings(_env_file=None, database_url=DATABASE)


def test_database_url_is_required(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)

    with pytest.raises(ValidationError):
        Settings(_env_file=None, jwt_secret="x" * 32)


def test_short_jwt_secret_is_rejected() -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, database_url=DATABASE, jwt_secret="x" * 31)


def test_jwt_secret_of_minimum_length_is_accepted() -> None:
    settings = Settings(_env_file=None, database_url=DATABASE, jwt_secret="x" * 32)

    assert settings.jwt_secret == "x" * 32
