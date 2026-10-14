import { Inflate, inflateSync } from 'fflate';

/**
 * Чтение ZIP прямо в браузере без загрузки архива в память целиком.
 *
 * Архив курса может весить десятки гигабайт (видео). Мы читаем только
 * центральный каталог в конце файла, а каждый файл отдаём как Blob-срез
 * исходного File: несжатое видео (метод store) уходит в Bunny напрямую,
 * без копирования. Поддерживаются ZIP64 (архивы > 4 ГБ) и имена файлов
 * в UTF-8 и CP866 (архивы из Windows с русскими именами).
 */
export type ZipEntry = {
  path: string;
  size: number;
  compressedSize: number;
  method: number;
  /** Blob содержимого (для сжатых — распаковывается по требованию) */
  blob: () => Promise<Blob>;
  bytes: () => Promise<Uint8Array>;
};

const sig = { eocd: 0x06054b50, zip64Locator: 0x07064b50, zip64Eocd: 0x06064b50, central: 0x02014b50, local: 0x04034b50 };

async function readSlice(file: Blob, start: number, end: number) {
  return new DataView(await file.slice(start, end).arrayBuffer());
}

function u64(view: DataView, off: number) {
  return Number(view.getBigUint64(off, true));
}

function decodeName(bytes: Uint8Array, utf8Flag: boolean) {
  if (utf8Flag) return new TextDecoder('utf-8').decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    try {
      return new TextDecoder('ibm866').decode(bytes);
    } catch {
      return new TextDecoder('latin1').decode(bytes);
    }
  }
}

export async function readZip(file: File): Promise<ZipEntry[]> {
  const tailSize = Math.min(file.size, 65_557);
  const tail = await readSlice(file, file.size - tailSize, file.size);
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === sig.eocd) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('NOT_A_ZIP');
  let count = tail.getUint16(eocd + 10, true);
  let cdSize = tail.getUint32(eocd + 12, true);
  let cdOffset = tail.getUint32(eocd + 16, true);
  if (count === 0xffff || cdOffset === 0xffffffff || cdSize === 0xffffffff) {
    const loc = eocd - 20;
    if (loc >= 0 && tail.getUint32(loc, true) === sig.zip64Locator) {
      const z64Off = u64(tail, loc + 8);
      const z = await readSlice(file, z64Off, z64Off + 56);
      if (z.getUint32(0, true) !== sig.zip64Eocd) throw new Error('BAD_ZIP64');
      count = u64(z, 32);
      cdSize = u64(z, 40);
      cdOffset = u64(z, 48);
    }
  }
  const cd = await readSlice(file, cdOffset, cdOffset + cdSize);
  const entries: ZipEntry[] = [];
  let p = 0;
  for (let n = 0; n < count && p + 46 <= cd.byteLength; n++) {
    if (cd.getUint32(p, true) !== sig.central) break;
    const flags = cd.getUint16(p + 8, true);
    const method = cd.getUint16(p + 10, true);
    let compressedSize = cd.getUint32(p + 20, true);
    let size = cd.getUint32(p + 24, true);
    const nameLen = cd.getUint16(p + 28, true);
    const extraLen = cd.getUint16(p + 30, true);
    const commentLen = cd.getUint16(p + 32, true);
    let localOffset = cd.getUint32(p + 42, true);
    const nameBytes = new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen);
    const path = decodeName(nameBytes, (flags & 0x800) !== 0);
    // ZIP64: настоящие размеры и смещение — в дополнительном поле 0x0001
    let e = p + 46 + nameLen;
    const eEnd = e + extraLen;
    while (e + 4 <= eEnd) {
      const id = cd.getUint16(e, true);
      const len = cd.getUint16(e + 2, true);
      if (id === 0x0001) {
        let q = e + 4;
        if (size === 0xffffffff) (size = u64(cd, q)), (q += 8);
        if (compressedSize === 0xffffffff) (compressedSize = u64(cd, q)), (q += 8);
        if (localOffset === 0xffffffff) localOffset = u64(cd, q);
      }
      e += 4 + len;
    }
    p = eEnd + commentLen;
    if (path.endsWith('/')) continue;
    const dataStart = async () => {
      const lh = await readSlice(file, localOffset, localOffset + 30);
      if (lh.getUint32(0, true) !== sig.local) throw new Error('BAD_LOCAL_HEADER');
      return localOffset + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
    };
    const entry: ZipEntry = {
      path,
      size,
      compressedSize,
      method,
      blob: async () => {
        const start = await dataStart();
        const raw = file.slice(start, start + compressedSize);
        if (method === 0) return raw;
        if (method !== 8) throw new Error('UNSUPPORTED_METHOD');
        return inflateBlob(raw);
      },
      bytes: async () => {
        const start = await dataStart();
        const raw = new Uint8Array(await file.slice(start, start + compressedSize).arrayBuffer());
        if (method === 0) return raw;
        if (method !== 8) throw new Error('UNSUPPORTED_METHOD');
        return inflateSync(raw);
      },
    };
    entries.push(entry);
  }
  return entries.filter((x) => !x.path.startsWith('__MACOSX/') && !x.path.split('/').pop()!.startsWith('.'));
}

/** Потоковая распаковка большого сжатого файла: память — кусками по 8 МБ */
async function inflateBlob(raw: Blob): Promise<Blob> {
  const parts: Uint8Array[] = [];
  const inflater = new Inflate((chunk) => parts.push(chunk));
  const step = 8 * 1024 * 1024;
  for (let o = 0; o < raw.size; o += step) {
    const buf = new Uint8Array(await raw.slice(o, o + step).arrayBuffer());
    inflater.push(buf, o + step >= raw.size);
  }
  return new Blob(parts as BlobPart[]);
}

/** Общий корень архива: «Курс ООП/course.xlsx» → убираем «Курс ООП/» */
export function stripCommonRoot(paths: string[]) {
  const first = paths[0]?.split('/') ?? [];
  if (first.length < 2) return '';
  const root = first[0] + '/';
  return paths.every((p) => p.startsWith(root)) ? root : '';
}
