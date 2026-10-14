import { t } from '../t';

/** Тексты уведомлений: параметры подставляются на языке получателя */
export const notify = {
  title: t('Уведомления', 'Хабарламалар', 'Notifications'),
  empty: t('Уведомлений нет', 'Хабарламалар жоқ', 'No notifications'),
  markAll: t('Отметить все прочитанными', 'Барлығын оқылды деп белгілеу', 'Mark all as read'),
  types: {
    gradePosted: t('Новая оценка: {item}', 'Жаңа баға: {item}', 'New grade: {item}'),
    submissionReceived: t('Студент сдал работу: {item}', 'Студент жұмыс тапсырды: {item}', 'A student submitted: {item}'),
    submissionGraded: t('Работа «{item}» проверена: {score}', '«{item}» жұмысы тексерілді: {score}', '“{item}” graded: {score}'),
    deadlineSoon: t('Скоро срок: {item} — до {date}', 'Мерзім жақын: {item} — {date} дейін', 'Due soon: {item} — by {date}'),
    courseSubmitted: t('Курс «{course}» ждёт утверждения', '«{course}» курсы бекітуді күтуде', 'Course “{course}” awaits approval'),
    courseApproved: t('Курс «{course}» опубликован', '«{course}» курсы жарияланды', 'Course “{course}” is published'),
    courseReturned: t('Курс «{course}» возвращён на доработку', '«{course}» курсы пысықтауға қайтарылды', 'Course “{course}” was returned for changes'),
    requestCreated: t('Новая заявка на изменение оценки', 'Бағаны өзгертуге жаңа өтінім', 'New grade change request'),
    requestApproved: t('Заявка одобрена: {item}', 'Өтінім мақұлданды: {item}', 'Request approved: {item}'),
    requestRejected: t('Заявка отклонена: {item}', 'Өтінім қабылданбады: {item}', 'Request rejected: {item}'),
    sheetReady: t('Ведомость {component} готова к отправке', '{component} ведомосы жіберуге дайын', 'Sheet {component} is ready to send'),
    sheetRejected: t('Ведомость {component} возвращена', '{component} ведомосы қайтарылды', 'Sheet {component} was returned'),
    videoReady: t('Видео обработано: {file}', 'Бейне өңделді: {file}', 'Video processed: {file}'),
    videoFailed: t('Ошибка обработки видео: {file}', 'Бейнені өңдеу қатесі: {file}', 'Video processing failed: {file}'),
    authorAssigned: t('Вы назначены автором курса «{course}»', 'Сіз «{course}» курсының авторы болып тағайындалдыңыз', 'You are now an author of “{course}”'),
  },
};
