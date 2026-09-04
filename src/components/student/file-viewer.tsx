'use client';

import { useState } from 'react';
import { Download, Eye, FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { fmtBytes } from '@/lib/utils';

export interface ViewerFile {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * F-S-05. Просмотр PDF и презентаций во встроенном просмотрщике
 * без скачивания на устройство (для материалов с соответствующим ограничением).
 *
 * Ссылка на файл всегда подписанная и с ограниченным сроком действия
 * (раздел 6.3) — она получается через /api/files/[id].
 */
export function FileViewer({
  attachments,
  preventDownload,
}: {
  attachments: ViewerFile[];
  preventDownload: boolean;
}) {
  const t = useTranslations('student');
  const [open, setOpen] = useState<string | null>(
    attachments.find((a) => a.mimeType === 'application/pdf')?.id ?? null
  );

  if (attachments.length === 0) return null;

  return (
    <div className="space-y-4">
      {open && (
        <div className="overflow-hidden rounded-xl border border-border">
          <iframe
            src={`/api/files/${open}#toolbar=${preventDownload ? 0 : 1}&navpanes=0`}
            className="h-[70vh] max-h-[900px] w-full bg-muted"
            title="Просмотр документа"
          />
        </div>
      )}

      <Card>
        <CardBody>
          <ul className="space-y-2">
            {attachments.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 text-sm">
                <FileText size={16} className="shrink-0 text-fg-muted" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{a.fileName}</span>
                <span className="shrink-0 text-xs text-fg-muted">{fmtBytes(a.sizeBytes)}</span>
                {a.mimeType === 'application/pdf' && (
                  <Button size="sm" variant="ghost" onClick={() => setOpen(a.id)}>
                    <Eye size={14} aria-hidden /> Просмотр
                  </Button>
                )}
                {!preventDownload && (
                  <a href={`/api/files/${a.id}`} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="outline">
                      <Download size={14} aria-hidden /> Скачать
                    </Button>
                  </a>
                )}
              </li>
            ))}
          </ul>
          {preventDownload && (
            <p className="mt-3 text-xs text-fg-muted">{t('downloadDisabled')}</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
