'use client';

import { useEffect, useState, useCallback } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Receipt, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import { EmptyState } from '@/components/empty-state';
import type { ProviderOrder } from '@/lib/types';

type BillRow = {
  id: string;
  order_id: string | null;
  external_order_id: string | null;
  service_name: string | null;
  metric: string | null;
  quantity: number;
  charge_paise: number;
  currency: string;
  status: string;
  provider_name: string | null;
  expense_date: string;
  balance_before_paise: number | null;
  balance_after_paise: number | null;
  remains: number | null;
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-slate-100 text-slate-700 border-slate-200',
  MOCKED: 'bg-amber-50 text-amber-700 border-amber-200',
  PROCESSING: 'bg-blue-50 text-blue-700 border-blue-200',
  COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  FAILED: 'bg-rose-50 text-rose-700 border-rose-200',
  CANCELLED: 'bg-slate-100 text-slate-500 border-slate-200',
};

export default function ProviderBillsPage() {
  const [bills, setBills] = useState<BillRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = createClient();

    const { data: providerOrders, error } = await supabase
      .from('provider_orders')
      .select(`
        id,
        external_order_id,
        quantity,
        charge_paise,
        currency,
        status,
        delivered_quantity,
        provider_id,
        service_id,
        campaign_id,
        created_at,
        providers!inner(name),
        provider_services!inner(name, metric)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      const { data: fallback } = await supabase
        .from('provider_orders')
        .select('*')
        .order('created_at', { ascending: false });
      setBills(
        (fallback ?? []).map((p: Record<string, unknown>) => ({
          id: p.id as string,
          order_id: p.campaign_id as string | null,
          external_order_id: p.external_order_id as string | null,
          service_name: null,
          metric: null,
          quantity: p.quantity as number,
          charge_paise: p.charge_paise as number,
          currency: (p.currency as string) ?? 'INR',
          status: p.status as string,
          provider_name: null,
          expense_date: p.created_at as string,
          balance_before_paise: null,
          balance_after_paise: null,
          remains: (p.delivered_quantity as number) ?? null,
        })) as BillRow[],
      );
      setLoading(false);
      return;
    }

    const providerIds = Array.from(new Set((providerOrders ?? [])
      .map((p: Record<string, unknown>) => p.provider_id as string | null)
      .filter((v): v is string => v !== null)));

    let snapshotsMap: Record<string, { before: number | null; after: number | null }> = {};
    if (providerIds.length > 0) {
      const { data: snapshots } = await supabase
        .from('provider_balance_snapshots')
        .select('*')
        .in('provider_id', providerIds)
        .order('captured_at', { ascending: false });
      // Just grab latest per provider
      for (const s of snapshots ?? []) {
        const pid = (s as Record<string, unknown>).provider_id as string;
        if (!snapshotsMap[pid]) {
          snapshotsMap[pid] = { before: null, after: (s as Record<string, unknown>).balance_paise as number };
        }
      }
    }

    setBills(
      (providerOrders ?? []).map((p: Record<string, unknown>) => {
        const providerData = p.providers as Record<string, unknown> | null;
        const serviceData = p.provider_services as Record<string, unknown> | null;
        const pid = p.provider_id as string | null;
        return {
          id: p.id as string,
          order_id: p.campaign_id as string | null,
          external_order_id: p.external_order_id as string | null,
          service_name: serviceData?.name as string | null,
          metric: serviceData?.metric as string | null,
          quantity: p.quantity as number,
          charge_paise: p.charge_paise as number,
          currency: (p.currency as string) ?? 'INR',
          status: p.status as string,
          provider_name: providerData?.name as string | null,
          expense_date: p.created_at as string,
          balance_before_paise: pid ? snapshotsMap[pid]?.before ?? null : null,
          balance_after_paise: pid ? snapshotsMap[pid]?.after ?? null : null,
          remains: (p.delivered_quantity as number) ?? null,
        };
      }) as BillRow[],
    );
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalBills = bills.reduce((s, b) => s + b.charge_paise, 0);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  }

  return (
    <>
      <PageHeader title="Provider API Bills" description="Track provider order charges, balances and status" />

      <Card className="mb-4 border-slate-200 p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50"><Receipt className="h-4 w-4 text-orange-600" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-slate-500">Total Charges</p>
            <p className="truncate text-xl font-bold text-slate-900">{formatCurrency(totalBills)}</p>
          </div>
        </div>
      </Card>

      {bills.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No API bills yet"
          description="Provider order charges will appear here when runs are submitted."
        />
      ) : (
        <div className="space-y-2">
          {bills.map((b) => (
            <Card key={b.id} className="border-slate-200 p-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className={`shrink-0 text-[10px] ${STATUS_COLORS[b.status] ?? 'bg-slate-100 text-slate-700 border-slate-200'}`}>{b.status}</Badge>
                    <span className="truncate text-xs font-medium text-slate-500">{b.currency}</span>
                  </div>
                  <p className="mt-1.5 truncate text-sm font-medium text-slate-700">{b.service_name ?? 'Unknown service'}</p>
                  <p className="truncate text-xs text-slate-500">{b.provider_name ?? '—'} · {formatDate(b.expense_date)}</p>
                </div>
                <span className="shrink-0 text-sm font-bold text-rose-600">{formatCurrency(b.charge_paise)}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs">
                <span className="text-slate-500">Qty: <span className="font-medium text-slate-700">{formatNumber(b.quantity)}</span></span>
                {b.remains !== null && (
                  <span className="text-slate-500">Remains: <span className="font-medium text-amber-600">{formatNumber(b.remains)}</span></span>
                )}
                {b.balance_after_paise !== null && (
                  <span className="text-slate-500">Bal after: <span className="font-medium text-slate-700">{formatCurrency(b.balance_after_paise)}</span></span>
                )}
                {b.external_order_id && (
                  <span className="col-span-2 truncate text-slate-500">Order ID: <span className="font-mono text-[10px] text-slate-600">{b.external_order_id}</span></span>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
