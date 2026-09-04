import crypto from 'node:crypto';

/**
 * Шифрование ИИН — раздел 6.3 ТЗ.
 *
 * ИИН хранится в зашифрованном виде (AES-256-GCM). Рядом хранится
 * детерминированный HMAC-хеш — он позволяет искать пользователя по ИИН
 * и контролировать уникальность, не расшифровывая значение.
 *
 * В интерфейсе ИИН отображается маскированным; полностью — только ролям
 * с соответствующим правом.
 */

const ALGORITHM = 'aes-256-gcm';

function getKey(): Buffer {
  const raw = process.env.IIN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'IIN_ENCRYPTION_KEY не задан. Сгенерируйте: openssl rand -base64 32'
    );
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('IIN_ENCRYPTION_KEY должен быть 32 байта в base64.');
  }
  return key;
}

/** Шифрование ИИН. Формат: base64(iv):base64(tag):base64(ciphertext) */
export function encryptIin(iin: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(iin, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':');
}

export function decryptIin(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(':');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Некорректный формат зашифрованного ИИН.');
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/** Детерминированный хеш для поиска и уникальности */
export function hashIin(iin: string): string {
  return crypto.createHmac('sha256', getKey()).update(iin.trim()).digest('hex');
}

/** Маскирование для интерфейса: 123456789012 → 1234•••••012 */
export function maskIin(iin: string): string {
  if (iin.length < 12) return '••••••••••••';
  return `${iin.slice(0, 4)}•••••${iin.slice(-3)}`;
}

/**
 * Валидация ИИН РК: 12 цифр, контрольный разряд по двум наборам весов.
 */
export function isValidIin(iin: string): boolean {
  if (!/^\d{12}$/.test(iin)) return false;
  const digits = iin.split('').map(Number);
  const w1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const w2 = [3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2];
  const sum = (w: number[]) => w.reduce((s, weight, i) => s + weight * digits[i], 0);
  let control = sum(w1) % 11;
  if (control === 10) control = sum(w2) % 11;
  if (control === 10) return false;
  return control === digits[11];
}

/** SHA-256 файла — контрольная сумма Attachment */
export function sha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/** Ключ идемпотентности для исходящих событий интеграции */
export function idempotencyKey(...parts: (string | number)[]): string {
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 40);
}

/** Криптостойкий временный пароль для импортируемых пользователей */
export function generatePassword(length = 12): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}
