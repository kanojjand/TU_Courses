import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  unreadCount,
  canPost,
  canModerate,
  messagePermissions,
  isAddressed,
  isVisible,
  sortAnnouncements,
  requiresMassPermission,
  type MemberSpec,
  type MessageSpec,
  type AudienceSpec,
  type AnnouncementSpec,
} from '../src/domain/chat';
import {
  canDisable,
  isCritical,
  resolveChannels,
  preferenceMatrix,
  CRITICAL_TYPES,
} from '../src/domain/notify';

/** Коммуникации — раздел 4.10 ТЗ, F-COM-01…F-COM-08. */

const member = (over: Partial<MemberSpec> = {}): MemberSpec => ({
  userId: 'u1',
  role: 'MEMBER',
  lastReadAt: null,
  leftAt: null,
  isMuted: false,
  ...over,
});

const msg = (id: string, authorId: string | null, minutesAgo: number, deleted = false): MessageSpec => ({
  id,
  authorId,
  createdAt: new Date(Date.now() - minutesAgo * 60_000),
  deletedAt: deleted ? new Date() : null,
});

describe('Счётчик непрочитанных (F-COM-03)', () => {
  const messages = [msg('m1', 'u2', 30), msg('m2', 'u1', 20), msg('m3', 'u2', 10)];

  it('без отметки прочтения считает все чужие сообщения', () => {
    assert.equal(unreadCount(member(), messages), 2);
  });

  it('свои сообщения непрочитанными не считаются', () => {
    // Иначе счётчик рос бы от собственной активности
    const own = messages.filter((m) => m.authorId === 'u1');
    assert.equal(unreadCount(member(), own), 0);
  });

  it('отметка прочтения отсекает старые сообщения', () => {
    const m = member({ lastReadAt: new Date(Date.now() - 15 * 60_000) });
    assert.equal(unreadCount(m, messages), 1);
  });

  it('удалённые сообщения не считаются', () => {
    const withDeleted = [msg('m1', 'u2', 30, true), msg('m2', 'u2', 10)];
    assert.equal(unreadCount(member(), withDeleted), 1);
  });

  it('вышедший участник непрочитанных не имеет', () => {
    assert.equal(unreadCount(member({ leftAt: new Date() }), messages), 0);
  });
});

describe('Право отправки сообщения (F-COM-04)', () => {
  const open = { isReadOnly: false, isArchived: false };

  it('участник пишет в открытый разговор', () => {
    assert.equal(canPost(member(), open).allowed, true);
  });

  it('не участник писать не может', () => {
    assert.equal(canPost(null, open).allowed, false);
  });

  it('режим «только чтение» отключает рядовых участников', () => {
    const r = canPost(member(), { isReadOnly: true, isArchived: false });
    assert.equal(r.allowed, false);
    assert.match(r.reason ?? '', /отключена модератором/);
  });

  it('модератор пишет и при отключённых сообщениях', () => {
    // Иначе куратор, закрывший чат на время сессии, не мог бы написать сам
    const m = member({ role: 'OWNER' });
    assert.equal(canPost(m, { isReadOnly: true, isArchived: false }).allowed, true);
  });

  it('в архивный разговор не пишет никто', () => {
    const m = member({ role: 'OWNER' });
    assert.equal(canPost(m, { isReadOnly: false, isArchived: true }).allowed, false);
  });
});

describe('Права на сообщение (F-COM-02)', () => {
  const own = { authorId: 'u1', deletedAt: null };
  const other = { authorId: 'u2', deletedAt: null };

  it('автор правит и удаляет своё', () => {
    assert.deepEqual(messagePermissions(member(), own), { canEdit: true, canDelete: true });
  });

  it('рядовой участник чужое не трогает', () => {
    assert.deepEqual(messagePermissions(member(), other), { canEdit: false, canDelete: false });
  });

  it('модератор удаляет чужое, но не правит', () => {
    // Правка чужого текста от чужого имени подменяет авторство
    const m = member({ role: 'MODERATOR' });
    assert.deepEqual(messagePermissions(m, other), { canEdit: false, canDelete: true });
  });

  it('удалённое сообщение больше не редактируется', () => {
    const removed = { authorId: 'u1', deletedAt: new Date() };
    assert.deepEqual(messagePermissions(member(), removed), { canEdit: false, canDelete: false });
  });

  it('модерировать могут владелец и модератор', () => {
    assert.equal(canModerate(member({ role: 'OWNER' })), true);
    assert.equal(canModerate(member({ role: 'MODERATOR' })), true);
    assert.equal(canModerate(member()), false);
    assert.equal(canModerate(null), false);
  });
});

describe('Адресация объявлений (F-COM-05)', () => {
  const audience: AudienceSpec = {
    facultyIds: ['f1'],
    departmentIds: ['d1'],
    programIds: ['p1'],
    groupIds: ['g1'],
    courseIds: ['c1'],
  };

  it('объявление университету видят все', () => {
    assert.equal(isAddressed([{ scope: 'UNIVERSITY', scopeId: null }], audience), true);
  });

  it('объявление своей группе видно, чужой — нет', () => {
    assert.equal(isAddressed([{ scope: 'GROUP', scopeId: 'g1' }], audience), true);
    assert.equal(isAddressed([{ scope: 'GROUP', scopeId: 'g9' }], audience), false);
  });

  it('достаточно совпадения по одной цели из нескольких', () => {
    const targets = [
      { scope: 'FACULTY' as const, scopeId: 'f9' },
      { scope: 'GROUP' as const, scopeId: 'g1' },
    ];
    assert.equal(isAddressed(targets, audience), true);
  });

  it('объявление без целей не адресовано никому', () => {
    assert.equal(isAddressed([], audience), false);
  });
});

describe('Порядок и видимость объявлений (F-COM-07)', () => {
  const now = new Date('2026-09-08T12:00:00Z');
  const base = (over: Partial<AnnouncementSpec>): AnnouncementSpec => ({
    id: 'a',
    isNormative: false,
    isPinned: false,
    isImportant: false,
    publishedAt: null,
    expiresAt: null,
    createdAt: new Date('2026-09-01'),
    ...over,
  });

  it('нормативное объявление стоит первым независимо от даты', () => {
    // Типовые правила, п. 31: сведения об аккредитации не смещаются вниз
    const items = [
      base({ id: 'fresh', createdAt: new Date('2026-09-08') }),
      base({ id: 'normative', isNormative: true, createdAt: new Date('2026-01-01') }),
      base({ id: 'pinned', isPinned: true, createdAt: new Date('2026-02-01') }),
    ];
    assert.deepEqual(
      sortAnnouncements(items).map((i) => i.id),
      ['normative', 'pinned', 'fresh']
    );
  });

  it('внутри одного ранга сортировка по дате, новые сверху', () => {
    const items = [
      base({ id: 'old', createdAt: new Date('2026-01-01') }),
      base({ id: 'new', createdAt: new Date('2026-09-01') }),
    ];
    assert.deepEqual(sortAnnouncements(items).map((i) => i.id), ['new', 'old']);
  });

  it('важное идёт выше обычного', () => {
    const items = [
      base({ id: 'plain', createdAt: new Date('2026-09-08') }),
      base({ id: 'important', isImportant: true, createdAt: new Date('2026-01-01') }),
    ];
    assert.deepEqual(sortAnnouncements(items).map((i) => i.id), ['important', 'plain']);
  });

  it('отложенная публикация и срок действия учитываются', () => {
    assert.equal(isVisible(base({ publishedAt: new Date('2026-09-10') }), now), false);
    assert.equal(isVisible(base({ publishedAt: new Date('2026-09-01') }), now), true);
    assert.equal(isVisible(base({ expiresAt: new Date('2026-09-01') }), now), false);
    assert.equal(isVisible(base({ expiresAt: new Date('2026-12-01') }), now), true);
  });
});

describe('Ограничение массовой рассылки (F-COM-08)', () => {
  it('университет и факультет требуют особого права', () => {
    assert.equal(requiresMassPermission([{ scope: 'UNIVERSITY', scopeId: null }]), true);
    assert.equal(requiresMassPermission([{ scope: 'FACULTY', scopeId: 'f1' }]), true);
  });

  it('кафедра, группа и дисциплина — нет', () => {
    assert.equal(requiresMassPermission([{ scope: 'DEPARTMENT', scopeId: 'd1' }]), false);
    assert.equal(requiresMassPermission([{ scope: 'GROUP', scopeId: 'g1' }]), false);
    assert.equal(requiresMassPermission([{ scope: 'COURSE', scopeId: 'c1' }]), false);
  });
});

describe('Настройка каналов уведомлений (F-COM-06)', () => {
  it('критические типы перечислены по ТЗ', () => {
    assert.ok(CRITICAL_TYPES.includes('DEADLINE_SOON'));
    assert.ok(CRITICAL_TYPES.includes('GRADE_POSTED'));
    assert.ok(CRITICAL_TYPES.includes('ORDER_ISSUED'));
    assert.equal(isCritical('NEW_MATERIAL'), false);
  });

  it('критическое уведомление нельзя отключить в приложении', () => {
    assert.equal(canDisable('DEADLINE_SOON', 'IN_APP'), false);
    // Почту и push отключить можно: они зависят от внешних сервисов
    assert.equal(canDisable('DEADLINE_SOON', 'EMAIL'), true);
    assert.equal(canDisable('DEADLINE_SOON', 'PUSH'), true);
  });

  it('некритическое отключается по любому каналу', () => {
    assert.equal(canDisable('NEW_MATERIAL', 'IN_APP'), true);
  });

  it('отсутствие настройки означает «включено»', () => {
    assert.deepEqual(resolveChannels('NEW_MATERIAL', []), ['IN_APP', 'EMAIL', 'PUSH']);
  });

  it('выключенный канал исключается', () => {
    const prefs = [{ type: 'NEW_MATERIAL' as const, channel: 'EMAIL' as const, enabled: false }];
    assert.deepEqual(resolveChannels('NEW_MATERIAL', prefs), ['IN_APP', 'PUSH']);
  });

  it('попытка отключить критическое в приложении игнорируется', () => {
    const prefs = [{ type: 'GRADE_POSTED' as const, channel: 'IN_APP' as const, enabled: false }];
    assert.ok(resolveChannels('GRADE_POSTED', prefs).includes('IN_APP'));
  });

  it('матрица настроек помечает критические каналы заблокированными', () => {
    const matrix = preferenceMatrix([]);
    const deadline = matrix.find((m) => m.type === 'DEADLINE_SOON')!;
    const inApp = deadline.channels.find((c) => c.channel === 'IN_APP')!;
    assert.equal(inApp.locked, true);
    assert.equal(inApp.enabled, true);

    const material = matrix.find((m) => m.type === 'NEW_MATERIAL')!;
    assert.equal(material.channels.every((c) => !c.locked), true);
  });
});
