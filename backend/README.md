# Идеальный День — backend

## Запуск

```bash
python3 scripts/init_env.py   # создаёт .env со случайными секретами (на Windows: python)
docker compose up --build -d
```

- API: http://localhost:8000, документация: http://localhost:8000/docs
- Проверка: `curl http://localhost:8000/api/v1/health` → `{"status":"ok", ...}`
- PostgreSQL снаружи: `localhost:5433` (пользователь/пароль/БД из `.env`)

## Команды

```bash
docker compose run --rm api pytest                    # тесты
docker compose run --rm api ruff check .              # линтер
docker compose run --rm api ruff format .             # форматирование
docker compose run --rm api alembic current           # проверка, что Alembic подключается к БД
docker compose run --rm api alembic revision --autogenerate -m "message"   # новая миграция
docker compose run --rm api alembic upgrade head      # применить миграции
docker compose run --rm api uv lock                   # (опционально) создать uv.lock
docker compose logs -f api                            # логи
docker compose down                                   # остановить (данные БД сохраняются)
docker compose down -v                                # остановить и удалить данные БД
```

Тестовая БД `idealday_test` создаётся автоматически при первом запуске `pytest`.

## Расчёт (шаг 2)

Чистые функции без БД и HTTP: `app/services/biorhythm.py`, `app/services/critical.py`.

```bash
docker compose run --rm api pytest tests/unit                       # только unit-тесты
docker compose run --rm api pytest --cov=app/services --cov-report=term-missing
```

## Пользователи и профиль (шаг 3)

Миграции применяются автоматически при старте контейнера `api` (`alembic upgrade head`).

```bash
# регистрация и вход
curl -X POST localhost:8000/api/v1/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"alice@idealday.app","password":"correct-horse-battery"}'

TOKEN=$(curl -s -X POST localhost:8000/api/v1/auth/login \
  -d 'username=alice@idealday.app&password=correct-horse-battery' | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')

# профиль
curl -X PUT localhost:8000/api/v1/profile -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"birth_date":"2000-01-01","chronotype":"owl","timezone":"Europe/Moscow"}'
curl localhost:8000/api/v1/profile -H "Authorization: Bearer $TOKEN"
```

Удобнее всего в Swagger UI (`/docs`): кнопка Authorize, в поле username указывается email.

```bash
docker compose run --rm api pytest tests/db      # миграции и ограничения БД
docker compose run --rm api pytest tests/api     # API-тесты
```

## Секреты

В репозитории нет рабочих паролей и ключей: `.env` создаётся скриптом `scripts/init_env.py`
со случайными значениями и не коммитится (он в `.gitignore` и `.dockerignore`).
Без `POSTGRES_PASSWORD` и `JWT_SECRET` не стартует ни docker compose, ни само приложение.
`JWT_SECRET` должен быть не короче 32 символов.

Если пароль БД поменялся, а том `pgdata` остался от прежнего запуска, Postgres продолжит
принимать старый пароль. В dev-окружении: `docker compose down -v`, затем `docker compose up -d`.

## API биоритмов

Все эндпоинты требуют токен и профиль (дату рождения берут оттуда).

```bash
curl localhost:8000/api/v1/biorhythms/today -H "Authorization: Bearer $TOKEN"
curl "localhost:8000/api/v1/biorhythms?date_from=2026-11-15&date_to=2026-11-21" -H "Authorization: Bearer $TOKEN"
curl "localhost:8000/api/v1/biorhythms/critical-days?date_from=2026-11-15&date_to=2026-11-29" -H "Authorization: Bearer $TOKEN"
```

Ограничения периода: `date_from <= date_to`, не длиннее 92 дней (`MAX_PERIOD_DAYS`), не раньше даты рождения.

## Кэш

Кэшируются готовые ответы `/biorhythms`, `/biorhythms/critical-days` и `/biorhythms/today`
(последний делит запись с периодом из одного дня). Ключи: `bio:v1:{рождение}:{с}:{по}` и
`crit:v1:{рождение}:{с}:{по}`, TTL по умолчанию 24 часа (`CACHE_TTL_SECONDS`).
Ключ не содержит пользователя: кэш общий для всех с одинаковой датой рождения.

- Отключить: `CACHE_ENABLED=false`.
- Если Redis недоступен, ответ считается заново, запрос не падает (в логах WARNING).
- При изменении формулы или схемы ответа увеличьте `CACHE_VERSION` в `app/services/cache.py`.

```bash
docker compose exec redis redis-cli --scan --pattern 'bio:*'   # посмотреть ключи
docker compose exec redis redis-cli flushdb                     # сбросить кэш
```

## Рекомендатель

Чистая логика без БД и HTTP: `app/services/recommender.py`; все числа модели лежат в
`app/core/circadian.py` и меняются без правки алгоритма.

Как это работает: амплитуда цикла дня умножается на суточный профиль типа задач, сдвинутый по
хронотипу. Окно — подряд идущие часы не хуже 70% от лучшего часа дня; рекомендуется, только если
средняя оценка окна не ниже 0.4. У критического цикла окон нет, при double/triple
`rest_recommended = true`. Окна разных типов могут пересекаться: расставит их планировщик.

```bash
docker compose run --rm api pytest tests/unit/test_circadian.py tests/unit/test_recommender.py
```
