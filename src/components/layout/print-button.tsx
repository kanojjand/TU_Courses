'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

export function PrintButton({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Button variant="outline" size="sm" className={className} onClick={() => window.print()}>
      {children}
    </Button>
  );
}
