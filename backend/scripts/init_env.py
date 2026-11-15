#!/usr/bin/env python3
"""Создаёт .env со случайными секретами для локальной разработки (только стандартная библиотека)."""

import secrets
import sys
from pathlib import Path

ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


def main() -> int:
    if ENV_FILE.exists():
        print(f"{ENV_FILE} уже существует, ничего не меняю. Удалите файл, чтобы создать заново.")
        return 1
    # token_urlsafe даёт только A-Z a-z 0-9 - _, поэтому пароль безопасно подставлять в URL БД
    ENV_FILE.write_text(
        "POSTGRES_USER=idealday\n"
        "POSTGRES_DB=idealday\n"
        f"POSTGRES_PASSWORD={secrets.token_urlsafe(24)}\n"
        f"JWT_SECRET={secrets.token_urlsafe(48)}\n",
        encoding="utf-8",
    )
    try:
        ENV_FILE.chmod(0o600)  # читать может только владелец (на Windows игнорируется)
    except OSError:
        pass
    print(f"Создан {ENV_FILE} со случайными POSTGRES_PASSWORD и JWT_SECRET.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
