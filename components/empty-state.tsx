'use client';

import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';

export function EmptyState({
  icon: Icon,
  title,
  description,
  badge,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <Card className="flex flex-col items-center justify-center gap-3 border-dashed border-slate-300 bg-slate-50/50 px-4 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
        <Icon className="h-6 w-6 text-slate-400" />
      </div>
      <h3 className="text-base font-semibold text-slate-700">{title}</h3>
      <p className="max-w-xs text-sm text-slate-500">{description}</p>
      {badge && (
        <span className="mt-1 rounded-full bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-700">
          {badge}
        </span>
      )}
    </Card>
  );
}
