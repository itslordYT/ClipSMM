'use client';

import { useEffect, useState } from 'react';
import {
  Heart,
  CalendarClock,
  Wallet,
  Server,
  TrendingDown,
  Loader2,
  Activity,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/format';

type SummaryData = {
  activeOrders: number;
  upcomingRuns: number;
  ledgerBalance: number;
  providerBalances: number;
  todayApiSpend: number;
  monthApiSpend: number;
};

export function DashboardSummaryCards() {
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    (async () => {
      const [
        { count: activeOrders },
        { count: upcomingRuns },
        { data: walletTxns },
        { data: providers },
        { data: todayExpenses },
        { data: monthExpenses },
      ] = await Promise.all([
        supabase.from('campaigns').select('*', { count: 'exact', head: true }).in('status', ['PROCESSING', 'SCHEDULED']),
        supabase.from('campaign_runs').select('*', { count: 'exact', head: true }).eq('status', 'PLANNED').gte('planned_at', new Date().toISOString()),
        supabase.from('wallet_transactions').select('type, amount_paise'),
        supabase.from('providers').select('balance_paise'),
        supabase.from('expenses').select('amount_paise').eq('source', 'api').eq('expense_date', new Date().toISOString().slice(0, 10)),
        supabase.from('expenses').select('amount_paise').eq('source', 'api').gte('expense_date', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)),
      ]);

      const ledgerBalance = (walletTxns ?? []).reduce((sum, t) => {
        return sum + (t.type === 'credit' || t.type === 'refund' || t.type === 'adjustment' ? t.amount_paise : -t.amount_paise);
      }, 0);

      const providerBalances = (providers ?? []).reduce((sum, p) => sum + Number(p.balance_paise), 0);
      const todayApiSpend = (todayExpenses ?? []).reduce((s, e) => s + e.amount_paise, 0);
      const monthApiSpend = (monthExpenses ?? []).reduce((s, e) => s + e.amount_paise, 0);

      setData({
        activeOrders: activeOrders ?? 0,
        upcomingRuns: upcomingRuns ?? 0,
        ledgerBalance,
        providerBalances,
        todayApiSpend,
        monthApiSpend,
      });
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
      </div>
    );
  }

  const d = data!;

  const cards = [
    { label: 'Active Orders', value: String(d.activeOrders), icon: Heart, gradient: 'from-cyan-500 to-blue-600', iconBg: 'bg-cyan-50', accent: 'text-cyan-600' },
    { label: 'Upcoming Runs', value: String(d.upcomingRuns), icon: CalendarClock, gradient: 'from-blue-500 to-indigo-600', iconBg: 'bg-blue-50', accent: 'text-blue-600' },
    { label: 'Ledger Balance', value: formatCurrency(d.ledgerBalance), icon: Wallet, gradient: 'from-emerald-500 to-teal-600', iconBg: 'bg-emerald-50', accent: 'text-emerald-600' },
    { label: 'Provider Balances', value: formatCurrency(d.providerBalances), icon: Server, gradient: 'from-teal-500 to-cyan-600', iconBg: 'bg-teal-50', accent: 'text-teal-600' },
    { label: "Today's API Spend", value: formatCurrency(d.todayApiSpend), icon: TrendingDown, gradient: 'from-orange-500 to-amber-600', iconBg: 'bg-orange-50', accent: 'text-orange-600' },
    { label: "Month API Spend", value: formatCurrency(d.monthApiSpend), icon: Activity, gradient: 'from-rose-500 to-red-600', iconBg: 'bg-rose-50', accent: 'text-rose-600' },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {cards.map((card) => (
        <Card
          key={card.label}
          className="group relative overflow-hidden border-slate-200/80 bg-white p-3.5 shadow-sm shadow-slate-200/40 transition-all duration-200 hover:shadow-md hover:shadow-slate-200/60"
        >
          <div className="flex items-center gap-2">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${card.iconBg} transition-transform duration-200 group-hover:scale-110`}>
              <card.icon className={`h-4.5 w-4.5 ${card.accent}`} />
            </div>
          </div>
          <p className="mt-2.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">{card.label}</p>
          <p className="mt-0.5 truncate text-lg font-bold tracking-tight text-slate-900">{card.value}</p>
        </Card>
      ))}
    </div>
  );
}
