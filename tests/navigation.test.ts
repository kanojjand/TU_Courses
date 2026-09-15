import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { isNavActive, navigationFor, PRIMARY_LIMIT } from '../src/lib/navigation';
import type { RoleCode } from '../src/lib/rbac';

const as = (...roles: RoleCode[]) => ({ roles });
const hrefs = (items: { href: string }[]) => items.map((i) => i.href);

describe('Навигация по ролям', () => {
  const cases: [string, ReturnType<typeof as> | null][] = [
    ['гость', null],
    ['обучающийся', as('STUDENT')],
    ['преподаватель', as('TEACHER')],
    ['тьютор', as('TUTOR')],
    ['эдвайзер', as('ADVISOR')],
    ['методист', as('METHODIST')],
    ['регистратор', as('REGISTRAR')],
    ['администратор', as('ADMIN')],
    ['преподаватель и эдвайзер', as('TEACHER', 'ADVISOR')],
    ['все роли сразу', as('ADMIN', 'REGISTRAR', 'METHODIST', 'TEACHER', 'ADVISOR', 'STUDENT')],
  ];

  for (const [name, user] of cases) {
    it(`${name}: главных пунктов не больше ${PRIMARY_LIMIT} и без повторов`, () => {
      const { primary, secondary } = navigationFor(user);
      assert.ok(primary.length > 0 && primary.length <= PRIMARY_LIMIT);
      const all = [...primary, ...secondary].map((i) => i.match ?? i.href);
      assert.equal(new Set(all).size, all.length);
    });
  }

  it('у обучающегося на первом плане главная, курсы, оценки и чаты', () => {
    assert.deepEqual(hrefs(navigationFor(as('STUDENT')).primary), [
      '/dashboard',
      '/my/courses',
      '/my/grades',
      '/my/chats',
    ]);
  });

  it('ИУП, практика и транскрипт у обучающегося доступны через «Ещё»', () => {
    const secondary = hrefs(navigationFor(as('STUDENT')).secondary);
    for (const href of ['/my/iep', '/my/practice', '/my/transcript']) {
      assert.ok(secondary.includes(href), href);
    }
  });

  it('преподавателю раздел управления не показывается, хотя ведомости ему доступны', () => {
    const { primary, secondary } = navigationFor(as('TEACHER'));
    assert.ok(![...primary, ...secondary].some((i) => i.icon === 'manage'));
    assert.equal(primary[0].href, '/teach');
  });

  it('методист попадает в свой первый доступный раздел, а не в пользователей', () => {
    const manage = navigationFor(as('METHODIST')).primary.find((i) => i.icon === 'manage');
    assert.ok(manage);
    assert.notEqual(manage.href, '/admin/users');
  });

  it('раздел управления подсвечивается на любой странице /admin', () => {
    const manage = navigationFor(as('ADMIN')).primary.find((i) => i.icon === 'manage')!;
    assert.equal(isNavActive(manage, '/admin/groups'), true);
    assert.equal(isNavActive(manage, '/administrator'), false);
  });

  it('главная гостя активна только на самой главной', () => {
    const home = navigationFor(null).primary[0];
    assert.equal(isNavActive(home, '/'), true);
    assert.equal(isNavActive(home, '/courses'), false);
  });
});
