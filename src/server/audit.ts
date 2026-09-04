import 'server-only';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';

/**
 * Журнал аудита — раздел 3 ТЗ.
 *
 * Логируются: действия с оценками, публикация курсов, операции с персональными
 * данными и входы. Фиксируется кто, что, когда, прежнее и новое значение
 * (критерий приёмки № 13).
 */

export interface AuditInput {
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
}

export async function writeAudit(input: AuditInput): Promise<void> {
  let ip: string | null = null;
  let ua: string | null = null;
  try {
    const h = await headers();
    ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
    ua = h.get('user-agent');
  } catch {
    // вне контекста запроса (cron, скрипты) — заголовков нет
  }

  await prisma.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      actorEmail: input.actorEmail ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      oldValue: (input.oldValue as never) ?? undefined,
      newValue: (input.newValue as never) ?? undefined,
      reason: input.reason ?? null,
      ipAddress: ip,
      userAgent: ua,
    },
  });
}

/** Действия, подлежащие обязательному логированию */
export const AUDIT_ACTIONS = {
  LOGIN: 'LOGIN',
  GRADE_CREATE: 'GRADE_CREATE',
  GRADE_UPDATE: 'GRADE_UPDATE',
  GRADE_DELETE: 'GRADE_DELETE',
  PERIOD_GRADE_RECALC: 'PERIOD_GRADE_RECALC',
  GRADESHEET_CLOSE: 'GRADESHEET_CLOSE',
  GRADESHEET_REOPEN: 'GRADESHEET_REOPEN',
  COURSE_SUBMIT_REVIEW: 'COURSE_SUBMIT_REVIEW',
  COURSE_APPROVE: 'COURSE_APPROVE',
  COURSE_REJECT: 'COURSE_REJECT',
  COURSE_PUBLISH: 'COURSE_PUBLISH',
  COURSE_UNPUBLISH: 'COURSE_UNPUBLISH',
  USER_CREATE: 'USER_CREATE',
  USER_UPDATE: 'USER_UPDATE',
  USER_BLOCK: 'USER_BLOCK',
  USER_IMPORT: 'USER_IMPORT',
  PASSWORD_RESET: 'PASSWORD_RESET',
  ROLE_GRANT: 'ROLE_GRANT',
  ROLE_REVOKE: 'ROLE_REVOKE',
  IIN_VIEW: 'IIN_VIEW',
  CONSENT_ACCEPT: 'CONSENT_ACCEPT',
  ENROLLMENT_CREATE: 'ENROLLMENT_CREATE',
  ENROLLMENT_CANCEL: 'ENROLLMENT_CANCEL',
  SETTING_UPDATE: 'SETTING_UPDATE',
  OUTBOX_APPROVE: 'OUTBOX_APPROVE',
  EXPORT_REPORT: 'EXPORT_REPORT',
} as const;
