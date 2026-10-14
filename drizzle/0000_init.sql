CREATE SCHEMA "lms";
--> statement-breakpoint
CREATE TABLE "lms"."academic_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"kind" text DEFAULT 'semester' NOT NULL,
	"code" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms"."academic_years" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms"."activity_events" (
	"id" bigserial NOT NULL,
	"user_id" uuid NOT NULL,
	"event" text NOT NULL,
	"object_type" text,
	"object_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_events_id_created_at_pk" PRIMARY KEY("id","created_at")
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
CREATE INDEX "activity_events_user_idx" ON "lms"."activity_events" ("user_id", "created_at");
--> statement-breakpoint
CREATE TABLE "lms"."assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"block_id" uuid NOT NULL,
	"max_score" integer DEFAULT 100 NOT NULL,
	"instructions" text,
	"criteria" text,
	"allowed_ext" text DEFAULT 'pdf,docx,doc,pptx,xlsx,zip,jpg,png' NOT NULL,
	"max_files" integer DEFAULT 5 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms"."attempt_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"answer" jsonb,
	"credit" real,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms"."audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms"."calendar_windows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_id" uuid NOT NULL,
	"study_form" text,
	"kind" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms"."course_authors" (
	"course_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"assigned_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_authors_course_id_user_id_pk" PRIMARY KEY("course_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "lms"."course_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms"."courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discipline_id" uuid,
	"language" text DEFAULT 'ru' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"owner_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"is_template" boolean DEFAULT false NOT NULL,
	"review_comment" text,
	"current_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms"."departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"faculty_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name_kk" text NOT NULL,
	"name_ru" text NOT NULL,
	"name_en" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms"."disciplines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name_kk" text NOT NULL,
	"name_ru" text NOT NULL,
	"name_en" text NOT NULL,
	"credits" integer DEFAULT 5 NOT NULL,
	"department_id" uuid
);
--> statement-breakpoint
CREATE TABLE "lms"."enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"offering_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"source" text DEFAULT 'platonus_file' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms"."export_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offering_id" uuid NOT NULL,
	"component" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"teacher_confirmed_by" uuid,
	"teacher_confirmed_at" timestamp with time zone,
	"registrar_by" uuid,
	"sent_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"comment" text,
	"file_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms"."export_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"score" real NOT NULL,
	"is_late" boolean DEFAULT false NOT NULL,
	"approved_by" text,
	"platonus_response" text
);
--> statement-breakpoint
CREATE TABLE "lms"."external_ids" (
	"entity_type" text NOT NULL,
	"lms_id" uuid NOT NULL,
	"system" text DEFAULT 'platonus' NOT NULL,
	"external_id" text NOT NULL,
	CONSTRAINT "external_ids_system_entity_type_external_id_pk" PRIMARY KEY("system","entity_type","external_id")
);
--> statement-breakpoint
CREATE TABLE "lms"."faculties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name_kk" text NOT NULL,
	"name_ru" text NOT NULL,
	"name_en" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms"."file_blobs" (
	"file_id" uuid PRIMARY KEY NOT NULL,
	"data" "bytea" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms"."files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_key" text NOT NULL,
	"filename" text NOT NULL,
	"mime" text DEFAULT 'application/octet-stream' NOT NULL,
	"size" integer DEFAULT 0 NOT NULL,
	"owner_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms"."grade_change_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grade_item_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"grade_id" uuid,
	"old_score" real,
	"new_score" real NOT NULL,
	"reason" text NOT NULL,
	"requested_by" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms"."grade_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offering_id" uuid NOT NULL,
	"component" text NOT NULL,
	"title" text NOT NULL,
	"block_id" uuid,
	"opens_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"hard_close_at" timestamp with time zone,
	"max_score" integer DEFAULT 100 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms"."grade_schemes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"current_weight" real DEFAULT 0.6 NOT NULL,
	"admission_threshold" integer DEFAULT 50 NOT NULL,
	"rk_min_score" integer DEFAULT 0 NOT NULL,
	"late_rule" text DEFAULT 'penalty' NOT NULL,
	"late_penalty_pct" integer DEFAULT 20 NOT NULL,
	"video_threshold" integer DEFAULT 90 NOT NULL,
	"rk1_week" integer DEFAULT 7 NOT NULL,
	"rk2_week" integer DEFAULT 15 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms"."grades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"grade_item_id" uuid NOT NULL,
	"score" real NOT NULL,
	"raw_score" real,
	"status" text DEFAULT 'draft' NOT NULL,
	"is_late" boolean DEFAULT false NOT NULL,
	"approved_by" uuid,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms"."lesson_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"type" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms"."lesson_progress" (
	"student_id" uuid NOT NULL,
	"offering_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_progress_student_id_offering_id_lesson_id_pk" PRIMARY KEY("student_id","offering_id","lesson_id")
);
--> statement-breakpoint
CREATE TABLE "lms"."lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"title" text NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"est_minutes" integer
);
--> statement-breakpoint
CREATE TABLE "lms"."media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text DEFAULT 'bunny' NOT NULL,
	"bunny_video_id" text,
	"url" text,
	"filename" text,
	"duration_sec" integer,
	"status" text DEFAULT 'uploading' NOT NULL,
	"error" text,
	"owner_id" uuid,
	"course_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms"."modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"week" integer DEFAULT 1 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"title" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms"."notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"link" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms"."offerings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discipline_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"lesson_type" text DEFAULT 'lecture' NOT NULL,
	"stream" text NOT NULL,
	"language" text DEFAULT 'ru' NOT NULL,
	"teacher_id" uuid,
	"course_id" uuid,
	"course_version_id" uuid,
	"grade_scheme_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms"."programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"department_id" uuid NOT NULL,
	"degree" text DEFAULT 'bachelor' NOT NULL,
	"name_kk" text NOT NULL,
	"name_ru" text NOT NULL,
	"name_en" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms"."question_banks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms"."question_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"text" text NOT NULL,
	"is_correct" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"match_text" text
);
--> statement-breakpoint
CREATE TABLE "lms"."questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bank_id" uuid NOT NULL,
	"type" text DEFAULT 'single' NOT NULL,
	"text" text NOT NULL,
	"difficulty" integer DEFAULT 1 NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms"."quiz_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"quiz_id" uuid NOT NULL,
	"offering_id" uuid NOT NULL,
	"layout" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deadline_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"score" real
);
--> statement-breakpoint
CREATE TABLE "lms"."quizzes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"block_id" uuid NOT NULL,
	"bank_id" uuid,
	"count_easy" integer DEFAULT 5 NOT NULL,
	"count_medium" integer DEFAULT 3 NOT NULL,
	"count_hard" integer DEFAULT 2 NOT NULL,
	"time_limit_min" integer,
	"attempts_allowed" integer DEFAULT 1 NOT NULL,
	"shuffle" boolean DEFAULT true NOT NULL,
	"show_results" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms"."sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms"."settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms"."staff" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"department_id" uuid,
	"position" text
);
--> statement-breakpoint
CREATE TABLE "lms"."students" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"group_id" uuid,
	"course_year" integer DEFAULT 1 NOT NULL,
	"study_form" text DEFAULT 'full_time' NOT NULL,
	"study_lang" text DEFAULT 'ru' NOT NULL,
	"status" text DEFAULT 'studying' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms"."study_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"program_id" uuid NOT NULL,
	"course_year" integer NOT NULL,
	"study_lang" text NOT NULL,
	"study_form" text DEFAULT 'full_time' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms"."submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"offering_id" uuid NOT NULL,
	"file_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_late" boolean DEFAULT false NOT NULL,
	"score" real,
	"feedback" text,
	"graded_by" uuid,
	"graded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "lms"."sync_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"row_no" integer,
	"problem" text NOT NULL,
	"payload" jsonb,
	"resolved" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms"."sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"direction" text NOT NULL,
	"kind" text NOT NULL,
	"method" text DEFAULT 'file' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"counters" jsonb DEFAULT '{"total":0,"created":0,"updated":0,"skipped":0,"errors":0}'::jsonb NOT NULL,
	"file_name" text,
	"started_by" uuid
);
--> statement-breakpoint
CREATE TABLE "lms"."user_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"scope_type" text DEFAULT 'university' NOT NULL,
	"scope_id" uuid,
	"granted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"login" text NOT NULL,
	"last_name" text NOT NULL,
	"first_name" text NOT NULL,
	"middle_name" text,
	"email" text,
	"locale" text DEFAULT 'ru' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"password_hash" text,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"accessible_mode" boolean DEFAULT false NOT NULL,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms"."video_progress" (
	"student_id" uuid NOT NULL,
	"block_id" uuid NOT NULL,
	"media_id" uuid,
	"segments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"duration_sec" integer,
	"percent" real DEFAULT 0 NOT NULL,
	"last_position" real DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_progress_student_id_block_id_pk" PRIMARY KEY("student_id","block_id")
);
--> statement-breakpoint
ALTER TABLE "lms"."academic_periods" ADD CONSTRAINT "academic_periods_year_id_academic_years_id_fk" FOREIGN KEY ("year_id") REFERENCES "lms"."academic_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."assignments" ADD CONSTRAINT "assignments_block_id_lesson_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "lms"."lesson_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."attempt_answers" ADD CONSTRAINT "attempt_answers_attempt_id_quiz_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "lms"."quiz_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."attempt_answers" ADD CONSTRAINT "attempt_answers_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "lms"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."calendar_windows" ADD CONSTRAINT "calendar_windows_period_id_academic_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "lms"."academic_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."course_authors" ADD CONSTRAINT "course_authors_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "lms"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."course_authors" ADD CONSTRAINT "course_authors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "lms"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."course_authors" ADD CONSTRAINT "course_authors_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "lms"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."course_versions" ADD CONSTRAINT "course_versions_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "lms"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."course_versions" ADD CONSTRAINT "course_versions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "lms"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."courses" ADD CONSTRAINT "courses_discipline_id_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "lms"."disciplines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."courses" ADD CONSTRAINT "courses_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "lms"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."departments" ADD CONSTRAINT "departments_faculty_id_faculties_id_fk" FOREIGN KEY ("faculty_id") REFERENCES "lms"."faculties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."disciplines" ADD CONSTRAINT "disciplines_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "lms"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."enrollments" ADD CONSTRAINT "enrollments_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "lms"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."enrollments" ADD CONSTRAINT "enrollments_offering_id_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "lms"."offerings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."export_batches" ADD CONSTRAINT "export_batches_offering_id_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "lms"."offerings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."export_batches" ADD CONSTRAINT "export_batches_teacher_confirmed_by_users_id_fk" FOREIGN KEY ("teacher_confirmed_by") REFERENCES "lms"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."export_batches" ADD CONSTRAINT "export_batches_registrar_by_users_id_fk" FOREIGN KEY ("registrar_by") REFERENCES "lms"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."export_batches" ADD CONSTRAINT "export_batches_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "lms"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."export_rows" ADD CONSTRAINT "export_rows_batch_id_export_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "lms"."export_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."export_rows" ADD CONSTRAINT "export_rows_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "lms"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."file_blobs" ADD CONSTRAINT "file_blobs_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "lms"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."files" ADD CONSTRAINT "files_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "lms"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."grade_change_requests" ADD CONSTRAINT "grade_change_requests_grade_item_id_grade_items_id_fk" FOREIGN KEY ("grade_item_id") REFERENCES "lms"."grade_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."grade_change_requests" ADD CONSTRAINT "grade_change_requests_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "lms"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."grade_change_requests" ADD CONSTRAINT "grade_change_requests_grade_id_grades_id_fk" FOREIGN KEY ("grade_id") REFERENCES "lms"."grades"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."grade_change_requests" ADD CONSTRAINT "grade_change_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "lms"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."grade_change_requests" ADD CONSTRAINT "grade_change_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "lms"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."grade_items" ADD CONSTRAINT "grade_items_offering_id_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "lms"."offerings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."grade_items" ADD CONSTRAINT "grade_items_block_id_lesson_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "lms"."lesson_blocks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."grades" ADD CONSTRAINT "grades_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "lms"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."grades" ADD CONSTRAINT "grades_grade_item_id_grade_items_id_fk" FOREIGN KEY ("grade_item_id") REFERENCES "lms"."grade_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."grades" ADD CONSTRAINT "grades_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "lms"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."grades" ADD CONSTRAINT "grades_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "lms"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."lesson_blocks" ADD CONSTRAINT "lesson_blocks_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "lms"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."lesson_progress" ADD CONSTRAINT "lesson_progress_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "lms"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."lesson_progress" ADD CONSTRAINT "lesson_progress_offering_id_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "lms"."offerings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."lessons" ADD CONSTRAINT "lessons_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "lms"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."media_assets" ADD CONSTRAINT "media_assets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "lms"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."media_assets" ADD CONSTRAINT "media_assets_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "lms"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."modules" ADD CONSTRAINT "modules_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "lms"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "lms"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."offerings" ADD CONSTRAINT "offerings_discipline_id_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "lms"."disciplines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."offerings" ADD CONSTRAINT "offerings_period_id_academic_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "lms"."academic_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."offerings" ADD CONSTRAINT "offerings_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "lms"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."offerings" ADD CONSTRAINT "offerings_grade_scheme_id_grade_schemes_id_fk" FOREIGN KEY ("grade_scheme_id") REFERENCES "lms"."grade_schemes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."programs" ADD CONSTRAINT "programs_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "lms"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."question_banks" ADD CONSTRAINT "question_banks_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "lms"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."question_options" ADD CONSTRAINT "question_options_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "lms"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."questions" ADD CONSTRAINT "questions_bank_id_question_banks_id_fk" FOREIGN KEY ("bank_id") REFERENCES "lms"."question_banks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."quiz_attempts" ADD CONSTRAINT "quiz_attempts_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "lms"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."quiz_attempts" ADD CONSTRAINT "quiz_attempts_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "lms"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."quiz_attempts" ADD CONSTRAINT "quiz_attempts_offering_id_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "lms"."offerings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."quizzes" ADD CONSTRAINT "quizzes_block_id_lesson_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "lms"."lesson_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."quizzes" ADD CONSTRAINT "quizzes_bank_id_question_banks_id_fk" FOREIGN KEY ("bank_id") REFERENCES "lms"."question_banks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "lms"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."staff" ADD CONSTRAINT "staff_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "lms"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."staff" ADD CONSTRAINT "staff_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "lms"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."students" ADD CONSTRAINT "students_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "lms"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."students" ADD CONSTRAINT "students_group_id_study_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "lms"."study_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."study_groups" ADD CONSTRAINT "study_groups_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "lms"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."submissions" ADD CONSTRAINT "submissions_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "lms"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."submissions" ADD CONSTRAINT "submissions_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "lms"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."submissions" ADD CONSTRAINT "submissions_offering_id_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "lms"."offerings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."submissions" ADD CONSTRAINT "submissions_graded_by_users_id_fk" FOREIGN KEY ("graded_by") REFERENCES "lms"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."sync_issues" ADD CONSTRAINT "sync_issues_run_id_sync_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "lms"."sync_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."sync_runs" ADD CONSTRAINT "sync_runs_started_by_users_id_fk" FOREIGN KEY ("started_by") REFERENCES "lms"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "lms"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."user_roles" ADD CONSTRAINT "user_roles_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "lms"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."video_progress" ADD CONSTRAINT "video_progress_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "lms"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."video_progress" ADD CONSTRAINT "video_progress_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "lms"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "academic_periods_code_uq" ON "lms"."academic_periods" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "assignments_block_uq" ON "lms"."assignments" USING btree ("block_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attempt_answers_uq" ON "lms"."attempt_answers" USING btree ("attempt_id","question_id");--> statement-breakpoint
CREATE INDEX "audit_log_created_idx" ON "lms"."audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "lms"."audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "calendar_windows_period_idx" ON "lms"."calendar_windows" USING btree ("period_id");--> statement-breakpoint
CREATE UNIQUE INDEX "course_versions_uq" ON "lms"."course_versions" USING btree ("course_id","number");--> statement-breakpoint
CREATE INDEX "courses_discipline_idx" ON "lms"."courses" USING btree ("discipline_id");--> statement-breakpoint
CREATE UNIQUE INDEX "departments_code_uq" ON "lms"."departments" USING btree ("code");--> statement-breakpoint
CREATE INDEX "departments_faculty_idx" ON "lms"."departments" USING btree ("faculty_id");--> statement-breakpoint
CREATE UNIQUE INDEX "disciplines_code_uq" ON "lms"."disciplines" USING btree ("code");--> statement-breakpoint
CREATE INDEX "disciplines_department_idx" ON "lms"."disciplines" USING btree ("department_id");--> statement-breakpoint
CREATE UNIQUE INDEX "enrollments_uq" ON "lms"."enrollments" USING btree ("student_id","offering_id");--> statement-breakpoint
CREATE INDEX "enrollments_offering_idx" ON "lms"."enrollments" USING btree ("offering_id");--> statement-breakpoint
CREATE INDEX "export_batches_offering_idx" ON "lms"."export_batches" USING btree ("offering_id");--> statement-breakpoint
CREATE INDEX "export_batches_status_idx" ON "lms"."export_batches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "export_rows_batch_idx" ON "lms"."export_rows" USING btree ("batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "external_ids_lms_uq" ON "lms"."external_ids" USING btree ("system","entity_type","lms_id");--> statement-breakpoint
CREATE UNIQUE INDEX "faculties_code_uq" ON "lms"."faculties" USING btree ("code");--> statement-breakpoint
CREATE INDEX "grade_change_requests_status_idx" ON "lms"."grade_change_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "grade_items_offering_idx" ON "lms"."grade_items" USING btree ("offering_id");--> statement-breakpoint
CREATE UNIQUE INDEX "grades_uq" ON "lms"."grades" USING btree ("student_id","grade_item_id");--> statement-breakpoint
CREATE INDEX "grades_item_idx" ON "lms"."grades" USING btree ("grade_item_id");--> statement-breakpoint
CREATE INDEX "lesson_blocks_lesson_idx" ON "lms"."lesson_blocks" USING btree ("lesson_id");--> statement-breakpoint
CREATE INDEX "lessons_module_idx" ON "lms"."lessons" USING btree ("module_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_bunny_uq" ON "lms"."media_assets" USING btree ("bunny_video_id");--> statement-breakpoint
CREATE INDEX "media_assets_course_idx" ON "lms"."media_assets" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "modules_course_idx" ON "lms"."modules" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "lms"."notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE UNIQUE INDEX "offerings_uq" ON "lms"."offerings" USING btree ("discipline_id","period_id","lesson_type","stream");--> statement-breakpoint
CREATE INDEX "offerings_teacher_idx" ON "lms"."offerings" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX "offerings_course_idx" ON "lms"."offerings" USING btree ("course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "programs_code_uq" ON "lms"."programs" USING btree ("code");--> statement-breakpoint
CREATE INDEX "question_banks_course_idx" ON "lms"."question_banks" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "question_options_question_idx" ON "lms"."question_options" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "questions_bank_idx" ON "lms"."questions" USING btree ("bank_id");--> statement-breakpoint
CREATE INDEX "quiz_attempts_student_quiz_idx" ON "lms"."quiz_attempts" USING btree ("student_id","quiz_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quizzes_block_uq" ON "lms"."quizzes" USING btree ("block_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "lms"."sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "students_group_idx" ON "lms"."students" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "study_groups_code_uq" ON "lms"."study_groups" USING btree ("code");--> statement-breakpoint
CREATE INDEX "study_groups_program_idx" ON "lms"."study_groups" USING btree ("program_id");--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_uq" ON "lms"."submissions" USING btree ("student_id","assignment_id","offering_id");--> statement-breakpoint
CREATE INDEX "submissions_offering_idx" ON "lms"."submissions" USING btree ("offering_id");--> statement-breakpoint
CREATE INDEX "sync_issues_run_idx" ON "lms"."sync_issues" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_roles_uq" ON "lms"."user_roles" USING btree ("user_id","role","scope_type",coalesce("scope_id", '00000000-0000-0000-0000-000000000000'::uuid));--> statement-breakpoint
CREATE INDEX "user_roles_user_idx" ON "lms"."user_roles" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_login_uq" ON "lms"."users" USING btree (lower("login"));