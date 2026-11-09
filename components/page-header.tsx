import { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-bold tracking-tight text-slate-900">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        )}
      </div>
      {children && (
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
          {children}
        </div>
      )}
    </div>
  );
}
