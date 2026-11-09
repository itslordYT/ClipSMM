'use client';

import { ReactNode } from 'react';
import { MobileHeader } from '@/components/mobile-header';
import { Toaster } from 'sonner';
import { useAutoSync } from '@/hooks/use-auto-sync';

export function AppShell({ children }: { children: ReactNode }) {
  useAutoSync();

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <MobileHeader />
      <main className="flex-1 overflow-x-hidden overflow-y-auto p-3 sm:p-4">
        <div className="mx-auto w-full max-w-md">
          {children}
        </div>
      </main>
      <Toaster richColors position="top-center" />
    </div>
  );
}
