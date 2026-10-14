# Обмен с Platonus

Из Platonus в LMS идёт «кто чему учится», из LMS в Platonus — оценки, и только после проверки сроков. Пока нет доступа к API, обмен идёт файлами через «Офис регистратора → Импорт».

Сопоставление — только по id из Platonus (таблица `external_ids`), не по ФИО. Повторная загрузка того же файла ничего не дублирует: новые строки создаются, изменённые обновляются, одинаковые пропускаются.

## Порядок загрузки

1. Факультеты → кафедры → ОП → группы (раз в семестр)
2. Преподаватели (раз в неделю)
3. Студенты (ежедневно в период регистрации)
4. Дисциплины (раз в семестр)
5. Потоки и нагрузка (раз в семестр и при изменении)
6. ИУП — записи на потоки (ежедневно в период регистрации)

Перед загрузкой учебная часть заводит учебный год и периоды в «Учебная часть → Календарь». Код периода в файлах — например `2026-2027-1`.

Мастер проверяет файл до загрузки и показывает ошибки по строкам: нет группы, дубль, неизвестная дисциплина, неизвестный период, логин занят. Строки с ошибками не загружаются, остальные — да.

Форматы: CSV (запятая, точка с запятой или табуляция, UTF-8) или XLSX. Заголовки — латиницей, как ниже; регистр не важен. Значения можно писать по-русски, по-казахски или кодом: «очная» = `full_time`, «каз» = `kk`, «Лабораторная» = `lab`.

## Колонки

`*` — обязательные. Шаблоны можно скачать в мастере импорта.

| Файл | Колонки |
| --- | --- |
| faculties | code*, name_kk*, name_ru*, name_en |
| departments | code*, faculty_code*, name_kk*, name_ru*, name_en |
| programs | code*, department_code*, degree, name_kk*, name_ru*, name_en |
| groups | code*, program_code*, course*, study_lang*, study_form |
| teachers | platonus_id*, last_name*, first_name*, middle_name, department_code, position, email, login |
| students | platonus_id*, last_name*, first_name*, middle_name, group_code*, course, study_form, study_lang, status, email, login |
| disciplines | code*, name_kk*, name_ru*, name_en, credits, department_code |
| offerings | discipline_code*, period*, lesson_type*, stream*, language, teacher_platonus_id |
| enrollments | platonus_student_id*, discipline_code*, period*, lesson_type*, stream*, teacher_platonus_id |

ИИН и паспортные данные в LMS не хранятся.

Логин по умолчанию — `platonus_id` маленькими буквами. Пароли студентам выдаются по группам в «Учётные записи»: таблицу с логинами и паролями можно распечатать; в базе хранится только хэш.

Если поток из ИУП ещё не загружен через «Потоки», он создаётся по строке ИУП.

Галочка «Файл содержит полный ИУП периода» снимает с потоков тех, кого нет в файле (статус «отчислен с потока»), — используйте только для полной выгрузки.

## Ведомость из LMS

Преподаватель подтверждает ведомость по компоненту (ТК1, РК1, ТК2, РК2, экзамен). Регистратор скачивает её (XLSX или CSV, одной таблицей все готовые), загружает в Platonus и отмечает «Отправлено», затем «Platonus подтвердил» — оценки блокируются.

```csv
platonus_student_id,full_name,group_code,discipline_code,stream,component,score,late,approved_by
```

Колонки уточняются под реальный формат загрузки Platonus — правка в одном месте: `src/lib/platonus/formats.ts`.

## Переход на API

`src/lib/platonus/adapter.ts`: интерфейс `PlatonusAdapter` с реализациями `FileAdapter` (сейчас) и `ApiAdapter` (заготовка под REST API Platonus `/rest/...`). Когда вуз получит официальный доступ и документацию — задать `PLATONUS_API_URL`, `PLATONUS_API_TOKEN` и уточнить пути в `ApiAdapter`. Логика проверки и применения (`sync.ts`) не меняется.
