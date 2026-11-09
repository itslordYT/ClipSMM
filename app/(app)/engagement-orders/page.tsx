'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Heart,
  Search,
  Loader2,
  Trash2,
  ExternalLink,
  PlusCircle,
  Pause,
  Play,
  XCircle,
  RefreshCw,
  AlertCircle,
  ChevronDown,
  CheckCircle2,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { formatCurrency, formatDate, formatDateTime, formatNumber } from '@/lib/format';
import {
  CAMPAIGN_STATUSES,
  STATUS_COLORS,
  RUN_ITEM_STATUS_COLORS,
  type Campaign,
  type CampaignStatus,
  type CampaignMetric,
  type CampaignRunItem,
  type MetricKey,
  type RunItemStatus,
  type Provider,
  type ProviderService,
} from '@/lib/types';
import { METRIC_LABELS, METRIC_PRIORITY } from '@/lib/types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { EmptyState } from '@/components/empty-state';
import { submitRunToProvider, recordProviderOrder } from '@/lib/submit-order';

type OrderDetail = Campaign & {
  provider_name: string | null;
  provider: Pick<Provider, 'id' | 'name' | 'kind' | 'currency' | 'balance_paise'> | null;
  metrics: (CampaignMetric & { run_items: CampaignRunItem[] })[];
};

export default function EngagementOrdersPage() {
  const [orders, setOrders] = useState<OrderDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [submittingOrder, setSubmittingOrder] = useState<string | null>(null);
  const [approvingOrder, setApprovingOrder] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<OrderDetail | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [visibleRuns, setVisibleRuns] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('campaigns')
      .select('*, providers(id, name, kind, currency, balance_paise)')
      .order('created_at', { ascending: false });

    if (error) { toast.error('Failed to load orders'); setLoading(false); return; }

    const orderIds = (data ?? []).map((c: Record<string, unknown>) => c.id as string);
    if (orderIds.length === 0) { setOrders([]); setLoading(false); return; }

    const { data: metricsData } = await supabase
      .from('campaign_metrics')
      .select('*')
      .in('campaign_id', orderIds);

    const metricIds = (metricsData ?? []).map((m: CampaignMetric) => m.id);
    let itemsMap: Record<string, CampaignRunItem[]> = {};
    if (metricIds.length > 0) {
      const { data: itemsData } = await supabase
        .from('campaign_run_items')
        .select('*')
        .in('campaign_metric_id', metricIds)
        .order('run_number', { ascending: true });
      itemsMap = (itemsData ?? []).reduce((acc: Record<string, CampaignRunItem[]>, item: CampaignRunItem) => {
        if (!acc[item.campaign_metric_id]) acc[item.campaign_metric_id] = [];
        acc[item.campaign_metric_id].push(item);
        return acc;
      }, {});
    }

    setOrders(
      (data ?? []).map((c: Record<string, unknown>) => {
        const orderMetrics = (metricsData ?? [])
          .filter((m: CampaignMetric) => m.campaign_id === c.id)
          .map((m: CampaignMetric) => ({
            ...m,
            run_items: itemsMap[m.id] ?? [],
          }));
        return {
          ...c,
          provider_name: (c.providers as Record<string, unknown>)?.name as string ?? null,
          provider: (c.providers as Pick<Provider, 'id' | 'name' | 'kind' | 'currency' | 'balance_paise'> | null) ?? null,
          metrics: orderMetrics,
        };
      }) as OrderDetail[],
    );
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadMoreRuns = (metricId: string) => {
    setVisibleRuns((prev) => ({ ...prev, [metricId]: (prev[metricId] ?? 12) + 12 }));
  };

  const deleteOrder = async (id: string) => {
    setDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.from('campaigns').delete().eq('id', id);
    setDeleting(false);
    if (error) { toast.error('Failed to delete order'); return; }
    setPendingDelete(null);
    setOrders((prev) => prev.filter((o) => o.id !== id));
    setExpandedId((current) => (current === id ? null : current));
    toast.success('Order deleted');
  };

  const updateRunItemStatus = async (itemId: string, newStatus: RunItemStatus) => {
    const supabase = createClient();
    const updates: Record<string, unknown> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };
    if (newStatus === 'CANCELLED' || newStatus === 'PAUSED') {
      updates.editable = false;
    } else if (newStatus === 'SCHEDULED') {
      updates.editable = true;
    }

    const { error } = await supabase.from('campaign_run_items').update(updates).eq('id', itemId);
    if (error) { toast.error('Failed to update run'); return; }
    toast.success(`Run ${newStatus.toLowerCase()}`);
    load();
  };

  const submitScheduledRun = async (order: OrderDetail, metric: CampaignMetric, ri: CampaignRunItem) => {
    if (ri.status !== 'SCHEDULED' && ri.status !== 'WAITING' && ri.status !== 'FAILED') {
      toast.info('This run is not waiting for submission');
      return;
    }
    if (!order.provider || !metric.service_id) {
      toast.error('This order has no provider or service configured');
      return;
    }

    const supabase = createClient();
    const { data: claimedRun, error: claimError } = await supabase
      .from('campaign_run_items')
      .update({ status: 'PROCESSING', updated_at: new Date().toISOString() })
      .eq('id', ri.id)
      .in('status', ['SCHEDULED', 'WAITING', 'FAILED'])
      .is('provider_order_id', null)
      .select()
      .maybeSingle();

    if (claimError || !claimedRun) {
      toast.info('This run is already being submitted or has already been sent');
      load();
      return;
    }

    const [{ data: service }, { data: freshCampaign }] = await Promise.all([
      supabase.from('provider_services').select('*').eq('id', metric.service_id).maybeSingle(),
      supabase.from('campaigns').select('post_url').eq('id', order.id).maybeSingle(),
    ]);
    const targetLink = metric.target_link || freshCampaign?.post_url?.split(' | ')[0] || '';

    if (!service || !targetLink) {
      await supabase.from('campaign_run_items').update({ status: 'FAILED', error_message: 'Target link or service is missing', updated_at: new Date().toISOString() }).eq('id', ri.id);
      toast.error('Target link or service is missing');
      load();
      return;
    }

    const result = await submitRunToProvider({
      provider: order.provider as Provider,
      service: service as ProviderService,
      link: targetLink,
      quantity: ri.planned_quantity,
    });

    if (!result.success || !result.externalOrderId) {
      await supabase.from('campaign_run_items').update({ status: 'FAILED', error_message: result.error ?? 'Provider rejected the order', updated_at: new Date().toISOString() }).eq('id', ri.id);
      await supabase.from('campaigns').update({ status: 'FAILED', updated_at: new Date().toISOString() }).eq('id', order.id);
      toast.error(result.error ?? 'Provider rejected the order');
      load();
      return;
    }

    const chargePaise = result.charge ?? ri.charge_paise;
    await supabase.from('campaign_run_items').update({
      status: 'SUBMITTED',
      provider_order_id: result.externalOrderId,
      charge_paise: chargePaise,
      currency: result.currency ?? order.provider.currency,
      start_count: result.startCount,
      submitted_at: new Date().toISOString(),
      editable: false,
      error_message: null,
      updated_at: new Date().toISOString(),
    }).eq('id', ri.id);

    await recordProviderOrder({
      campaignId: order.id,
      metricId: metric.id,
      runItemId: ri.id,
      providerId: order.provider.id,
      serviceId: service.id,
      externalOrderId: result.externalOrderId,
      quantity: ri.planned_quantity,
      chargePaise,
      currency: result.currency ?? order.provider.currency,
      startCount: result.startCount,
      responseData: { order: result.externalOrderId, charge: result.charge },
      balanceBefore: Number(order.provider.balance_paise),
      balanceAfter: null,
    });

    await supabase.from('campaigns').update({ status: 'PROCESSING', updated_at: new Date().toISOString() }).eq('id', order.id);
    toast.success(`Submitted to ${order.provider.name}. Provider order: ${result.externalOrderId}`);
    load();
  };

  const retryRun = async (order: OrderDetail, metric: CampaignMetric, ri: CampaignRunItem) => {
    if (ri.status !== 'FAILED') {
      toast.info('Only failed runs can be retried');
      return;
    }
    setRefreshing(ri.id);
    const supabase = createClient();
    const { error: resetError } = await supabase.from('campaign_run_items').update({
      status: 'WAITING',
      error_message: null,
      provider_order_id: null,
      updated_at: new Date().toISOString(),
    }).eq('id', ri.id).eq('status', 'FAILED');

    if (resetError) {
      toast.error('Failed to reset run for retry');
      setRefreshing(null);
      return;
    }

    setRefreshing(null);
    await submitScheduledRun(order, metric, { ...ri, status: 'WAITING', provider_order_id: null });
  };

  const submitAllPendingRuns = async (order: OrderDetail) => {
    if (submittingOrder) return;
    const now = Date.now();

    const pending = order.metrics
      .flatMap((metric) =>
        metric.run_items
          .filter((run) => (run.status === 'SCHEDULED' || run.status === 'WAITING' || run.status === 'FAILED') && !run.provider_order_id)
          .map((run) => ({ metric, run })),
      )
      .filter((item) => new Date(item.run.planned_at).getTime() <= now)
      .sort((a, b) => {
        const pri = (METRIC_PRIORITY[a.metric.metric as MetricKey] ?? 99) - (METRIC_PRIORITY[b.metric.metric as MetricKey] ?? 99);
        if (pri !== 0) return pri;
        return new Date(a.run.planned_at).getTime() - new Date(b.run.planned_at).getTime();
      });

    const futureCount = order.metrics
      .flatMap((metric) =>
        metric.run_items.filter((run) =>
          (run.status === 'SCHEDULED' || run.status === 'WAITING') && !run.provider_order_id
          && new Date(run.planned_at).getTime() > now,
        ),
      ).length;

    if (pending.length === 0) {
      if (futureCount > 0) {
        toast.info(`${futureCount} run${futureCount === 1 ? '' : 's'} are still waiting for their scheduled time`);
      } else {
        toast.info('All runs in this order have already been submitted');
      }
      return;
    }

    setSubmittingOrder(order.id);
    let submitted = 0;
    for (const { metric, run } of pending) {
      await submitScheduledRun(order, metric, run);
      submitted += 1;
    }
    setSubmittingOrder(null);
    if (futureCount > 0) {
      toast.success(`Submitted ${submitted} run${submitted === 1 ? '' : 's'}. ${futureCount} run${futureCount === 1 ? '' : 's'} still waiting for their scheduled time.`);
    } else {
      toast.success(`Finished submitting ${submitted} pending run${submitted === 1 ? '' : 's'}`);
    }
    load();
  };

  const refreshRunStatus = async (ri: CampaignRunItem, metric: CampaignMetric) => {
    if (!ri.provider_order_id) { toast.error('No provider order to refresh'); return; }
    setRefreshing(ri.id);
    const supabase = createClient();

    const service = metric.service_id;
    const { data: svcRow } = await supabase
      .from('provider_services')
      .select('*, providers!inner(id, slug, kind, api_url)')
      .eq('id', service)
      .maybeSingle();

    const providerRow = (svcRow as Record<string, unknown>)?.providers as Record<string, unknown> | undefined;
    if (providerRow?.kind !== 'external') {
      toast.info('Mock provider — status is managed automatically');
      setRefreshing(null);
      return;
    }

    const providerId = String(providerRow.id);

    try {
      const apiUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/cheapestsmm-proxy`;
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ action: 'status', provider_id: providerId, order: ri.provider_order_id }),
      });
      if (!res.ok) { toast.error('Failed to fetch status from provider'); setRefreshing(null); return; }
      const data = await res.json();
      if (data.error) { toast.error(data.error); setRefreshing(null); return; }
      const status = String(data.status ?? '').toLowerCase();
      const startCount = parseInt(String(data.start_count ?? '0'), 10);
      const remains = parseInt(String(data.remains ?? '0'), 10);
      const orderQty = parseInt(String(data.quantity ?? String(ri.planned_quantity)), 10);
      const delivered = isNaN(startCount) || isNaN(remains) ? ri.delivered_quantity : Math.max(0, startCount + (orderQty - remains));

      let newStatus: RunItemStatus = ri.status;
      if (status === 'completed') newStatus = 'COMPLETED';
      else if (status === 'processing' || status === 'partial') newStatus = 'PROCESSING';
      else if (status === 'cancelled') newStatus = 'CANCELLED';
      else if (status === 'error' || status === 'failed') newStatus = 'FAILED';

      await supabase.from('campaign_run_items').update({
        status: newStatus,
        delivered_quantity: delivered,
        remaining_quantity: isNaN(remains) ? ri.remaining_quantity : remains,
        updated_at: new Date().toISOString(),
      }).eq('id', ri.id);

      toast.success('Status refreshed');
      load();
    } catch {
      toast.error('Failed to refresh status');
    }
    setRefreshing(null);
  };

  const filtered = orders.filter((o) => {
    const matchSearch = !search || o.name.toLowerCase().includes(search.toLowerCase()) || o.platform.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const orderSections = [
    {
      key: 'new',
      title: 'New Submissions',
      hint: 'Awaiting approval',
      accent: 'text-amber-600',
      orders: filtered.filter((o) => !o.approved_at),
    },
    {
      key: 'approved',
      title: 'Approved Submissions',
      hint: 'Approved and delivering',
      accent: 'text-emerald-600',
      orders: filtered.filter((o) => !!o.approved_at),
    },
  ];

  const approveOrder = async (orderId: string) => {
    setApprovingOrder(orderId);
    const supabase = createClient();
    const approvedAt = new Date().toISOString();
    const { error } = await supabase
      .from('campaigns')
      .update({ approved_at: approvedAt, updated_at: approvedAt })
      .eq('id', orderId)
      .is('approved_at', null);
    setApprovingOrder(null);
    if (error) { toast.error('Failed to approve order'); return; }
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, approved_at: approvedAt } : o)));
    toast.success('Order approved');
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  }

  return (
    <>
      <PageHeader title="Engagement Orders" description="View and manage your organic engagement orders">
        <Link href="/new-order">
          <Button className="w-full h-11 bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500 hover:shadow-lg hover:shadow-cyan-500/20 transition-all">
            <PlusCircle className="mr-2 h-4 w-4" />
            New Order
          </Button>
        </Link>
      </PageHeader>

      <div className="mb-4 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Search orders..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-10 border-slate-200 focus:border-cyan-400 focus:ring-cyan-400/20" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full h-10"><SelectValue placeholder="Filter by status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {CAMPAIGN_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Heart}
          title={search || statusFilter !== 'all' ? 'No matching orders' : 'No orders yet'}
          description={search || statusFilter !== 'all' ? 'Try adjusting your search.' : 'Create your first organic engagement order to get started.'}
        />
      ) : (
        <div className="space-y-8">
          {orderSections.map((section) => (
            <section key={section.key} className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className={`text-sm font-semibold ${section.accent}`}>{section.title}</h2>
                <span className="text-xs text-slate-400">{section.hint} · {section.orders.length}</span>
              </div>
              {section.orders.length === 0 && (
                <p className="rounded-xl border border-dashed border-slate-200 bg-white/60 px-4 py-6 text-center text-xs text-slate-400">
                  {section.key === 'new' ? 'No submissions waiting for approval.' : 'No approved submissions yet. Approve an order to move it here.'}
                </p>
              )}
          {section.orders.map((o) => {
            const isExpanded = expandedId === o.id;
            const allRunItems = o.metrics.flatMap((m) => m.run_items);
            const totalRuns = allRunItems.length;
            const completedRuns = allRunItems.filter((ri) => ri.status === 'COMPLETED').length;
            const pendingRuns = allRunItems.filter((ri) => ri.status === 'SCHEDULED' || ri.status === 'WAITING').length;
            const waitingRuns = allRunItems.filter((ri) => ri.status === 'WAITING').length;
            const dueRuns = allRunItems.filter((ri) =>
              (ri.status === 'SCHEDULED' || ri.status === 'WAITING') && !ri.provider_order_id && new Date(ri.planned_at).getTime() <= Date.now(),
            ).length;
            const futureRuns = allRunItems.filter((ri) =>
              (ri.status === 'SCHEDULED' || ri.status === 'WAITING') && !ri.provider_order_id && new Date(ri.planned_at).getTime() > Date.now(),
            ).length;
            const processingRuns = allRunItems.filter((ri) => ri.status === 'SUBMITTED' || ri.status === 'PROCESSING').length;
            const nextRun = allRunItems
              .filter((ri) => ri.status === 'SCHEDULED' || ri.status === 'WAITING')
              .sort((a, b) => new Date(a.planned_at).getTime() - new Date(b.planned_at).getTime())[0];
            const totalQty = o.metrics.reduce((s, m) => s + m.quantity, 0);
            const totalEstCost = o.metrics.reduce((s, m) => s + m.estimated_cost_paise, 0);
            const totalActualCost = o.metrics.reduce((s, m) =>
              s + m.run_items.reduce((rs, ri) => rs + ri.charge_paise, 0), 0);

            return (
              <Card key={o.id} className="border-slate-200/80 p-3.5 shadow-sm shadow-slate-200/50 hover:shadow-md hover:shadow-slate-200/60 transition-shadow">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : o.id)}
                  className="flex w-full items-center justify-between gap-2 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-800">{o.name}</p>
                    <p className="truncate text-xs text-slate-500 mt-0.5">{o.platform} · {o.provider_name ?? 'No provider'}</p>
                  </div>
                  <Badge className={`shrink-0 ${STATUS_COLORS[o.status as CampaignStatus]}`} variant="outline">{o.status}</Badge>
                </button>

                <div className="mt-2.5 flex items-center justify-between text-xs text-slate-500">
                  <span className="font-medium">{formatNumber(totalQty)} units</span>
                  <span>Est: {formatCurrency(totalEstCost)}</span>
                </div>

                <div className="mt-2.5 flex items-center gap-2">
                  {!o.approved_at && (
                    <Button
                      size="sm"
                      className="flex-1 h-9 bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-400 hover:to-teal-500 hover:shadow-md hover:shadow-emerald-500/20 transition-all"
                      disabled={approvingOrder === o.id}
                      onClick={() => approveOrder(o.id)}
                    >
                      {approvingOrder === o.id ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-2 h-3.5 w-3.5" />}
                      Approve order
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label="Delete order"
                    className={`h-9 border-slate-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 ${o.approved_at ? 'flex-1' : 'w-9 px-0'}`}
                    onClick={() => setPendingDelete(o)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {o.approved_at && <span className="ml-1.5">Delete order</span>}
                  </Button>
                </div>

                {o.post_url && (
                  <a href={o.post_url.split(' | ')[0]} target="_blank" rel="noopener noreferrer" className="mt-1.5 block max-w-full">
                    <span className="inline-flex items-center gap-1 text-xs text-cyan-600 hover:text-cyan-700 max-w-full">
                      <ExternalLink className="h-3 w-3 shrink-0" />
                      <span className="truncate">{o.post_url.split(' | ')[0]}</span>
                    </span>
                  </a>
                )}

                {isExpanded && (
                  <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
                    {/* Overview card */}
                    <div className="rounded-xl bg-gradient-to-br from-slate-50 to-slate-100/50 p-3 space-y-2 border border-slate-200/60">
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-lg bg-white py-1.5">
                          <p className="text-[10px] uppercase tracking-wide text-slate-400">Runs</p>
                          <p className="text-base font-bold text-slate-800">{totalRuns}</p>
                        </div>
                        <div className="rounded-lg bg-white py-1.5">
                          <p className="text-[10px] uppercase tracking-wide text-slate-400">Done</p>
                          <p className="text-base font-bold text-emerald-600">{completedRuns}</p>
                        </div>
                        <div className="rounded-lg bg-white py-1.5">
                          <p className="text-[10px] uppercase tracking-wide text-slate-400">Pending</p>
                          <p className="text-base font-bold text-blue-600">{pendingRuns}</p>
                        </div>
                      </div>
                      {waitingRuns > 0 && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">Waiting</span>
                          <span className="font-medium text-violet-600">{waitingRuns}</span>
                        </div>
                      )}
                      {futureRuns > 0 && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">Scheduled for later</span>
                          <span className="font-medium text-blue-600">{futureRuns}</span>
                        </div>
                      )}
                      {dueRuns > 0 && (
                        <Button
                          size="sm"
                          className="mt-2 w-full h-9 bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500 hover:shadow-md hover:shadow-cyan-500/20 transition-all"
                          disabled={submittingOrder === o.id}
                          onClick={() => submitAllPendingRuns(o)}
                        >
                          {submittingOrder === o.id ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-2 h-3.5 w-3.5" />}
                          {submittingOrder === o.id ? 'Submitting order…' : `Submit ${dueRuns} due run${dueRuns === 1 ? '' : 's'} (priority order)`}
                        </Button>
                      )}
                      {processingRuns > 0 && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">Processing</span>
                          <span className="font-medium text-amber-600">{processingRuns}</span>
                        </div>
                      )}
                      {nextRun && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">Next run</span>
                          <span className="font-medium text-slate-700">{formatDateTime(nextRun.planned_at)}</span>
                        </div>
                      )}
                    </div>

                    {/* Per-metric billing + run history */}
                    {o.metrics.length === 0 ? (
                      <p className="text-xs text-slate-400">No metrics configured</p>
                    ) : (
                      o.metrics.map((m) => {
                        const runItems = m.run_items;
                        const visibleCount = visibleRuns[m.id] ?? 12;
                        const visibleRunItems = runItems.slice(0, visibleCount);
                        const deliveredTotal = runItems.reduce((s, ri) => s + ri.delivered_quantity, 0);
                        const plannedTotal = runItems.reduce((s, ri) => s + ri.planned_quantity, 0);
                        const remainingTotal = m.quantity - deliveredTotal;
                        const actualCost = runItems.reduce((s, ri) => s + ri.charge_paise, 0);
                        const cumTotal = runItems.reduce((s, ri, i) => {
                          return s + (i <= runItems.findIndex((r) => r.id === ri.id) ? ri.planned_quantity : 0);
                        }, 0);

                        return (
                          <div key={m.id} className="rounded-lg border border-slate-200 bg-white p-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-semibold text-slate-800">{METRIC_LABELS[m.metric as MetricKey]}</span>
                              <span className="text-[10px] font-medium text-slate-400">{runItems.length} runs</span>
                            </div>

                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all"
                                style={{ width: `${Math.min(100, m.quantity > 0 ? (deliveredTotal / m.quantity) * 100 : 0)}%` }}
                              />
                            </div>
                            <p className="mt-1 text-[10px] text-slate-400">{m.quantity > 0 ? Math.min(100, Math.round((deliveredTotal / m.quantity) * 100)) : 0}% delivered</p>

                            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                              <div className="rounded bg-slate-50 px-2 py-1.5">
                                <p className="text-slate-400">Est. Charge</p>
                                <p className="font-medium text-slate-700">{formatCurrency(m.estimated_cost_paise)}</p>
                              </div>
                              <div className="rounded bg-slate-50 px-2 py-1.5">
                                <p className="text-slate-400">Actual Charge</p>
                                <p className="font-medium text-slate-700">{formatCurrency(actualCost)}</p>
                              </div>
                            </div>

                            <div className="mt-2 space-y-1 text-xs">
                              <div className="flex items-center justify-between">
                                <span className="text-slate-500">Planned</span>
                                <span className="font-medium text-slate-700">{formatNumber(plannedTotal)}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-slate-500">Delivered</span>
                                <span className="font-medium text-emerald-600">{formatNumber(deliveredTotal)}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-slate-500">Remaining</span>
                                <span className="font-medium text-amber-600">{formatNumber(remainingTotal)}</span>
                              </div>
                            </div>

                            {runItems.length > 0 && (
                              <div className="mt-3 space-y-1.5">
                                <p className="text-xs font-medium text-slate-600">Run History</p>
                                {visibleRunItems.map((ri) => {
                                  const canControl = ri.status === 'SCHEDULED' || ri.status === 'PAUSED';
                                  const isLocked = ri.status === 'SUBMITTED' || ri.status === 'PROCESSING' || ri.status === 'COMPLETED';
                                  const canRefresh = ri.status === 'SUBMITTED' || ri.status === 'PROCESSING';
                                  const isDue = new Date(ri.planned_at).getTime() <= Date.now();
                                  const cumulativeQty = runItems
                                    .filter((r) => r.run_number <= ri.run_number)
                                    .reduce((s, r) => s + r.planned_quantity, 0);
                                  return (
                                    <div key={ri.id} className="rounded border border-slate-100 bg-slate-50 p-2">
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0 flex-1">
                                          <div className="flex items-center gap-1.5">
                                            <span className="text-xs font-medium text-slate-700">Run {ri.run_number}</span>
                                            <Badge variant="outline" className={`shrink-0 text-[10px] ${RUN_ITEM_STATUS_COLORS[ri.status as RunItemStatus]}`}>{ri.status}</Badge>
                                          </div>
                                          <p className="mt-0.5 truncate text-xs text-slate-500">{formatDateTime(ri.planned_at)}</p>
                                        </div>
                                      </div>
                                      <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs">
                                        <span className="text-slate-500">Qty: <span className="font-medium text-slate-700">{formatNumber(ri.planned_quantity)}</span></span>
                                        <span className="text-slate-500">Cumulative: <span className="font-medium text-slate-700">{formatNumber(cumulativeQty)}</span></span>
                                        <span className="text-slate-500">Delivered: <span className="font-medium text-emerald-600">{formatNumber(ri.delivered_quantity)}</span></span>
                                        <span className="text-slate-500">Remains: <span className="font-medium text-amber-600">{formatNumber(ri.remaining_quantity)}</span></span>
                                        <span className="text-slate-500">Charge: <span className="font-medium text-slate-700">{formatCurrency(ri.charge_paise)}</span></span>
                                        {ri.start_count !== null && (
                                          <span className="text-slate-500">Start: <span className="font-medium text-slate-600">{formatNumber(ri.start_count)}</span></span>
                                        )}
                                        {ri.provider_order_id && (
                                          <span className="col-span-2 text-slate-500">Order: <span className="font-mono text-[10px] text-slate-600 break-all">{ri.provider_order_id}</span></span>
                                        )}
                                        {ri.status === 'FAILED' && ri.error_message && (
                                          <span className="col-span-2 flex items-start gap-1 text-rose-600">
                                            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                                            <span className="text-[10px] leading-relaxed">{ri.error_message}</span>
                                          </span>
                                        )}
                                      </div>
                                      <div className="mt-2 flex flex-wrap gap-1.5">
                                        {ri.status === 'FAILED' && (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 px-2 text-xs text-amber-700 hover:text-amber-800 border-amber-200 hover:bg-amber-50"
                                            disabled={refreshing === ri.id}
                                            onClick={() => retryRun(o, m, ri)}
                                          >
                                            {refreshing === ri.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
                                            Retry Run
                                          </Button>
                                        )}
                                        {(ri.status === 'SCHEDULED' || ri.status === 'WAITING') && isDue && (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 px-2 text-xs text-cyan-700 hover:text-cyan-800"
                                            onClick={() => submitScheduledRun(o, m, ri)}
                                          >
                                            <Play className="mr-1 h-3 w-3" /> Submit to Provider
                                          </Button>
                                        )}
                                        {(ri.status === 'SCHEDULED' || ri.status === 'WAITING') && !isDue && (
                                          <span className="text-[10px] text-slate-400">Scheduled for {formatDateTime(ri.planned_at)}</span>
                                        )}
                                        {canControl && (
                                          <>
                                            {ri.status === 'SCHEDULED' && (
                                              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => updateRunItemStatus(ri.id, 'PAUSED')}>
                                                <Pause className="mr-1 h-3 w-3" /> Pause
                                              </Button>
                                            )}
                                            {ri.status === 'PAUSED' && (
                                              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => updateRunItemStatus(ri.id, 'SCHEDULED')}>
                                                <Play className="mr-1 h-3 w-3" /> Resume
                                              </Button>
                                            )}
                                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-rose-600 hover:text-rose-700" onClick={() => updateRunItemStatus(ri.id, 'CANCELLED')}>
                                              <XCircle className="mr-1 h-3 w-3" /> Cancel
                                            </Button>
                                          </>
                                        )}
                                        {canRefresh && (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 px-2 text-xs"
                                            disabled={refreshing === ri.id}
                                            onClick={() => refreshRunStatus(ri, m)}
                                          >
                                            {refreshing === ri.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
                                            Refresh
                                          </Button>
                                        )}
                                        {ri.status === 'PROCESSING' && !ri.provider_order_id && (
                                          <p className="text-[10px] text-amber-600">Submission in progress — refresh before retrying</p>
                                        )}
                                        {isLocked && !canRefresh && ri.status !== 'PROCESSING' && (
                                          <p className="text-[10px] text-slate-400">Locked</p>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                                {visibleCount < runItems.length && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="w-full border-slate-200 text-xs text-slate-600 hover:bg-slate-50"
                                    onClick={() => loadMoreRuns(m.id)}
                                  >
                                    <ChevronDown className="mr-1.5 h-3.5 w-3.5" />
                                    Load next {Math.min(12, runItems.length - visibleCount)} runs
                                    <span className="ml-1 text-slate-400">({runItems.length - visibleCount} remaining)</span>
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}

                    <div className="flex items-center justify-between text-xs text-slate-500 border-t border-slate-100 pt-2.5">
                      <span>Created: {formatDate(o.created_at)}</span>
                      <span className="font-medium">Actual: {formatCurrency(totalActualCost)}</span>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
            </section>
          ))}
        </div>
      )}

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => { if (!open && !deleting) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this order?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{pendingDelete?.name}&rdquo; and its run history will be removed from your list. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-rose-600 text-white hover:bg-rose-500"
              onClick={(e) => { e.preventDefault(); if (pendingDelete) deleteOrder(pendingDelete.id); }}
            >
              {deleting && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Delete order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
