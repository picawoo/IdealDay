from datetime import date, timedelta

import pytest
from pydantic import ValidationError

from app.core.enums import Chronotype
from app.schemas.auth import RegisterRequest
from app.schemas.profile import ProfileUpsert


def test_profile_defaults() -> None:
    profile = ProfileUpsert(birth_date=date(2000, 1, 1))

    assert profile.chronotype is Chronotype.DOVE
    assert profile.timezone == "UTC"


def test_profile_accepts_full_data() -> None:
    profile = ProfileUpsert(
        birth_date=date(1990, 5, 17), chronotype="owl", timezone="Europe/Moscow"
    )

    assert profile.chronotype is Chronotype.OWL
    assert profile.timezone == "Europe/Moscow"


def test_profile_accepts_29_february() -> None:
    assert ProfileUpsert(birth_date=date(2000, 2, 29)).birth_date == date(2000, 2, 29)


def test_profile_accepts_lower_bound() -> None:
    assert ProfileUpsert(birth_date=date(1900, 1, 1)).birth_date == date(1900, 1, 1)


@pytest.mark.parametrize(
    "data",
    [
        {"birth_date": date(1899, 12, 31)},
        {"birth_date": date.today() + timedelta(days=2)},
        {"birth_date": date(2000, 1, 1), "chronotype": "hawk"},
        {"birth_date": date(2000, 1, 1), "timezone": "Mars/Olympus"},
        {"birth_date": date(2000, 1, 1), "timezone": ""},
        {"birth_date": date(2000, 1, 1), "timezone": "../../etc/passwd"},
        {"chronotype": "owl"},
    ],
)
def test_profile_rejects_invalid_data(data: dict) -> None:
    with pytest.raises(ValidationError):
        ProfileUpsert(**data)


def test_register_normalizes_email() -> None:
    request = RegisterRequest(email="  Alice@IdealDay.APP ", password="long-enough-password")

    assert request.email == "alice@idealday.app"


@pytest.mark.parametrize(
    "data",
    [
        {"email": "not-an-email", "password": "long-enough-password"},
        {"email": "alice@idealday.app", "password": "short"},
        {"email": "alice@idealday.app", "password": "x" * 129},
    ],
)
def test_register_rejects_invalid_data(data: dict) -> None:
    with pytest.raises(ValidationError):
        RegisterRequest(**data)
