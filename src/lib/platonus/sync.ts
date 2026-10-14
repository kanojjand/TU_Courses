import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { db, type Tx } from '@/db';
import {
  academicPeriods,
  departments,
  disciplines,
  enrollments,
  externalIds,
  faculties,
  offerings,
  programs,
  staff,
  students,
  studyGroups,
  syncIssues,
  syncRuns,
  userRoles,
  users,
  type LessonType,
  type SyncCounters,
} from '@/db/schema';
import { chunk } from '@/lib/utils';
import {
  FORMATS,
  parseDegree,
  parseLang,
  parseLessonType,
  parseStudentStatus,
  parseStudyForm,
  type ImportKind,
} from './formats';

/**
 * Синхронизация справочников и контингента из Platonus.
 *
 * Логика одна для любого транспорта (файл сейчас, API потом — раздел 5.4):
 * адаптер отдаёт строки, здесь они проверяются и применяются.
 * Сопоставление только по id из Platonus (external_ids), не по ФИО.
 * Повторный запуск с тем же файлом ничего не дублирует.
 */

export type Issue = { code: string; params?: Record<string, string | number> };
export type RowAction = 'create' | 'update' | 'same' | 'error';
export type RowPlan = {
  rowNo: number;
  action: RowAction;
  label: string;
  issues: Issue[];
  /** Нормализованные данные для применения */
  data?: Record<string, unknown>;
  existingId?: string;
};
export type ImportPlan = {
  kind: ImportKind;
  fileIssues: Issue[];
  rows: RowPlan[];
  counters: SyncCounters;
};

export type ImportOptions = { dropMissing?: boolean };

const SYSTEM = 'platonus';

function countersOf(rows: RowPlan[]): SyncCounters {
  return {
    total: rows.length,
    created: rows.filter((r) => r.action === 'create').length,
    updated: rows.filter((r) => r.action === 'update').length,
    skipped: rows.filter((r) => r.action === 'same').length,
    errors: rows.filter((r) => r.action === 'error').length,
  };
}

function checkHeader(kind: ImportKind, header: string[]): Issue[] {
  const have = new Set(header);
  return FORMATS[kind].filter((c) => c.required && !have.has(c.key)).map((c) => ({ code: 'missingColumn', params: { column: c.key } }));
}

const val = (r: Record<string, string>, k: string) => (r[k] ?? '').trim();

function requireFields(r: Record<string, string>, kind: ImportKind): Issue[] {
  return FORMATS[kind].filter((c) => c.required && !val(r, c.key)).map((c) => ({ code: 'required', params: { column: c.key } }));
}

function sameFields(a: Record<string, unknown>, b: Record<string, unknown>) {
  return Object.keys(a).every((k) => (a[k] ?? null) === (b[k] ?? null));
}

async function externalMap(entityType: string) {
  const rows = await db
    .select({ ext: externalIds.externalId, id: externalIds.lmsId })
    .from(externalIds)
    .where(and(eq(externalIds.system, SYSTEM), eq(externalIds.entityType, entityType)));
  return new Map(rows.map((r) => [r.ext, r.id]));
}

/* ─────────────────────────────── Планирование ─────────────────────────────── */

export async function planImport(kind: ImportKind, header: string[], input: Record<string, string>[]): Promise<ImportPlan> {
  const fileIssues = checkHeader(kind, header);
  if (fileIssues.length) return { kind, fileIssues, rows: [], counters: countersOf([]) };
  const rows = await PLANNERS[kind](input);
  // Дубли внутри файла: вторая и далее строки с тем же ключом — ошибка
  const seen = new Map<string, number>();
  for (const r of rows) {
    if (r.action === 'error' || !r.data) continue;
    const key = String(r.data.__key ?? '');
    if (!key) continue;
    const first = seen.get(key);
    if (first !== undefined) {
      r.action = 'error';
      r.issues.push({ code: 'duplicate', params: { row: first } });
    } else seen.set(key, r.rowNo);
  }
  return { kind, fileIssues, rows, counters: countersOf(rows) };
}

type Planner = (rows: Record<string, string>[]) => Promise<RowPlan[]>;

const planFaculties: Planner = async (input) => {
  const existing = new Map((await db.select().from(faculties)).map((f) => [f.code.toUpperCase(), f]));
  return input.map((r, i) => {
    const issues = requireFields(r, 'faculties');
    const code = val(r, 'code');
    const data = { code, nameKk: val(r, 'name_kk'), nameRu: val(r, 'name_ru'), nameEn: val(r, 'name_en') || val(r, 'name_ru') };
    const ex = existing.get(code.toUpperCase());
    return finish(i, code, issues, { ...data, __key: code.toUpperCase() }, ex, ex && pickSame(ex, data));
  });
};

const planDepartments: Planner = async (input) => {
  const facs = new Map((await db.select().from(faculties)).map((f) => [f.code.toUpperCase(), f.id]));
  const existing = new Map((await db.select().from(departments)).map((d) => [d.code.toUpperCase(), d]));
  return input.map((r, i) => {
    const issues = requireFields(r, 'departments');
    const code = val(r, 'code');
    const facultyId = facs.get(val(r, 'faculty_code').toUpperCase());
    if (val(r, 'faculty_code') && !facultyId) issues.push({ code: 'unknownFaculty', params: { value: val(r, 'faculty_code') } });
    const data = { code, facultyId, nameKk: val(r, 'name_kk'), nameRu: val(r, 'name_ru'), nameEn: val(r, 'name_en') || val(r, 'name_ru') };
    const ex = existing.get(code.toUpperCase());
    return finish(i, code, issues, { ...data, __key: code.toUpperCase() }, ex, ex && pickSame(ex, data));
  });
};

const planPrograms: Planner = async (input) => {
  const deps = new Map((await db.select().from(departments)).map((d) => [d.code.toUpperCase(), d.id]));
  const existing = new Map((await db.select().from(programs)).map((p) => [p.code.toUpperCase(), p]));
  return input.map((r, i) => {
    const issues = requireFields(r, 'programs');
    const code = val(r, 'code');
    const departmentId = deps.get(val(r, 'department_code').toUpperCase());
    if (val(r, 'department_code') && !departmentId) issues.push({ code: 'unknownDepartment', params: { value: val(r, 'department_code') } });
    const degree = val(r, 'degree') ? parseDegree(val(r, 'degree')) : 'bachelor';
    if (!degree) issues.push({ code: 'invalidValue', params: { column: 'degree', value: val(r, 'degree') } });
    const data = { code, departmentId, degree, nameKk: val(r, 'name_kk'), nameRu: val(r, 'name_ru'), nameEn: val(r, 'name_en') || val(r, 'name_ru') };
    const ex = existing.get(code.toUpperCase());
    return finish(i, code, issues, { ...data, __key: code.toUpperCase() }, ex, ex && pickSame(ex, data));
  });
};

const planGroups: Planner = async (input) => {
  const progs = new Map((await db.select().from(programs)).map((p) => [p.code.toUpperCase(), p.id]));
  const existing = new Map((await db.select().from(studyGroups)).map((g) => [g.code.toUpperCase(), g]));
  return input.map((r, i) => {
    const issues = requireFields(r, 'groups');
    const code = val(r, 'code');
    const programId = progs.get(val(r, 'program_code').toUpperCase());
    if (val(r, 'program_code') && !programId) issues.push({ code: 'unknownProgram', params: { value: val(r, 'program_code') } });
    const courseYear = Number(val(r, 'course'));
    if (val(r, 'course') && !(Number.isInteger(courseYear) && courseYear >= 1 && courseYear <= 7))
      issues.push({ code: 'invalidValue', params: { column: 'course', value: val(r, 'course') } });
    const studyLang = parseLang(val(r, 'study_lang'));
    if (val(r, 'study_lang') && !studyLang) issues.push({ code: 'invalidValue', params: { column: 'study_lang', value: val(r, 'study_lang') } });
    const studyForm = val(r, 'study_form') ? parseStudyForm(val(r, 'study_form')) : 'full_time';
    if (!studyForm) issues.push({ code: 'invalidValue', params: { column: 'study_form', value: val(r, 'study_form') } });
    const data = { code, programId, courseYear, studyLang, studyForm };
    const ex = existing.get(code.toUpperCase());
    return finish(i, code, issues, { ...data, __key: code.toUpperCase() }, ex, ex && pickSame(ex, data));
  });
};

async function loginOwners() {
  const rows = await db.select({ id: users.id, login: users.login }).from(users);
  return new Map(rows.map((u) => [u.login.toLowerCase(), u.id]));
}

const planTeachers: Planner = async (input) => {
  const [ext, logins, deps] = await Promise.all([
    externalMap('teacher'),
    loginOwners(),
    db.select().from(departments).then((d) => new Map(d.map((x) => [x.code.toUpperCase(), x.id]))),
  ]);
  const ids = [...ext.values()];
  const existingUsers = ids.length ? await db.select().from(users).where(inArray(users.id, ids)) : [];
  const existingStaff = ids.length ? await db.select().from(staff).where(inArray(staff.userId, ids)) : [];
  const uById = new Map(existingUsers.map((u) => [u.id, u]));
  const sById = new Map(existingStaff.map((s) => [s.userId, s]));
  return input.map((r, i) => {
    const issues = requireFields(r, 'teachers');
    const pid = val(r, 'platonus_id');
    const userId = ext.get(pid);
    const login = (val(r, 'login') || pid).toLowerCase();
    const owner = logins.get(login);
    if (owner && owner !== userId) issues.push({ code: 'loginTaken', params: { value: login } });
    const departmentId = val(r, 'department_code') ? deps.get(val(r, 'department_code').toUpperCase()) : null;
    if (val(r, 'department_code') && !departmentId) issues.push({ code: 'unknownDepartment', params: { value: val(r, 'department_code') } });
    const person = {
      lastName: val(r, 'last_name'),
      firstName: val(r, 'first_name'),
      middleName: val(r, 'middle_name') || null,
      email: val(r, 'email') || null,
    };
    const st = { departmentId: departmentId ?? null, position: val(r, 'position') || null };
    const u = userId ? uById.get(userId) : undefined;
    const s = userId ? sById.get(userId) : undefined;
    const same = !!u && pickSame(u, person) && !!s && pickSame(s, st);
    return finish(i, `${pid} ${person.lastName} ${person.firstName}`, issues, { pid, login, ...person, ...st, __key: pid }, userId ? { id: userId } : undefined, same);
  });
};

const planStudents: Planner = async (input) => {
  const [ext, logins, groups] = await Promise.all([externalMap('student'), loginOwners(), db.select().from(studyGroups)]);
  const gByCode = new Map(groups.map((g) => [g.code.toUpperCase(), g]));
  const ids = [...ext.values()];
  const uById = new Map<string, typeof users.$inferSelect>();
  const sById = new Map<string, typeof students.$inferSelect>();
  for (const part of chunk(ids, 5000)) {
    (await db.select().from(users).where(inArray(users.id, part))).forEach((u) => uById.set(u.id, u));
    (await db.select().from(students).where(inArray(students.userId, part))).forEach((s) => sById.set(s.userId, s));
  }
  return input.map((r, i) => {
    const issues = requireFields(r, 'students');
    const pid = val(r, 'platonus_id');
    const userId = ext.get(pid);
    const login = (val(r, 'login') || pid).toLowerCase();
    const owner = logins.get(login);
    if (owner && owner !== userId) issues.push({ code: 'loginTaken', params: { value: login } });
    const group = gByCode.get(val(r, 'group_code').toUpperCase());
    if (val(r, 'group_code') && !group) issues.push({ code: 'unknownGroup', params: { value: val(r, 'group_code') } });
    const courseYear = val(r, 'course') ? Number(val(r, 'course')) : (group?.courseYear ?? 1);
    if (!(Number.isInteger(courseYear) && courseYear >= 1 && courseYear <= 7)) issues.push({ code: 'invalidValue', params: { column: 'course', value: val(r, 'course') } });
    const studyForm = val(r, 'study_form') ? parseStudyForm(val(r, 'study_form')) : (group?.studyForm ?? 'full_time');
    if (!studyForm) issues.push({ code: 'invalidValue', params: { column: 'study_form', value: val(r, 'study_form') } });
    const studyLang = val(r, 'study_lang') ? parseLang(val(r, 'study_lang')) : (group?.studyLang ?? 'ru');
    if (!studyLang) issues.push({ code: 'invalidValue', params: { column: 'study_lang', value: val(r, 'study_lang') } });
    const status = val(r, 'status') ? parseStudentStatus(val(r, 'status')) : 'studying';
    if (!status) issues.push({ code: 'invalidValue', params: { column: 'status', value: val(r, 'status') } });
    const person = {
      lastName: val(r, 'last_name'),
      firstName: val(r, 'first_name'),
      middleName: val(r, 'middle_name') || null,
      email: val(r, 'email') || null,
    };
    const st = { groupId: group?.id ?? null, courseYear, studyForm, studyLang, status };
    const u = userId ? uById.get(userId) : undefined;
    const s = userId ? sById.get(userId) : undefined;
    const same = !!u && pickSame(u, person) && !!s && pickSame(s, st);
    return finish(
      i,
      `${pid} ${person.lastName} ${person.firstName}`,
      issues,
      { pid, login, ...person, ...st, __key: pid },
      userId ? { id: userId } : undefined,
      same,
    );
  });
};

const planDisciplines: Planner = async (input) => {
  const deps = new Map((await db.select().from(departments)).map((d) => [d.code.toUpperCase(), d.id]));
  const existing = new Map((await db.select().from(disciplines)).map((d) => [d.code.toUpperCase(), d]));
  return input.map((r, i) => {
    const issues = requireFields(r, 'disciplines');
    const code = val(r, 'code');
    const departmentId = val(r, 'department_code') ? deps.get(val(r, 'department_code').toUpperCase()) : null;
    if (val(r, 'department_code') && !departmentId) issues.push({ code: 'unknownDepartment', params: { value: val(r, 'department_code') } });
    const credits = val(r, 'credits') ? Number(val(r, 'credits')) : 5;
    if (!(Number.isInteger(credits) && credits > 0 && credits < 60)) issues.push({ code: 'invalidValue', params: { column: 'credits', value: val(r, 'credits') } });
    const data = { code, departmentId: departmentId ?? null, credits, nameKk: val(r, 'name_kk'), nameRu: val(r, 'name_ru'), nameEn: val(r, 'name_en') || val(r, 'name_ru') };
    const ex = existing.get(code.toUpperCase());
    return finish(i, code, issues, { ...data, __key: code.toUpperCase() }, ex, ex && pickSame(ex, data));
  });
};

type OfferingKey = { disciplineId: string; periodId: string; lessonType: LessonType; stream: string };
const offKey = (k: OfferingKey) => `${k.disciplineId}|${k.periodId}|${k.lessonType}|${k.stream.toUpperCase()}`;

async function offeringContext() {
  const [discs, periods, teachers, offs] = await Promise.all([
    db.select({ id: disciplines.id, code: disciplines.code }).from(disciplines),
    db.select({ id: academicPeriods.id, code: academicPeriods.code }).from(academicPeriods),
    externalMap('teacher'),
    db.select().from(offerings),
  ]);
  return {
    disc: new Map(discs.map((d) => [d.code.toUpperCase(), d.id])),
    period: new Map(periods.map((p) => [p.code, p.id])),
    teachers,
    offerings: new Map(offs.map((o) => [offKey(o), o])),
  };
}

function resolveOffering(r: Record<string, string>, ctx: Awaited<ReturnType<typeof offeringContext>>, issues: Issue[]) {
  const disciplineId = ctx.disc.get(val(r, 'discipline_code').toUpperCase());
  if (val(r, 'discipline_code') && !disciplineId) issues.push({ code: 'unknownDiscipline', params: { value: val(r, 'discipline_code') } });
  const periodId = ctx.period.get(val(r, 'period'));
  if (val(r, 'period') && !periodId) issues.push({ code: 'unknownPeriod', params: { value: val(r, 'period') } });
  const lessonType = parseLessonType(val(r, 'lesson_type'));
  if (val(r, 'lesson_type') && !lessonType) issues.push({ code: 'invalidValue', params: { column: 'lesson_type', value: val(r, 'lesson_type') } });
  const teacherPid = val(r, 'teacher_platonus_id');
  const teacherId = teacherPid ? ctx.teachers.get(teacherPid) : null;
  if (teacherPid && !teacherId) issues.push({ code: 'unknownTeacher', params: { value: teacherPid } });
  const stream = val(r, 'stream');
  if (!disciplineId || !periodId || !lessonType || !stream) return null;
  const key: OfferingKey = { disciplineId, periodId, lessonType, stream };
  return { key, teacherId: teacherId ?? null, existing: ctx.offerings.get(offKey(key)) };
}

const planOfferings: Planner = async (input) => {
  const ctx = await offeringContext();
  return input.map((r, i) => {
    const issues = requireFields(r, 'offerings');
    const res = resolveOffering(r, ctx, issues);
    const language = val(r, 'language') ? parseLang(val(r, 'language')) : 'ru';
    if (!language) issues.push({ code: 'invalidValue', params: { column: 'language', value: val(r, 'language') } });
    const label = `${val(r, 'discipline_code')} · ${val(r, 'lesson_type')} · ${val(r, 'stream')}`;
    if (!res) return finish(i, label, issues, undefined, undefined, false);
    const data = { ...res.key, teacherId: res.teacherId, language };
    const ex = res.existing;
    const same = !!ex && ex.teacherId === res.teacherId && ex.language === language;
    return finish(i, label, issues, { ...data, __key: offKey(res.key) }, ex, same);
  });
};

const planEnrollments: Planner = async (input) => {
  const [ctx, studentsExt] = await Promise.all([offeringContext(), externalMap('student')]);
  const studentIds = [...new Set(input.map((r) => studentsExt.get(val(r, 'platonus_student_id'))).filter(Boolean))] as string[];
  const existing = new Map<string, { id: string; status: string }>();
  for (const part of chunk(studentIds, 5000)) {
    const rows = await db
      .select({ id: enrollments.id, s: enrollments.studentId, o: enrollments.offeringId, status: enrollments.status })
      .from(enrollments)
      .where(inArray(enrollments.studentId, part));
    rows.forEach((e) => existing.set(`${e.s}|${e.o}`, { id: e.id, status: e.status }));
  }
  return input.map((r, i) => {
    const issues = requireFields(r, 'enrollments');
    const pid = val(r, 'platonus_student_id');
    const studentId = studentsExt.get(pid);
    if (pid && !studentId) issues.push({ code: 'unknownStudent', params: { value: pid } });
    const res = resolveOffering(r, ctx, issues);
    const label = `${pid} → ${val(r, 'discipline_code')} · ${val(r, 'stream')}`;
    if (!res || !studentId) return finish(i, label, issues, undefined, undefined, false);
    const offeringId = res.existing?.id;
    const ex = offeringId ? existing.get(`${studentId}|${offeringId}`) : undefined;
    const data = { studentId, offering: res.key, offeringId, teacherId: res.teacherId };
    return finish(
      i,
      label,
      issues,
      { ...data, __key: `${studentId}|${offKey(res.key)}` },
      ex,
      !!ex && ex.status === 'active',
    );
  });
};

const PLANNERS: Record<ImportKind, Planner> = {
  faculties: planFaculties,
  departments: planDepartments,
  programs: planPrograms,
  groups: planGroups,
  teachers: planTeachers,
  students: planStudents,
  disciplines: planDisciplines,
  offerings: planOfferings,
  enrollments: planEnrollments,
};

function pickSame(existing: Record<string, unknown>, data: Record<string, unknown>) {
  return sameFields(data, existing);
}

function finish(
  i: number,
  label: string,
  issues: Issue[],
  data: Record<string, unknown> | undefined,
  existing: { id: string } | undefined,
  same: boolean | undefined,
): RowPlan {
  const rowNo = i + 2; // строка 1 — заголовок
  if (issues.length || !data) return { rowNo, action: 'error', label, issues };
  return { rowNo, action: existing ? (same ? 'same' : 'update') : 'create', label, issues, data, existingId: existing?.id };
}

/* ─────────────────────────────── Применение ─────────────────────────────── */

export async function applyImport(
  plan: ImportPlan,
  meta: { fileName: string; actorId: string; method?: 'file' | 'api' },
  options: ImportOptions = {},
): Promise<{ runId: string; counters: SyncCounters }> {
  const [run] = await db
    .insert(syncRuns)
    .values({ direction: 'in', kind: plan.kind, method: meta.method ?? 'file', fileName: meta.fileName, startedBy: meta.actorId })
    .returning({ id: syncRuns.id });
  const counters = { ...plan.counters };
  try {
    const work = plan.rows.filter((r) => r.action === 'create' || r.action === 'update');
    for (const part of chunk(work, 500)) {
      await db.transaction(async (tx) => {
        await APPLIERS[plan.kind](tx, part, meta.actorId);
      });
    }
    if (plan.kind === 'enrollments' && options.dropMissing) {
      counters.updated += await dropMissingEnrollments(plan);
    }
    const errors = plan.rows.filter((r) => r.action === 'error');
    for (const part of chunk(errors, 500)) {
      await db.insert(syncIssues).values(
        part.map((r) => ({ runId: run.id, rowNo: r.rowNo, problem: r.issues.map((x) => x.code).join(','), payload: { label: r.label, issues: r.issues } })),
      );
    }
    if (plan.fileIssues.length) {
      await db.insert(syncIssues).values(plan.fileIssues.map((x) => ({ runId: run.id, rowNo: null, problem: x.code, payload: { issues: [x] } })));
    }
    await db
      .update(syncRuns)
      .set({ finishedAt: new Date(), status: counters.errors > 0 || plan.fileIssues.length ? 'partial' : 'success', counters })
      .where(eq(syncRuns.id, run.id));
  } catch (e) {
    await db.update(syncRuns).set({ finishedAt: new Date(), status: 'failed', counters }).where(eq(syncRuns.id, run.id));
    await db.insert(syncIssues).values({ runId: run.id, problem: 'exception', payload: { message: String((e as Error).message ?? e) } });
    throw e;
  }
  return { runId: run.id, counters };
}

type Applier = (tx: Tx, rows: RowPlan[], actorId: string) => Promise<void>;

function strip<T extends Record<string, unknown>>(d: T) {
  const { __key: _k, ...rest } = d as Record<string, unknown>;
  void _k;
  return rest;
}

const applyFaculties: Applier = async (tx, rows) => {
  const creates = rows.filter((r) => r.action === 'create').map((r) => strip(r.data!) as typeof faculties.$inferInsert);
  if (creates.length) await tx.insert(faculties).values(creates);
  await Promise.all(rows.filter((r) => r.action === 'update').map((r) => tx.update(faculties).set(strip(r.data!)).where(eq(faculties.id, r.existingId!))));
};

const applyDepartments: Applier = async (tx, rows) => {
  const creates = rows.filter((r) => r.action === 'create').map((r) => strip(r.data!) as typeof departments.$inferInsert);
  if (creates.length) await tx.insert(departments).values(creates);
  await Promise.all(rows.filter((r) => r.action === 'update').map((r) => tx.update(departments).set(strip(r.data!)).where(eq(departments.id, r.existingId!))));
};

const applyPrograms: Applier = async (tx, rows) => {
  const creates = rows.filter((r) => r.action === 'create').map((r) => strip(r.data!) as typeof programs.$inferInsert);
  if (creates.length) await tx.insert(programs).values(creates);
  await Promise.all(rows.filter((r) => r.action === 'update').map((r) => tx.update(programs).set(strip(r.data!)).where(eq(programs.id, r.existingId!))));
};

const applyGroups: Applier = async (tx, rows) => {
  const creates = rows.filter((r) => r.action === 'create').map((r) => strip(r.data!) as typeof studyGroups.$inferInsert);
  if (creates.length) await tx.insert(studyGroups).values(creates);
  await Promise.all(rows.filter((r) => r.action === 'update').map((r) => tx.update(studyGroups).set(strip(r.data!)).where(eq(studyGroups.id, r.existingId!))));
};

const applyDisciplines: Applier = async (tx, rows) => {
  const creates = rows.filter((r) => r.action === 'create').map((r) => strip(r.data!) as typeof disciplines.$inferInsert);
  if (creates.length) await tx.insert(disciplines).values(creates);
  await Promise.all(rows.filter((r) => r.action === 'update').map((r) => tx.update(disciplines).set(strip(r.data!)).where(eq(disciplines.id, r.existingId!))));
};

type PersonData = Record<string, unknown> & {
  pid: string;
  login: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  email: string | null;
};

/** Пачкой: одна вставка на 500 человек вместо пяти запросов на каждого */
async function applyPeople(tx: Tx, rows: RowPlan[], kind: 'student' | 'teacher', actorId: string) {
  const creates = rows.filter((r) => r.action === 'create').map((r) => ({ id: crypto.randomUUID(), d: r.data as PersonData }));
  const person = (d: PersonData) => ({ lastName: d.lastName, firstName: d.firstName, middleName: d.middleName, email: d.email });
  const studentRow = (id: string, d: PersonData) => ({
    userId: id,
    groupId: d.groupId as string,
    courseYear: d.courseYear as number,
    studyForm: d.studyForm as 'full_time',
    studyLang: d.studyLang as 'ru',
    status: d.status as 'studying',
  });
  const staffRow = (id: string, d: PersonData) => ({ userId: id, departmentId: (d.departmentId as string | null) ?? null, position: (d.position as string | null) ?? null });

  if (creates.length) {
    await tx.insert(users).values(
      creates.map(({ id, d }) => ({
        id,
        login: d.login,
        ...person(d),
        locale: kind === 'student' ? ((d.studyLang as 'kk' | 'ru' | 'en') ?? 'ru') : ('ru' as const),
        passwordHash: null,
        mustChangePassword: true,
      })),
    );
    await tx.insert(externalIds).values(creates.map(({ id, d }) => ({ system: SYSTEM, entityType: kind, lmsId: id, externalId: d.pid })));
    if (kind === 'student') {
      await tx.insert(students).values(creates.map(({ id, d }) => studentRow(id, d)));
      await tx
        .insert(userRoles)
        .values(creates.map(({ id }) => ({ userId: id, role: 'student' as const, scopeType: 'university' as const, grantedBy: actorId })))
        .onConflictDoNothing();
    } else {
      await tx.insert(staff).values(creates.map(({ id, d }) => staffRow(id, d)));
      await tx
        .insert(userRoles)
        .values(
          creates.map(({ id, d }) => ({
            userId: id,
            role: 'teacher' as const,
            scopeType: d.departmentId ? ('department' as const) : ('university' as const),
            scopeId: (d.departmentId as string | null) ?? null,
            grantedBy: actorId,
          })),
        )
        .onConflictDoNothing();
    }
  }

  // Обновления конвейером: postgres-js шлёт запросы, не дожидаясь ответа на каждый
  const updates = rows.filter((r) => r.action === 'update');
  await Promise.all(
    updates.flatMap((r): PromiseLike<unknown>[] => {
      const id = r.existingId!;
      const d = r.data as PersonData;
      const u = tx.update(users).set(person(d)).where(eq(users.id, id));
      if (kind === 'student') {
        const row = studentRow(id, d);
        const { userId: _u, ...set } = row;
        void _u;
        return [u, tx.insert(students).values(row).onConflictDoUpdate({ target: students.userId, set })];
      }
      const row = staffRow(id, d);
      return [u, tx.insert(staff).values(row).onConflictDoUpdate({ target: staff.userId, set: { departmentId: row.departmentId, position: row.position } })];
    }),
  );
}

const applyStudents: Applier = (tx, rows, actor) => applyPeople(tx, rows, 'student', actor);
const applyTeachers: Applier = (tx, rows, actor) => applyPeople(tx, rows, 'teacher', actor);

async function upsertOffering(tx: Tx, key: OfferingKey, teacherId: string | null, language?: 'kk' | 'ru' | 'en' | null) {
  const [row] = await tx
    .insert(offerings)
    .values({ ...key, teacherId, language: language ?? 'ru' })
    .onConflictDoUpdate({
      target: [offerings.disciplineId, offerings.periodId, offerings.lessonType, offerings.stream],
      set: teacherId ? { teacherId, ...(language ? { language } : {}) } : language ? { language } : { stream: key.stream },
    })
    .returning({ id: offerings.id, courseId: offerings.courseId });
  return row;
}

const applyOfferings: Applier = async (tx, rows) => {
  for (const r of rows) {
    const d = r.data as OfferingKey & { teacherId: string | null; language: 'kk' | 'ru' | 'en' };
    await upsertOffering(tx, { disciplineId: d.disciplineId, periodId: d.periodId, lessonType: d.lessonType, stream: d.stream }, d.teacherId, d.language);
  }
};

const applyEnrollments: Applier = async (tx, rows) => {
  const offeringIds = new Map<string, string>();
  const values: { studentId: string; offeringId: string; status: 'active'; source: 'platonus_file' }[] = [];
  for (const r of rows) {
    const d = r.data as { studentId: string; offering: OfferingKey; offeringId?: string; teacherId: string | null };
    const k = offKey(d.offering);
    let oid = d.offeringId ?? offeringIds.get(k);
    if (!oid) {
      // Поток из ИУП, которого ещё нет: создаём по данным строки
      oid = (await upsertOffering(tx, d.offering, d.teacherId)).id;
      offeringIds.set(k, oid);
    }
    values.push({ studentId: d.studentId, offeringId: oid, status: 'active', source: 'platonus_file' });
  }
  if (values.length)
    await tx
      .insert(enrollments)
      .values(values)
      .onConflictDoUpdate({ target: [enrollments.studentId, enrollments.offeringId], set: { status: 'active' } });
};

/** Полный ИУП периода: записи, которых нет в файле, помечаются «отчислен с потока» */
async function dropMissingEnrollments(plan: ImportPlan) {
  const rows = plan.rows.filter((r) => r.action !== 'error' && r.data);
  const periodIds = [...new Set(rows.map((r) => (r.data!.offering as OfferingKey).periodId))];
  if (!periodIds.length) return 0;
  const keep = new Set(rows.map((r) => `${r.data!.studentId}|${offKey(r.data!.offering as OfferingKey)}`));
  const current = await db
    .select({ id: enrollments.id, s: enrollments.studentId, o: offerings })
    .from(enrollments)
    .innerJoin(offerings, eq(offerings.id, enrollments.offeringId))
    .where(and(inArray(offerings.periodId, periodIds), eq(enrollments.status, 'active')));
  const drop = current.filter((e) => !keep.has(`${e.s}|${offKey(e.o)}`)).map((e) => e.id);
  for (const part of chunk(drop, 1000)) await db.update(enrollments).set({ status: 'dropped' }).where(inArray(enrollments.id, part));
  return drop.length;
}

const APPLIERS: Record<ImportKind, Applier> = {
  faculties: applyFaculties,
  departments: applyDepartments,
  programs: applyPrograms,
  groups: applyGroups,
  teachers: applyTeachers,
  students: applyStudents,
  disciplines: applyDisciplines,
  offerings: applyOfferings,
  enrollments: applyEnrollments,
};
