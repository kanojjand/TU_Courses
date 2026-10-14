import { describe, expect, it } from 'vitest';
import { applyLateRule, submissionDecision, teacherEditDecision, timingAt } from '@/lib/rules/deadlines';

const d = (s: string) => new Date(s);
const win = { opensAt: d('2026-10-01T00:00:00Z'), dueAt: d('2026-10-20T18:59:00Z'), hardCloseAt: d('2026-11-07T18:59:00Z') };

describe('правила «вовремя» (5.3)', () => {
  it('до открытия, вовремя, поздно, закрыто', () => {
    expect(timingAt(win, d('2026-09-30T00:00:00Z'))).toBe('not_open');
    expect(timingAt(win, d('2026-10-10T00:00:00Z'))).toBe('on_time');
    expect(timingAt(win, d('2026-10-25T00:00:00Z'))).toBe('late');
    expect(timingAt(win, d('2026-11-08T00:00:00Z'))).toBe('closed');
  });
  it('без дат окно всегда открыто', () => {
    expect(timingAt({ opensAt: null, dueAt: null, hardCloseAt: null }, d('2030-01-01T00:00:00Z'))).toBe('on_time');
  });
  it('сдача: после срока можно с пометкой, после закрытия — нельзя', () => {
    expect(submissionDecision(win, d('2026-10-25T00:00:00Z'))).toEqual({ allowed: true, late: true, timing: 'late' });
    expect(submissionDecision(win, d('2026-11-10T00:00:00Z')).allowed).toBe(false);
  });
  it('правило поздней сдачи: штраф, ноль, без штрафа', () => {
    expect(applyLateRule(80, true, { lateRule: 'penalty', latePenaltyPct: 20 })).toBe(64);
    expect(applyLateRule(80, true, { lateRule: 'zero', latePenaltyPct: 20 })).toBe(0);
    expect(applyLateRule(80, true, { lateRule: 'none', latePenaltyPct: 20 })).toBe(80);
    expect(applyLateRule(80, false, { lateRule: 'zero', latePenaltyPct: 20 })).toBe(80);
    expect(applyLateRule(130, false, { lateRule: 'none', latePenaltyPct: 0 })).toBe(100);
  });
  it('после закрытия окна и после отправки ведомости — только заявка', () => {
    expect(teacherEditDecision(win, null, d('2026-10-25T00:00:00Z'))).toBe('ok');
    expect(teacherEditDecision(win, null, d('2026-11-08T00:00:00Z'))).toBe('needs_request');
    expect(teacherEditDecision(win, { status: 'sent' }, d('2026-10-25T00:00:00Z'))).toBe('needs_request');
    expect(teacherEditDecision(win, { status: 'confirmed' }, d('2026-10-25T00:00:00Z'))).toBe('needs_request');
    expect(teacherEditDecision(win, { status: 'final' }, d('2026-10-25T00:00:00Z'))).toBe('ok');
  });
});
