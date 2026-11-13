import uuid
from datetime import UTC, datetime, timedelta

import jwt
from httpx import AsyncClient

from app.core.config import get_settings
from app.core.security import create_access_token

REGISTER = "/api/v1/auth/register"
LOGIN = "/api/v1/auth/login"
PROFILE = "/api/v1/profile"
CREDENTIALS = {"email": "alice@idealday.app", "password": "correct-horse-battery"}


async def test_register_success(client: AsyncClient) -> None:
    response = await client.post(REGISTER, json=CREDENTIALS)

    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "alice@idealday.app"
    assert uuid.UUID(body["id"])
    assert "created_at" in body
    assert "password" not in body
    assert "password_hash" not in body


async def test_register_normalizes_email_case(client: AsyncClient) -> None:
    response = await client.post(REGISTER, json={**CREDENTIALS, "email": "Alice@IdealDay.app"})

    assert response.status_code == 201
    assert response.json()["email"] == "alice@idealday.app"


async def test_register_duplicate_email_is_rejected_case_insensitively(
    client: AsyncClient,
) -> None:
    await client.post(REGISTER, json=CREDENTIALS)

    response = await client.post(REGISTER, json={**CREDENTIALS, "email": "ALICE@idealday.app"})

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "EMAIL_TAKEN"


async def test_register_validation_errors(client: AsyncClient) -> None:
    bad_email = await client.post(REGISTER, json={**CREDENTIALS, "email": "nope"})
    short_password = await client.post(REGISTER, json={**CREDENTIALS, "password": "short"})

    assert bad_email.status_code == 422
    assert short_password.status_code == 422


async def test_login_success_returns_token_for_user(client: AsyncClient) -> None:
    registered = (await client.post(REGISTER, json=CREDENTIALS)).json()

    response = await client.post(
        LOGIN, data={"username": CREDENTIALS["email"], "password": CREDENTIALS["password"]}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    settings = get_settings()
    payload = jwt.decode(body["access_token"], settings.jwt_secret, algorithms=["HS256"])
    assert payload["sub"] == registered["id"]


async def test_login_email_is_case_insensitive(client: AsyncClient) -> None:
    await client.post(REGISTER, json=CREDENTIALS)

    response = await client.post(
        LOGIN, data={"username": "ALICE@IdealDay.app", "password": CREDENTIALS["password"]}
    )

    assert response.status_code == 200


async def test_login_wrong_password(client: AsyncClient) -> None:
    await client.post(REGISTER, json=CREDENTIALS)

    response = await client.post(
        LOGIN, data={"username": CREDENTIALS["email"], "password": "wrong-password-123"}
    )

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "INVALID_CREDENTIALS"


async def test_login_unknown_email_looks_the_same_as_wrong_password(client: AsyncClient) -> None:
    response = await client.post(
        LOGIN, data={"username": "nobody@idealday.app", "password": "whatever-password"}
    )

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "INVALID_CREDENTIALS"


async def test_protected_endpoint_without_token(client: AsyncClient) -> None:
    response = await client.get(PROFILE)

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"
    assert response.headers["www-authenticate"] == "Bearer"


async def test_protected_endpoint_with_garbage_token(client: AsyncClient) -> None:
    response = await client.get(PROFILE, headers={"Authorization": "Bearer not-a-token"})

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


async def test_protected_endpoint_with_expired_token(client: AsyncClient) -> None:
    registered = (await client.post(REGISTER, json=CREDENTIALS)).json()
    token = create_access_token(
        uuid.UUID(registered["id"]), get_settings(), expires_delta=timedelta(minutes=-5)
    )

    response = await client.get(PROFILE, headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401


async def test_protected_endpoint_with_token_of_unknown_user(client: AsyncClient) -> None:
    token = create_access_token(uuid.uuid4(), get_settings())

    response = await client.get(PROFILE, headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401


async def test_protected_endpoint_with_token_signed_by_other_secret(client: AsyncClient) -> None:
    registered = (await client.post(REGISTER, json=CREDENTIALS)).json()
    forged = jwt.encode(
        {"sub": registered["id"], "exp": datetime.now(UTC) + timedelta(minutes=5)},
        "some-other-secret-some-other-secret-1",
        algorithm="HS256",
    )

    response = await client.get(PROFILE, headers={"Authorization": f"Bearer {forged}"})

    assert response.status_code == 401
