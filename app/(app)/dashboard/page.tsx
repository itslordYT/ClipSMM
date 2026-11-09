'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { DashboardSummaryCards } from '@/components/dashboard-summary-cards';
import { EmptyState } from '@/components/empty-state';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Heart, CalendarClock, Activity, PlusCircle, ArrowRight, TrendingUp } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatDateTime } from '@/lib/format';
import { STATUS_COLORS, type Campaign, type CampaignRun, type ActivityLog, type CampaignStatus } from '@/lib/types';

export default function DashboardPage() {
  const [orders, setOrders] = useState<Campaign[]>([]);
  const [runs, setRuns] = useState<(CampaignRun & { campaign_name: string })[]>([]);
  const [activity, setActivity] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    (async () => {
      const [
        { data: orderData },
        { data: runData },
        { data: activityData },
      ] = await Promise.all([
        supabase.from('campaigns').select('*').order('created_at', { ascending: false }).limit(5),
        supabase
          .from('campaign_runs')
          .select('*, campaigns(name)')
          .eq('status', 'PLANNED')
          .order('planned_at', { ascending: true })
          .limit(5),
        supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(6),
      ]);

      setOrders((orderData as Campaign[]) ?? []);
      setRuns(
        (runData ?? []).map((r: Record<string, unknown>) => ({
          ...r,
          campaign_name: (r.campaigns as Record<string, unknown>)?.name as string ?? '—',
        })) as (CampaignRun & { campaign_name: string })[],
      );
      setActivity((activityData as ActivityLog[]) ?? []);
      setLoading(false);
    })();
  }, []);

  return (
    <>
      <PageHeader title="Dashboard" description="Overview of your engagement orders and finances">
        <Link href="/new-order">
          <Button className="w-full h-11 bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500 hover:shadow-lg hover:shadow-cyan-500/20 transition-all">
            <PlusCircle className="mr-2 h-4 w-4" />
            New Organic Order
          </Button>
        </Link>
      </PageHeader>

      <DashboardSummaryCards />

      <div className="mt-6 space-y-6">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              <Heart className="h-4 w-4 text-cyan-500" />
              Active Orders
            </h2>
            <Link href="/engagement-orders" className="text-xs font-medium text-cyan-600 hover:text-cyan-700">
              View all →
            </Link>
          </div>
          {loading ? (
            <Card className="border-slate-200/80 p-4 text-sm text-slate-400">Loading...</Card>
          ) : orders.length === 0 ? (
            <EmptyState
              icon={Heart}
              title="No orders yet"
              description="Create your first organic engagement order to get started."
            />
          ) : (
            <div className="space-y-2">
              {orders.map((o) => (
                <Link key={o.id} href="/engagement-orders">
                  <Card className="group flex items-center justify-between border-slate-200/80 p-3.5 shadow-sm shadow-slate-200/40 transition-all duration-200 hover:shadow-md hover:shadow-slate-200/60 hover:border-cyan-200">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-slate-800">{o.name}</p>
                      <p className="truncate text-xs text-slate-500 mt-0.5">{o.platform}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge className={STATUS_COLORS[o.status as CampaignStatus]} variant="outline">{o.status}</Badge>
                      <ArrowRight className="h-4 w-4 text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-cyan-500" />
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              <CalendarClock className="h-4 w-4 text-blue-500" />
              Upcoming Runs
            </h2>
          </div>
          {loading ? (
            <Card className="border-slate-200/80 p-4 text-sm text-slate-400">Loading...</Card>
          ) : runs.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="No scheduled runs"
              description="Planned runs will appear here once you schedule an order."
            />
          ) : (
            <div className="space-y-2">
              {runs.map((r) => (
                <Card key={r.id} className="flex items-center justify-between border-slate-200/80 p-3.5 shadow-sm shadow-slate-200/40">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-800">{r.campaign_name}</p>
                    <p className="truncate text-xs text-slate-500 mt-0.5">Run #{r.run_number} · {formatDateTime(r.planned_at)}</p>
                  </div>
                  <Badge variant="outline" className="shrink-0 bg-blue-50 text-blue-700 border-blue-200">{r.status}</Badge>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              <Activity className="h-4 w-4 text-emerald-500" />
              Recent Activity
            </h2>
          </div>
          {loading ? (
            <Card className="border-slate-200/80 p-4 text-sm text-slate-400">Loading...</Card>
          ) : activity.length === 0 ? (
            <Card className="border-slate-200/80 p-4 text-sm text-slate-400">No activity yet.</Card>
          ) : (
            <Card className="border-slate-200/80 p-3.5 shadow-sm shadow-slate-200/40">
              <div className="space-y-2">
                {activity.map((a) => (
                  <div key={a.id} className="flex items-start justify-between gap-2 border-b border-slate-100 py-2 last:border-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-700 capitalize">{a.action.replace(/_/g, ' ')}</p>
                      {a.detail && <p className="truncate text-xs text-slate-500 mt-0.5">{a.detail}</p>}
                    </div>
                    <span className="shrink-0 text-xs text-slate-400">{formatDateTime(a.created_at)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
