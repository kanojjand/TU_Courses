'use client';

import { Download, KeyRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { downloadBlob } from '@/components/ui/data-table';
import { Checkbox, Field, Select } from '@/components/ui/input';
import { buildXlsx, XLSX_MIME } from '@/lib/xlsx-writer';
import { issuePasswordsAction } from '@/server/registrar-actions';

type Group = { id: string; code: string; total: number; missing: number };

export function AccountsPanel({ groups }: { groups: Group[] }) {
  const t = useTranslations();
  const [groupId, setGroupId] = useState(groups[0]?.id ?? '');
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [issued, setIssued] = useState<{ login: string; name: string; password: string }[] | null>(null);
  const [pending, start] = useTransition();
  const g = groups.find((x) => x.id === groupId);

  function download(list: { login: string; name: string; password: string }[]) {
    const data = buildXlsx([{ name: g?.code ?? 'group', header: [t('common.fullName'), t('auth.login'), t('auth.password')], rows: list.map((a) => [a.name, a.login, a.password]) }]);
    downloadBlob(data as BlobPart, `${g?.code ?? 'group'}_passwords.xlsx`, XLSX_MIME);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('registrar.accounts.group')}>
          <Select value={groupId} onChange={(e) => (setGroupId(e.target.value), setIssued(null))}>
            {groups.map((x) => (
              <option key={x.id} value={x.id}>
                {x.code}
              </option>
            ))}
          </Select>
        </Field>
        {g && (
          <div className="flex items-end gap-4 text-sm text-fg-muted">
            <span>{t('registrar.accounts.total', { n: g.total })}</span>
            <span className={g.missing ? 'font-medium text-warning' : ''}>{t('registrar.accounts.withoutPassword', { n: g.missing })}</span>
          </div>
        )}
      </div>
      <Checkbox checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} label={t('registrar.accounts.onlyMissing')} />
      <Button
        size="lg"
        disabled={pending || !groupId}
        onClick={() => {
          if (!onlyMissing && !window.confirm(t('registrar.accounts.confirmAll'))) return;
          start(async () => {
            const res = await issuePasswordsAction(groupId, onlyMissing);
            if ('error' in res || !res.accounts) {
              toast.error(t('common.somethingWrong'));
              return;
            }
            setIssued(res.accounts);
            if (res.accounts.length) download(res.accounts);
          });
        }}
      >
        <KeyRound />
        {t('registrar.accounts.issue')}
      </Button>
      {issued && (
        <div className="rounded-xl border border-success/30 bg-success-soft p-4">
          <p className="font-medium text-success">{t('registrar.accounts.issued', { n: issued.length })}</p>
          {issued.length > 0 && (
            <>
              <Button variant="secondary" className="mt-3" onClick={() => download(issued)}>
                <Download />
                {t('registrar.accounts.downloadTable')}
              </Button>
              <table className="mt-3 w-full text-sm">
                <tbody>
                  {issued.map((a) => (
                    <tr key={a.login} className="border-t border-success/20">
                      <td className="py-1.5 pr-3">{a.name}</td>
                      <td className="py-1.5 pr-3 font-mono">{a.login}</td>
                      <td className="py-1.5 font-mono">{a.password}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  );
}
