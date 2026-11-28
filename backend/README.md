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

## Задачи и расписание

- `POST /api/v1/tasks` создаёт задачу. Тело содержит `title`, `task_type`,
  `scheduled_date`, `duration_minutes` и необязательный `priority` (1–5, по умолчанию 3).
- `GET /api/v1/tasks` возвращает задачи пользователя. Доступны `date`, `limit` и `offset`.
  `GET`, `PUT` и `DELETE /api/v1/tasks/{task_id}` читают, заменяют и удаляют одну задачу.
- `GET /api/v1/schedule?date=YYYY-MM-DD` формирует расписание. Без даты используется сегодня в
  часовом поясе профиля. Ответ содержит окна задач, перерывы и причины, по которым задачи
  остались без времени. Начало и конец окна указаны в минутах от местной полуночи.
- `PATCH /api/v1/schedule/tasks/{task_id}` с `{"start_minute": 600}` закрепляет задачу на 10:00
  и пересчитывает остальные окна того дня. `{"start_minute": null}` снимает закрепление.

Планировщик начинает с задач с наивысшим приоритетом, учитывает хронотип и биоритмы
и работает на сетке в 5 минут. Обед запланирован на 13:00–13:30, между задачами есть
минимум 10 минут. При конфликте ручного времени API возвращает `409 SCHEDULE_CONFLICT`.
Для задач требуется токен, для расписания дополнительно нужен профиль.

## Настройки и email-уведомления

Все маршруты требуют токен. По умолчанию письма выключены, время напоминания — `08:00`.

| Запрос | Результат |
| --- | --- |
| `GET /api/v1/settings` | Предпочтения и часовой пояс профиля. Если профиля нет, используется UTC. |
| `PUT /api/v1/settings` | Сохраняет `{"email_notifications_enabled":true,"email_reminder_time":"08:00"}`. |
| `GET /api/v1/notifications?limit=30` | История писем с датой, статусом, числом попыток и временем отправки. |

Ежедневное письмо отправляется на адрес аккаунта после наступления выбранного местного времени.
В письмо входят до 30 задач на эту дату, сначала более приоритетные. Если задач нет, приходит
короткая сводка об этом. В очереди создаётся одна запись на пользователя и местную дату.

После ошибки SMTP воркер повторяет отправку через 5 и 10 минут, всего до трёх попыток. История
показывает `pending`, `sending`, `sent`, `failed` или `skipped`. `sent` означает, что SMTP-сервер
принял письмо. `skipped` означает, что рассылка была выключена или местная дата уже сменилась.
Если связь прервалась после принятия письма сервером, повторная попытка может доставить дубликат.
У попыток одной доставки одинаковый `Message-ID`.

Добавьте в `.env` параметры своего SMTP-сервера по примеру `.env.example`, задав `SMTP_HOST`,
`SMTP_FROM`, `SMTP_PORT` и `SMTP_SECURITY` (`starttls` или `ssl`). Для авторизации укажите вместе
`SMTP_USERNAME` и `SMTP_PASSWORD`. Режим `plain` доступен для локального SMTP без авторизации.
Контейнер API применяет миграции при запуске.

```bash
docker compose --profile notifications up -d --build
docker compose logs -f email-notifications
# Один цикл очереди вместо фонового процесса
docker compose exec api python -m app.workers.email_notifications --once
# Тесты API и миграций с подменой SMTP
docker compose run --rm api pytest tests/api/test_notifications.py tests/db/test_migrations.py
```

## Производительность

Из каталога `backend` выполните `python -m scripts.benchmark --iterations 200`.
Ниже результаты 200 замеров после прогрева, Windows и Python 3.12.14.

| Операция | p50, мс | p95, мс |
| --- | ---: | ---: |
| Расчёт рекомендаций | 0,58 | 0,96 |
| Планировщик, 10 задач | 2,90 | 5,54 |
| Планировщик, 100 задач | 4,33 | 6,54 |
| Планировщик, 1 000 задач | 5,26 | 7,05 |
| Расчёт времени отправки для 1 000 пользователей | 0,81 | 1,16 |
| Формирование письма с 30 задачами | 1,10 | 1,69 |

Эти замеры покрывают вычисления в процессе Python. Время HTTP, PostgreSQL, Redis и SMTP
в таблицу не входит.
