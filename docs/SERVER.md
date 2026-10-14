# Переезд на свой сервер в РК

Бесплатный стенд (Vercel + Supabase) — только для показа и пилота. Персональные данные студентов по закону РК «О персональных данных и их защите» (ст. 12 п. 2) хранятся в базе на территории РК, поэтому рабочая система ставится на сервер вуза или облако в Казахстане.

Код не нужно менять: тот же репозиторий собирается в Docker.

## 1. Сервер

Ориентир для 9000 студентов (уточнить нагрузочным тестом):

| Что | Ресурсы |
| --- | --- |
| Приложение + фоновые задачи | 8 vCPU, 16 ГБ |
| PostgreSQL 16 | 8 vCPU, 32 ГБ |
| Диск под базу и файлы | 500 ГБ SSD |

Можно начать с одного сервера на 16 vCPU / 48 ГБ и разнести базу позже. Видео идёт мимо сервера через CDN Bunny — канал вуза не нагружается.

ОС: Ubuntu 24.04 LTS, Docker Engine с плагином compose.

## 2. Установка

```bash
git clone https://github.com/kanojjand/TU_Courses.git /opt/tu-online
cd /opt/tu-online
cp .env.example .env
nano .env        # заполнить: APP_URL, POSTGRES_PASSWORD, S3_ACCESS_KEY, S3_SECRET_KEY, BUNNY_*, CRON_SECRET; DEMO_MODE=false
docker compose up -d --build
```

Что поднимется:

- `db` — PostgreSQL 16 (данные в томе `pgdata`);
- `minio` — хранилище файлов (PDF, слайды, сдачи заданий), консоль на 127.0.0.1:9001;
- `migrate` — применит миграции из `drizzle/` и завершится;
- `app` — сайт на 127.0.0.1:3000;
- `worker` — фоновые задачи pg-boss: каждые 10 минут закрывает тесты с истёкшим временем и сверяет видео, каждый день в 07:00 по Алматы — напоминания о сроках.

Снаружи сайт открывается через обратный прокси с HTTPS. Пример для Caddy (`/etc/caddy/Caddyfile`):

```
online.tashenev.edu.kz {
  reverse_proxy 127.0.0.1:3000
  request_body {
    max_size 250MB
  }
}
```

## 3. Перенос данных со стенда

На стенде все данные лежат в схеме `lms`. Дамп и восстановление:

```bash
# со стенда (строка подключения из Supabase, роль с правами на схему lms)
pg_dump "postgresql://…" --schema=lms --schema=lms_meta -Fc -f tu_online.dump

# на новом сервере, после первого docker compose up
docker compose cp tu_online.dump db:/tmp/
docker compose exec db pg_restore -U tu -d tu_online --clean --if-exists /tmp/tu_online.dump
```

Файлы со стенда (если загружались) лежат в таблице `lms.file_blobs` и переезжают вместе с дампом. Чтобы перенести их в MinIO, достаточно оставить как есть: драйвер `s3` читает старые файлы из базы, новые пишет в MinIO.

Видео остаются в Bunny — переносить нечего, ключи те же.

## 4. Бэкап

`scripts/backup.sh` — дамп базы и копия файлов MinIO, хранит 14 последних копий. Добавьте в crontab сервера:

```
15 2 * * *  BACKUP_DIR=/backup/tu-online /opt/tu-online/scripts/backup.sh >> /var/log/tu-backup.log 2>&1
```

Папку `/backup` держите на другом диске или сервере в РК. Восстановление — `pg_restore` из последнего дампа (около часа для полной базы).

## 5. Обновление

```bash
cd /opt/tu-online && git pull && docker compose up -d --build
```

Миграции применятся сами (сервис `migrate`).

## 6. Bunny Stream

1. bunny.net → Stream → создать библиотеку (регион хранения — Европа, раздача — вся сеть, точка в Алматы есть в обычной сети).
2. В библиотеке: API → Library ID и API Key; Security → включить Token Authentication и скопировать ключ; разрешить домен сайта.
3. Ввести ключи в «Админ → Интеграции» или в `.env` (`BUNNY_*`).
4. Webhook URL из той же страницы вставить в настройки библиотеки — статус обработки видео будет обновляться сам.

Оригиналы роликов храните ещё и у вуза: видеосервис — не архив.

## 7. Единый вход (позже)

Уровень 2 ТЗ: вход через LDAP или Active Directory вуза. Учётки уже связаны с Platonus по `external_ids`, поэтому подключение LDAP — замена проверки пароля в `src/lib/auth.ts` (`checkCredentials`), страницы менять не нужно.
