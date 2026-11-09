'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Scissors, Menu, X } from 'lucide-react';
import { navItems } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

export function MobileHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const currentPage = navItems.find((item) =>
    item.href === '/dashboard'
      ? pathname === '/dashboard'
      : pathname.startsWith(item.href)
  );

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-lg">
      <div className="flex items-center justify-between px-4 py-3">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-sm shadow-cyan-500/25">
            <Scissors className="h-4.5 w-4.5 text-white" />
          </div>
          <span className="truncate text-base font-bold tracking-tight text-slate-900">ClipSMM</span>
        </Link>

        <div className="flex items-center gap-2">
          <span className="max-w-[120px] truncate text-sm font-medium text-slate-400 sm:max-w-[180px]">
            {currentPage?.label ?? 'Dashboard'}
          </span>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button className="shrink-0 rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900">
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 border-slate-200 p-0" >
              <SheetHeader className="border-b border-slate-100 px-5 py-5">
                <SheetTitle className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-sm shadow-cyan-500/25">
                    <Scissors className="h-5 w-5 text-white" />
                  </div>
                  <span className="text-lg font-bold tracking-tight text-slate-900">ClipSMM</span>
                </SheetTitle>
              </SheetHeader>
              <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
                {navItems.map((item) => {
                  const isActive =
                    item.href === '/dashboard'
                      ? pathname === '/dashboard'
                      : pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                        isActive
                          ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-sm shadow-cyan-500/25'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
              <div className="border-t border-slate-100 px-5 py-4">
                <p className="text-xs text-slate-400">ClipSMM v1.0</p>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
