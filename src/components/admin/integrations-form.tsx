'use client';

import { CheckCircle2, PlugZap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { saveBunnySettingsAction, testBunnyAction } from '@/server/admin-actions';

export function BunnyForm({ initial, hasKey, hasToken, webhookUrl }: { initial: { libraryId: string; cdnHost: string }; hasKey: boolean; hasToken: boolean; webhookUrl: string }) {
  const t = useTranslations('admin.integrations');
  const tc = useTranslations('common');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          await saveBunnySettingsAction({
            libraryId: String(fd.get('libraryId') ?? ''),
            apiKey: String(fd.get('apiKey') ?? ''),
            cdnHost: String(fd.get('cdnHost') ?? ''),
            tokenKey: String(fd.get('tokenKey') ?? ''),
          });
          toast.success(tc('saved'));
          router.refresh();
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('libraryId')}>
          <Input name="libraryId" defaultValue={initial.libraryId} inputMode="numeric" />
        </Field>
        <Field label={t('cdnHost')}>
          <Input name="cdnHost" defaultValue={initial.cdnHost} placeholder="vz-xxxxxxxx-xxx.b-cdn.net" />
        </Field>
        <Field label={t('apiKey')} hint={hasKey ? t('keepSecret') : undefined}>
          <Input name="apiKey" type="password" placeholder={hasKey ? '••••••••' : ''} autoComplete="off" />
        </Field>
        <Field label={t('tokenKey')} hint={hasToken ? t('keepSecret') : undefined}>
          <Input name="tokenKey" type="password" placeholder={hasToken ? '••••••••' : ''} autoComplete="off" />
        </Field>
      </div>
      <Field label={t('webhook')}>
        <Input value={webhookUrl} readOnly onFocus={(e) => e.currentTarget.select()} />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          {tc('save')}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await testBunnyAction();
              setResult(r.ok ? t('testOk', { n: r.count ?? 0 }) : t('testFail', { message: r.message ?? '' }));
            })
          }
        >
          <PlugZap />
          {t('test')}
        </Button>
        {result && (
          <span className="inline-flex items-center gap-1 text-sm">
            <CheckCircle2 className="size-4" />
            {result}
          </span>
        )}
      </div>
    </form>
  );
}
