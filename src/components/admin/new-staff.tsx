'use client';

import { UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import { createStaffAction } from '@/server/admin-actions';

export function NewStaffButton() {
  const t = useTranslations('admin.users');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<{ id: string; password: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <Button onClick={() => (setOpen(true), setCreated(null))}>
        <UserPlus />
        {t('newStaff')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={t('newStaff')}>
          {created ? (
            <div className="space-y-4">
              <p className="rounded-lg bg-success-soft p-3 font-medium text-success">{t('created', { password: created.password })}</p>
              <Button className="w-full" onClick={() => router.push(`/admin/users/${created.id}`)}>
                {t('addRole')}
              </Button>
            </div>
          ) : (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                start(async () => {
                  const res = await createStaffAction({
                    login: String(fd.get('login')),
                    lastName: String(fd.get('lastName')),
                    firstName: String(fd.get('firstName')),
                    middleName: String(fd.get('middleName') ?? ''),
                    email: String(fd.get('email') ?? ''),
                  });
                  if ('error' in res) toast.error(res.error === 'loginTaken' ? t('loginTaken') : 'Error');
                  else {
                    setCreated({ id: res.id!, password: res.password! });
                    router.refresh();
                  }
                });
              }}
            >
              <Field label={t('login')} hint="a-z 0-9 . _ -">
                <Input name="login" required pattern="[a-zA-Z0-9._-]{3,40}" autoCapitalize="none" />
              </Field>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label={t('lastName')}>
                  <Input name="lastName" required />
                </Field>
                <Field label={t('firstName')}>
                  <Input name="firstName" required />
                </Field>
                <Field label={t('middleName')}>
                  <Input name="middleName" />
                </Field>
              </div>
              <Field label={t('email')}>
                <Input name="email" type="email" />
              </Field>
              <Button type="submit" className="w-full" disabled={pending}>
                {t('newStaff')}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
