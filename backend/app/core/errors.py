from fastapi import Request
from fastapi.responses import JSONResponse

_BEARER = {"WWW-Authenticate": "Bearer"}


class AppError(Exception):
    """Доменная ошибка: HTTP-статус и код. Формат ответа: {"error": {code, message}}."""

    status_code = 500
    code = "INTERNAL_ERROR"
    message = "Внутренняя ошибка сервера"
    headers: dict[str, str] | None = None

    def __init__(self, message: str | None = None) -> None:
        self.message = message or self.message
        super().__init__(self.message)


class UnauthorizedError(AppError):
    status_code = 401
    code = "UNAUTHORIZED"
    message = "Требуется авторизация"
    headers = _BEARER


class InvalidCredentialsError(AppError):
    status_code = 401
    code = "INVALID_CREDENTIALS"
    message = "Неверный email или пароль"
    headers = _BEARER


class EmailTakenError(AppError):
    status_code = 409
    code = "EMAIL_TAKEN"
    message = "Пользователь с таким email уже зарегистрирован"


class ProfileNotFoundError(AppError):
    status_code = 404
    code = "PROFILE_NOT_FOUND"
    message = "Профиль не создан: сначала заполните дату рождения через PUT /api/v1/profile"


class InvalidPeriodError(AppError):
    status_code = 422
    code = "INVALID_PERIOD"
    message = "date_from не может быть позже date_to"


class PeriodTooLongError(AppError):
    status_code = 422
    code = "PERIOD_TOO_LONG"
    message = "Период слишком длинный"


class DateBeforeBirthError(AppError):
    status_code = 422
    code = "DATE_BEFORE_BIRTH"
    message = "Дата не может быть раньше даты рождения из профиля"


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.code, "message": exc.message}},
        headers=exc.headers,
    )
