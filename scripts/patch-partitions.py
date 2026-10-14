# Разбивка activity_events по месяцам: drizzle-kit не умеет PARTITION BY,
# поэтому после генерации первой миграции правим SQL этим скриптом.
import sys
p = sys.argv[1]
s = open(p).read()
old = '''	CONSTRAINT "activity_events_id_created_at_pk" PRIMARY KEY("id","created_at")
);'''
new = '''	CONSTRAINT "activity_events_id_created_at_pk" PRIMARY KEY("id","created_at")
) PARTITION BY RANGE ("created_at");
--> statement-breakpoint
-- Цифровой след разбит по месяцам: старые месяцы можно выгрузить в архив и удалить целиком.
-- Функция создаёт раздел месяца, если его ещё нет; фоновая задача вызывает её заранее.
CREATE OR REPLACE FUNCTION "lms"."ensure_activity_partition"(month_start date) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  part_name text := 'activity_events_' || to_char(month_start, 'YYYY_MM');
BEGIN
  IF to_regclass('lms.' || part_name) IS NULL THEN
    EXECUTE format(
      'CREATE TABLE lms.%I PARTITION OF lms.activity_events FOR VALUES FROM (%L) TO (%L)',
      part_name, month_start, (month_start + interval '1 month')::date
    );
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE "lms"."activity_events_default" PARTITION OF "lms"."activity_events" DEFAULT;
--> statement-breakpoint
SELECT "lms"."ensure_activity_partition"((date_trunc('month', now()) + make_interval(months => m))::date)
FROM generate_series(0, 2) AS m;
--> statement-breakpoint
CREATE INDEX "activity_events_user_idx" ON "lms"."activity_events" ("user_id", "created_at");'''
if 'PARTITION BY RANGE' not in s:
    assert old in s
    s = s.replace(old, new)
    open(p, 'w').write(s)
    print('patched')
