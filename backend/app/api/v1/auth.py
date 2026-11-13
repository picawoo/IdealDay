import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, status
from fastapi.security import OAuth2PasswordRequestForm

from app.core.deps import SessionDep, SettingsDep
from app.core.errors import EmailTakenError, InvalidCredentialsError
from app.core.security import create_access_token, hash_password, verify_dummy, verify_password
from app.repositories import users as users_repo
from app.schemas.auth import RegisterRequest, TokenResponse, UserResponse
from app.schemas.errors import ErrorResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    response_model=UserResponse,
    responses={409: {"model": ErrorResponse}},
)
async def register(body: RegisterRequest, session: SessionDep) -> UserResponse:
    if await users_repo.get_by_email(session, body.email) is not None:
        raise EmailTakenError()
    password_hash = await asyncio.to_thread(hash_password, body.password)
    user = await users_repo.create(session, body.email, password_hash)
    return UserResponse.model_validate(user)


@router.post("/login", response_model=TokenResponse, responses={401: {"model": ErrorResponse}})
async def login(
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
    session: SessionDep,
    settings: SettingsDep,
) -> TokenResponse:
    """Форма OAuth2: в поле `username` передаётся email."""
    user = await users_repo.get_by_email(session, form.username.strip().lower())
    if user is None:
        await asyncio.to_thread(verify_dummy, form.password)
        raise InvalidCredentialsError()
    if not await asyncio.to_thread(verify_password, form.password, user.password_hash):
        raise InvalidCredentialsError()
    return TokenResponse(access_token=create_access_token(user.id, settings))
