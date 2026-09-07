/**
 * Уведомления — раздел 4.10 ТЗ, требование F-COM-06.
 *
 * Пользователь настраивает каналы доставки, но критические уведомления
 * отключить нельзя: о дедлайне, оценке и приказе обучающийся обязан узнать.
 */

export type NotificationTypeCode =
  | 'NEW_MATERIAL'
  | 'DEADLINE_SOON'
  | 'GRADE_POSTED'
  | 'ANNOUNCEMENT'
  | 'SUBMISSION_RETURNED'
  | 'COURSE_REVIEW'
  | 'SYSTEM'
  | 'CHAT_MESSAGE'
  | 'IEP_STATUS'
  | 'APPEAL_STATUS'
  | 'ORDER_ISSUED';

export type ChannelCode = 'IN_APP' | 'EMAIL' | 'PUSH';

export const NOTIFICATION_LABELS: Record<NotificationTypeCode, string> = {
  NEW_MATERIAL: 'Новые материалы курса',
  DEADLINE_SOON: 'Приближение дедлайна',
  GRADE_POSTED: 'Выставлена оценка',
  ANNOUNCEMENT: 'Объявления',
  SUBMISSION_RETURNED: 'Работа возвращена на доработку',
  COURSE_REVIEW: 'Согласование курса',
  SYSTEM: 'Системные сообщения',
  CHAT_MESSAGE: 'Сообщения в чатах',
  IEP_STATUS: 'Изменение статуса ИУП',
  APPEAL_STATUS: 'Решение по апелляции',
  ORDER_ISSUED: 'Приказ по обучающемуся',
};

export const CHANNEL_LABELS: Record<ChannelCode, string> = {
  IN_APP: 'в приложении',
  EMAIL: 'на почту',
  PUSH: 'push-уведомление',
};

/**
 * Критические типы: отключить их нельзя ни по одному каналу «в приложении».
 *
 * Перечень выведен из ТЗ буквально: «критические уведомления (дедлайн,
 * оценка, приказ) отключить нельзя». Решение по апелляции добавлено к ним
 * по той же логике — это результат обращения самого обучающегося.
 */
export const CRITICAL_TYPES: NotificationTypeCode[] = [
  'DEADLINE_SOON',
  'GRADE_POSTED',
  'ORDER_ISSUED',
  'APPEAL_STATUS',
];

export function isCritical(type: NotificationTypeCode): boolean {
  return CRITICAL_TYPES.includes(type);
}

export interface PreferenceSpec {
  type: NotificationTypeCode;
  channel: ChannelCode;
  enabled: boolean;
}

/**
 * Может ли пользователь отключить доставку этого типа по этому каналу.
 *
 * Критическое уведомление нельзя отключить в приложении — это способ
 * доставки, который всегда доступен. Почту и push отключить можно:
 * они зависят от внешних сервисов и от согласия на рассылку.
 */
export function canDisable(type: NotificationTypeCode, channel: ChannelCode): boolean {
  if (!isCritical(type)) return true;
  return channel !== 'IN_APP';
}

/**
 * Каналы доставки для конкретного уведомления с учётом настроек.
 *
 * Отсутствие настройки означает «включено»: пользователь, ни разу
 * не заходивший в настройки, должен получать уведомления, а не тишину.
 */
export function resolveChannels(
  type: NotificationTypeCode,
  preferences: PreferenceSpec[],
  available: ChannelCode[] = ['IN_APP', 'EMAIL', 'PUSH']
): ChannelCode[] {
  return available.filter((channel) => {
    if (!canDisable(type, channel)) return true;
    const pref = preferences.find((p) => p.type === type && p.channel === channel);
    return pref ? pref.enabled : true;
  });
}

/** Полная матрица настроек для страницы «Уведомления» */
export function preferenceMatrix(
  preferences: PreferenceSpec[]
): { type: NotificationTypeCode; channels: { channel: ChannelCode; enabled: boolean; locked: boolean }[] }[] {
  const types = Object.keys(NOTIFICATION_LABELS) as NotificationTypeCode[];
  const channels: ChannelCode[] = ['IN_APP', 'EMAIL', 'PUSH'];

  return types.map((type) => ({
    type,
    channels: channels.map((channel) => {
      const locked = !canDisable(type, channel);
      const pref = preferences.find((p) => p.type === type && p.channel === channel);
      return {
        channel,
        enabled: locked ? true : (pref?.enabled ?? true),
        locked,
      };
    }),
  }));
}
