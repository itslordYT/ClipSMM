'use client';

import { useEffect, useState, useCallback, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Loader2,
  Save,
  Zap,
  Calendar,
  Target,
  AlertCircle,
  CheckCircle2,
  Eye,
  Heart,
  MessageCircle,
  Share2,
  Repeat2,
  Bookmark,
  Users,
  Youtube,
  Clock,
  Star,
  Info,
  Instagram,
  Facebook,
  Twitter,
  Music2,
  Send,
  Twitch,
  Globe,
  Film,
} from 'lucide-react';
import { createClient, fetchAllRows } from '@/lib/supabase/client';
import { toast } from 'sonner';
import {
  formatCurrency,
  formatNumber,
  computeEstimatedCost,
  distributeVariedQuantities,
  generateRunTimes,
  fromLocalInputValue,
  toLocalInputValue,
  intervalToMinutes,
  formatIntervalReadable,
  formatProviderRate,
  formatBalanceDisplay,
} from '@/lib/format';
import type { Provider, ProviderService, MetricKey, FavoriteService, IntervalUnit } from '@/lib/types';
import { METRIC_LABELS, METRIC_KEYS, PLATFORMS, INTERVAL_UNITS, INTERVAL_UNIT_LABELS } from '@/lib/types';
import { ServiceDetailsSheet } from '@/components/service-details-sheet';
import { submitRunToProvider, recordProviderOrder } from '@/lib/submit-order';

const METRIC_ICONS: Record<MetricKey, React.ComponentType<{ className?: string }>> = {
  views: Eye,
  likes: Heart,
  comments: MessageCircle,
  shares: Share2,
  reposts: Repeat2,
  saves: Bookmark,
  followers: Users,
  subscribers: Youtube,
};

const POST_URL_METRICS: MetricKey[] = ['views', 'likes', 'comments', 'shares', 'reposts', 'saves'];

const PLATFORM_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'Instagram': Instagram,
  'YouTube': Youtube,
  'TikTok': Music2,
  'Facebook': Facebook,
  'Twitter/X': Twitter,
  'Telegram': Send,
  'Twitch': Twitch,
  'Website': Globe,
  'Other': Film,
};

export default function SingleOrderPage() {
  const router = useRouter();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [services, setServices] = useState<ProviderService[]>([]);
  const [favorites, setFavorites] = useState<FavoriteService[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [detailsService, setDetailsService] = useState<ProviderService | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const [name, setName] = useState('');
  const [platform, setPlatform] = useState('Instagram');
  const [targetUrl, setTargetUrl] = useState('');
  const [providerId, setProviderId] = useState('');
  const [metric, setMetric] = useState<MetricKey>('likes');
  const [serviceId, setServiceId] = useState('');
  const [quantity, setQuantity] = useState('100');
  const [runCount, setRunCount] = useState('3');
  const [intervalValue, setIntervalValue] = useState('2');
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>('hours');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');

  const loadData = useCallback(async () => {
    const supabase = createClient();
    const [p, s, favs] = await Promise.all([
      fetchAllRows<Provider>(supabase, 'providers'),
      fetchAllRows<ProviderService>(supabase, 'provider_services'),
      fetchAllRows<FavoriteService>(supabase, 'favorite_services'),
    ]);
    const activeProviders = p.filter((prov) => prov.status === 'active').sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
    const activeServices = s.filter((svc) => svc.active).sort((a, b) => (a.platform ?? '').localeCompare(b.platform ?? '') || (a.metric ?? '').localeCompare(b.metric ?? ''));
    setProviders(activeProviders);
    setServices(activeServices);
    setFavorites(favs);
    if (activeProviders.length > 0) setProviderId(activeProviders[0].id);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-select first available platform when provider changes
  useEffect(() => {
    if (!providerId || services.length === 0) return;
    const PLATFORM_ORDER: Record<string, number> = {
      'YouTube': 0, 'TikTok': 1, 'Instagram': 2, 'Facebook': 3, 'Twitter/X': 4,
      'Telegram': 5, 'Twitch': 6, 'Website': 7, 'Other': 99,
    };
    const providerPlatforms = Array.from(new Set(
      services.filter((s) => s.provider_id === providerId).map((s) => s.manual_platform ?? s.platform)
        .filter((p): p is string => Boolean(p) && PLATFORMS.includes(p))
    )).sort((a, b) => (PLATFORM_ORDER[a] ?? 50) - (PLATFORM_ORDER[b] ?? 50) || a.localeCompare(b));
    if (providerPlatforms.length > 0 && !providerPlatforms.includes(platform)) {
      setPlatform(providerPlatforms[0]);
    }
  }, [providerId, services, platform]);

  const availableServices = services.filter(
    (s) => s.provider_id === providerId && (s.manual_platform ?? s.platform) === platform,
  );

  const availableMetrics = METRIC_KEYS.filter((m) =>
    availableServices.some((s) => (s.manual_metric ?? s.metric) === m),
  );

  const servicesForMetric = (m: MetricKey) =>
    availableServices.filter((s) => (s.manual_metric ?? s.metric) === m);

  const favForService = (svc: ProviderService): FavoriteService | undefined =>
    favorites.find(
      (f) => f.provider_id === svc.provider_id && f.external_service_id === svc.external_service_id,
    );

  const isFav = (svc: ProviderService) => Boolean(favForService(svc));
  const isDefaultForMetric = (svc: ProviderService) => {
    const fav = favForService(svc);
    const svcPlatform = svc.manual_platform ?? svc.platform;
    return Boolean(fav?.is_default && fav?.metric === (svc.manual_metric ?? svc.metric) && (!fav.platform || fav.platform === svcPlatform));
  };

  // Auto-select service when metric or platform changes
  useEffect(() => {
    const matching = servicesForMetric(metric);
    if (matching.length === 0) { setServiceId(''); return; }
    const favMatch = matching.filter((s) => isFav(s));
    const defaultMatch = favMatch.find((s) => isDefaultForMetric(s));
    const svc = defaultMatch ?? favMatch[0] ?? matching[0];
    setServiceId(svc.id);
    setQuantity(String(Math.max(svc.min_quantity, 100)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric, platform, providerId, services, favorites]);

  // Auto-set start time to now+5min on first load
  useEffect(() => {
    if (!startAt && !loading) {
      const d = new Date(Date.now() + 5 * 60 * 1000);
      setStartAt(toLocalInputValue(d));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const selectedProvider = providers.find((p) => p.id === providerId);
  const balanceInfo = selectedProvider
    ? formatBalanceDisplay(selectedProvider.balance_paise, selectedProvider.currency, selectedProvider.last_balance_at, selectedProvider.conversion_rate_to_inr)
    : null;

  const selectedService = services.find((s) => s.id === serviceId);
  const isPostMetric = POST_URL_METRICS.includes(metric);
  const isFollowerMetric = metric === 'followers';
  const isSubscriberMetric = metric === 'subscribers';

  const targetLabel = isFollowerMetric ? 'Profile URL' : isSubscriberMetric ? 'Channel URL' : 'Post / Video URL';

  // Run distribution preview
  const runs = Math.max(1, parseInt(runCount || '1', 10));
  const intervalMin = intervalToMinutes(parseFloat(intervalValue || '1'), intervalUnit);
  const baseStart = startAt ? fromLocalInputValue(startAt) : null;
  const endDate = endAt ? fromLocalInputValue(endAt) : null;
  const runTimes = baseStart
    ? generateRunTimes(baseStart, endDate, intervalMin, runs, 'at_start')
    : [];

  const totalQty = parseInt(quantity || '0', 10);
  const dist = selectedService && runTimes.length > 0
    ? distributeVariedQuantities(totalQty, runTimes.length, selectedService.min_quantity, selectedService.max_quantity)
    : [];
  const distSum = dist.reduce((a, b) => a + b, 0);
  const hasDistError = dist.length === 0 || distSum !== totalQty;

  const estimatedCost = selectedService ? computeEstimatedCost(totalQty, selectedService.rate_paise_per_1000) : 0;

  const balanceNotSynced = selectedProvider?.kind === 'external' && !balanceInfo?.isSynced;

  const canSubmit = !hasDistError
    && name.trim() !== ''
    && targetUrl.trim() !== ''
    && startAt.trim() !== ''
    && serviceId !== ''
    && totalQty > 0
    && !balanceNotSynced;

  const handleConfirm = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) {
      if (balanceNotSynced) toast.error('Provider balance not synced. Sync it first in Providers.');
      else if (hasDistError) toast.error('Quantity cannot be distributed across the runs. Check min/max limits.');
      else toast.error('Please fill in all required fields');
      return;
    }
    setShowConfirm(true);
  };

  const handleSubmit = async () => {
    if (saving) return;
    setSaving(true);
    setShowConfirm(false);
    const supabase = createClient();

    const providerBefore = providers.find((p) => p.id === providerId);
    const balanceBeforePaise = providerBefore ? Number(providerBefore.balance_paise) : null;

    const { data: order, error } = await supabase.from('campaigns').insert({
      name: name.trim(),
      platform,
      post_url: targetUrl.trim(),
      provider_id: providerId || null,
      status: 'PROCESSING',
      revenue_paise: 0,
      budget_paise: 0,
      notes: '',
      start_at: startAt ? fromLocalInputValue(startAt).toISOString() : null,
      end_at: endAt ? fromLocalInputValue(endAt).toISOString() : null,
      interval_minutes: intervalMin,
      run_count: runs,
      first_run_mode: 'at_start',
      variation_percent: 0,
    }).select().single();

    if (error || !order) { toast.error('Failed to create order'); setSaving(false); return; }

    const svc = services.find((s) => s.id === serviceId);
    if (!svc) { toast.error('Service not found'); setSaving(false); return; }

    const estCost = computeEstimatedCost(totalQty, svc.rate_paise_per_1000);

    const { data: metricRow } = await supabase.from('campaign_metrics').insert({
      campaign_id: order.id,
      metric,
      service_id: serviceId,
      quantity: totalQty,
      delivered_quantity: 0,
      estimated_cost_paise: estCost,
      variation_percent: 0,
      target_link: targetUrl.trim(),
    }).select().single();

    if (!metricRow) { toast.error('Failed to create metric'); setSaving(false); return; }

    const now = Date.now();
    let submittedCount = 0;
    let failedCount = 0;
    let queuedCount = 0;
    const errors: string[] = [];

    const allPendingRuns: { runItemId: string; quantity: number; runCost: number; runNumber: number; plannedAt: Date; isDue: boolean }[] = [];

    for (let i = 0; i < dist.length && i < runTimes.length; i++) {
      const runCost = computeEstimatedCost(dist[i], svc.rate_paise_per_1000);
      const plannedDate = runTimes[i];
      const isDue = plannedDate.getTime() <= now;
      const runStatus = isDue ? 'SCHEDULED' : 'WAITING';

      const { data: runItem } = await supabase.from('campaign_run_items').insert({
        campaign_id: order.id,
        campaign_metric_id: metricRow.id,
        campaign_run_id: null,
        run_number: i + 1,
        planned_at: plannedDate.toISOString(),
        planned_quantity: dist[i],
        delivered_quantity: 0,
        remaining_quantity: dist[i],
        status: runStatus,
        charge_paise: runCost,
        currency: providerBefore?.currency ?? 'INR',
        editable: true,
      }).select().single();

      if (runItem) {
        allPendingRuns.push({ runItemId: runItem.id, quantity: dist[i], runCost, runNumber: i + 1, plannedAt: plannedDate, isDue });
      }
    }

    const dueRuns = allPendingRuns.filter((r) => r.isDue);
    queuedCount = allPendingRuns.length - dueRuns.length;

    for (const run of dueRuns) {
      const result = await submitRunToProvider({
        provider: providerBefore!,
        service: svc,
        link: targetUrl.trim(),
        quantity: run.quantity,
      });

      if (result.success && result.externalOrderId) {
        await supabase.from('campaign_run_items').update({
          status: 'SUBMITTED',
          provider_order_id: result.externalOrderId,
          charge_paise: result.charge ?? run.runCost,
          start_count: result.startCount,
          submitted_at: new Date().toISOString(),
          editable: false,
          updated_at: new Date().toISOString(),
        }).eq('id', run.runItemId);

        await recordProviderOrder({
          campaignId: order.id,
          metricId: metricRow.id,
          runItemId: run.runItemId,
          providerId: providerBefore!.id,
          serviceId: svc.id,
          externalOrderId: result.externalOrderId,
          quantity: run.quantity,
          chargePaise: result.charge ?? run.runCost,
          currency: result.currency ?? providerBefore!.currency ?? 'INR',
          startCount: result.startCount,
          responseData: { order: result.externalOrderId, charge: result.charge },
          balanceBefore: balanceBeforePaise,
          balanceAfter: null,
        });

        submittedCount++;
      } else {
        const errMsg = result.error ?? 'Unknown error';
        await supabase.from('campaign_run_items').update({
          status: 'FAILED',
          error_message: errMsg,
          updated_at: new Date().toISOString(),
        }).eq('id', run.runItemId);
        failedCount++;
        errors.push(`Run ${run.runNumber}: ${errMsg}`);
      }
    }

    const newStatus = failedCount === 0
      ? 'PROCESSING'
      : submittedCount === 0
        ? 'FAILED'
        : 'PARTIAL';

    await supabase.from('campaigns').update({
      status: newStatus,
      updated_at: new Date().toISOString(),
    }).eq('id', order.id);

    // Refresh provider balance
    if (providerBefore && providerBefore.kind === 'external' && submittedCount > 0) {
      try {
        const apiUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/cheapestsmm-proxy`;
        const balRes = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ action: 'balance', provider_id: providerBefore.id }),
        });
        const balData = await balRes.json().catch(() => ({}));
        if (balRes.ok && !(balData as Record<string, unknown>)?.error) {
          const balance = parseFloat(String((balData as Record<string, unknown>)?.balance ?? '0'));
          const currency = String((balData as Record<string, unknown>)?.currency ?? providerBefore.currency);
          const balancePaise = Math.round(balance * 100);
          await supabase.from('providers').update({
            balance_paise: balancePaise,
            currency,
            last_balance_at: new Date().toISOString(),
            last_balance_error: null,
            updated_at: new Date().toISOString(),
          }).eq('id', providerBefore.id);
          await supabase.from('provider_balance_snapshots').insert({
            provider_id: providerBefore.id, balance_paise: balancePaise, currency,
          });
        }
      } catch {
        // best-effort
      }
    }

    await supabase.from('activity_logs').insert({
      action: 'order_created',
      entity_type: 'campaign',
      entity_id: order.id,
      detail: `Single Order: ${name.trim()} — ${METRIC_LABELS[metric]} (${newStatus}) — ${submittedCount} submitted, ${queuedCount} queued, ${failedCount} failed`,
    });

    if (failedCount > 0 && submittedCount > 0) {
      toast.warning(`Order created — ${submittedCount} runs submitted, ${queuedCount} queued, ${failedCount} failed: ${errors.join('; ')}`);
    } else if (failedCount > 0 && submittedCount === 0) {
      toast.error(`Order created but all submissions failed: ${errors.join('; ')}`);
    } else if (queuedCount > 0) {
      toast.success(`Order submitted — ${submittedCount} run${submittedCount !== 1 ? 's' : ''} sent to provider, ${queuedCount} queued for their scheduled time`);
    } else {
      toast.success(`Order submitted — ${submittedCount} run${submittedCount !== 1 ? 's' : ''} sent to provider`);
    }
    router.push('/engagement-orders');
    router.refresh();
  };

  const toggleFavorite = async (svc: ProviderService) => {
    const supabase = createClient();
    const existing = favForService(svc);
    if (existing) {
      const { error } = await supabase.from('favorite_services').delete().eq('id', existing.id);
      if (error) { toast.error('Failed to remove favorite'); return; }
      setFavorites((prev) => prev.filter((f) => f.id !== existing.id));
      toast.success('Removed from favorites');
    } else {
      const { data, error } = await supabase.from('favorite_services').insert({
        provider_id: svc.provider_id,
        external_service_id: svc.external_service_id ?? '',
        metric: svc.manual_metric ?? svc.metric,
        platform: svc.manual_platform ?? svc.platform,
        is_default: false,
      }).select().single();
      if (error) { toast.error('Failed to add favorite'); return; }
      setFavorites((prev) => [...prev, data as FavoriteService]);
      toast.success('Added to favorites');
    }
  };

  const toggleDefault = async (svc: ProviderService) => {
    const supabase = createClient();
    const fav = favForService(svc);
    if (!fav) return;
    const newDefault = !fav.is_default;
    const svcPlatform = svc.manual_platform ?? svc.platform;
    const svcMetric = svc.manual_metric ?? svc.metric;
    const otherDefaults = favorites.filter(
      (f) => f.is_default && f.id !== fav.id &&
        f.provider_id === svc.provider_id &&
        (f.platform ?? '') === svcPlatform &&
        f.metric === svcMetric,
    );
    for (const other of otherDefaults) {
      await supabase.from('favorite_services').update({ is_default: false }).eq('id', other.id);
    }
    const { error } = await supabase
      .from('favorite_services')
      .update({ is_default: newDefault, updated_at: new Date().toISOString() })
      .eq('id', fav.id);
    if (error) { toast.error('Failed to update default'); return; }
    setFavorites((prev) =>
      prev.map((f) =>
        f.is_default && f.id !== fav.id &&
          f.provider_id === svc.provider_id &&
          (f.platform ?? '') === svcPlatform &&
          f.metric === svcMetric
          ? { ...f, is_default: false }
          : f.id === fav.id ? { ...f, is_default: newDefault } : f
      ),
    );
    toast.success(newDefault ? 'Set as default for this metric' : 'Removed default');
  };

  const saveOverride = async (svc: ProviderService, newPlatform: string, newMetric: MetricKey) => {
    const supabase = createClient();
    const { error } = await supabase
      .from('provider_services')
      .update({
        manual_platform: newPlatform,
        manual_metric: newMetric,
        classification_source: 'manual',
        updated_at: new Date().toISOString(),
      })
      .eq('id', svc.id);
    if (error) { toast.error('Failed to save override'); return; }
    setServices((prev) => prev.map((s) =>
      s.id === svc.id ? { ...s, manual_platform: newPlatform, manual_metric: newMetric, classification_source: 'manual' } : s,
    ));
    toast.success('Classification updated');
  };

  const openDetails = (svc: ProviderService) => {
    setDetailsService(svc);
    setDetailsOpen(true);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  }

  const fmtTime = (d: Date) => d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  const renderServiceSelect = () => {
    const all = servicesForMetric(metric);
    const favs = all.filter((s) => isFav(s));
    const nonFavs = all.filter((s) => !isFav(s));

    return (
      <Select value={serviceId} onValueChange={setServiceId}>
        <SelectTrigger className="h-9">
          <SelectValue placeholder="Select a service" />
        </SelectTrigger>
        <SelectContent>
          {favs.length > 0 && (
            <SelectGroup>
              <SelectLabel className="text-xs font-semibold text-amber-600">
                <Star className="mr-1 inline h-3 w-3 fill-amber-400 text-amber-500" />
                My Services ({favs.length})
              </SelectLabel>
              {favs.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  <span className="flex items-center gap-1.5">
                    {isDefaultForMetric(s) && <CheckCircle2 className="h-3 w-3 text-cyan-500 shrink-0" />}
                    <span className="truncate">{s.name}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          )}
          <SelectGroup>
            <SelectLabel className="text-xs font-semibold text-slate-500">
              Browse All Services ({nonFavs.length})
            </SelectLabel>
            {nonFavs.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                <span className="truncate">{s.name}</span>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    );
  };

  const PlatformIcon = PLATFORM_ICONS[platform] ?? Film;
  const MetricIcon = METRIC_ICONS[metric] ?? Eye;

  return (
    <>
      <PageHeader title="Single Order" description="Top up one metric — distributed across runs just like organic engagement" />

      {providers.length === 0 ? (
        <Card className="p-6 text-center text-sm text-slate-500">
          <AlertCircle className="mx-auto mb-2 h-8 w-8 text-slate-300" />
          No active providers. Add one in Providers &amp; Services first.
        </Card>
      ) : (
        <form onSubmit={handleConfirm} className="space-y-4">
          {/* Order name */}
          <Card className="p-4 space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Order Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Boost likes on Reel #12"
              className="h-9"
            />
          </Card>

          {/* Provider + Platform */}
          <Card className="p-4 space-y-3">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Provider</Label>
              <Select value={providerId} onValueChange={setProviderId}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {balanceInfo && (
                <p className="text-xs text-slate-500">
                  Balance: <span className={balanceInfo.isSynced ? 'font-medium text-slate-700' : 'text-amber-600'}>{balanceInfo.text}</span>
                  {balanceInfo.sub && <span className="text-slate-400"> ({balanceInfo.sub})</span>}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Platform</Label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map((p) => {
                    const Icon = PLATFORM_ICONS[p] ?? Film;
                    return (
                      <SelectItem key={p} value={p}>
                        <span className="flex items-center gap-1.5"><Icon className="h-3.5 w-3.5" /> {p}</span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </Card>

          {/* Metric selection */}
          <Card className="p-4 space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">What to boost?</Label>
            <div className="grid grid-cols-4 gap-2">
              {METRIC_KEYS.map((m) => {
                const Icon = METRIC_ICONS[m];
                const isAvailable = availableMetrics.includes(m);
                const isSelected = metric === m;
                return (
                  <button
                    key={m}
                    type="button"
                    disabled={!isAvailable}
                    onClick={() => setMetric(m)}
                    className={`flex flex-col items-center gap-1 rounded-lg border p-2.5 transition-all ${
                      isSelected
                        ? 'border-cyan-500 bg-cyan-50 text-cyan-700'
                        : isAvailable
                          ? 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                          : 'border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-[10px] font-medium">{METRIC_LABELS[m]}</span>
                  </button>
                );
              })}
            </div>
            {availableMetrics.length === 0 && (
              <p className="text-xs text-amber-600">No services available for this provider + platform.</p>
            )}
          </Card>

          {/* Service + Quantity */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Service</Label>
              {selectedService && (
                <button type="button" onClick={() => openDetails(selectedService)} className="text-xs text-cyan-600 hover:underline">
                  <Info className="mr-0.5 inline h-3 w-3" /> Details
                </button>
              )}
            </div>
            {renderServiceSelect()}
            {selectedService && (
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary" className="text-[10px]">{formatProviderRate(selectedService)}</Badge>
                <Badge variant="outline" className="text-[10px]">Min: {formatNumber(selectedService.min_quantity)}</Badge>
                <Badge variant="outline" className="text-[10px]">Max: {formatNumber(selectedService.max_quantity)}</Badge>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Quantity</Label>
              <Input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                min={selectedService?.min_quantity ?? 1}
                max={selectedService?.max_quantity ?? 999999}
                className="h-9"
              />
              {selectedService && (
                <p className="text-xs text-slate-500">
                  Est. cost: <span className="font-medium text-slate-700">{formatCurrency(estimatedCost)}</span>
                </p>
              )}
            </div>
          </Card>

          {/* Target URL */}
          <Card className="p-4 space-y-2">
            <Label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Target className="h-3.5 w-3.5" /> {targetLabel}
            </Label>
            <Input
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder={isFollowerMetric ? 'https://instagram.com/yourprofile' : isSubscriberMetric ? 'https://youtube.com/@yourchannel' : 'https://instagram.com/p/xxxxx'}
              className="h-9"
            />
          </Card>

          {/* Schedule */}
          <Card className="p-4 space-y-3">
            <Label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Calendar className="h-3.5 w-3.5" /> Schedule
            </Label>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px] text-slate-500">Start</Label>
                <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className="h-9 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-slate-500">End (optional)</Label>
                <Input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} className="h-9 text-xs" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px] text-slate-500">Runs</Label>
                <Input type="number" value={runCount} onChange={(e) => setRunCount(e.target.value)} min={1} max={50} className="h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-slate-500">Every</Label>
                <Input type="number" value={intervalValue} onChange={(e) => setIntervalValue(e.target.value)} min={1} className="h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-slate-500">Unit</Label>
                <Select value={intervalUnit} onValueChange={(v) => setIntervalUnit(v as IntervalUnit)}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INTERVAL_UNITS.map((u) => (
                      <SelectItem key={u} value={u}>{INTERVAL_UNIT_LABELS[u]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-slate-500">{formatIntervalReadable(parseFloat(intervalValue || '1'), intervalUnit)} between runs</p>
          </Card>

          {/* Distribution preview */}
          {dist.length > 0 && (
            <Card className="p-4 space-y-2">
              <Label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <Clock className="h-3.5 w-3.5" /> Distribution Preview
              </Label>
              <div className="space-y-1.5">
                {dist.map((q, i) => (
                  <div key={i} className="flex items-center justify-between rounded-md bg-slate-50 px-2.5 py-1.5 text-xs">
                    <span className="text-slate-500">Run {i + 1}</span>
                    <span className="font-medium text-slate-700">{formatNumber(q)}</span>
                    <span className="text-slate-400">{fmtTime(runTimes[i])}</span>
                  </div>
                ))}
              </div>
              <Separator className="my-1" />
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Total: {formatNumber(distSum)} / {formatNumber(totalQty)}</span>
                <span className="font-medium text-slate-700">{formatCurrency(estimatedCost)}</span>
              </div>
              {hasDistError && (
                <p className="text-xs text-rose-600">
                  <AlertCircle className="mr-1 inline h-3 w-3" />
                  Quantity can&apos;t be evenly distributed. Adjust total or runs.
                </p>
              )}
            </Card>
          )}

          {/* Submit */}
          <div className="sticky bottom-0 z-10 -mx-3 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent px-3 pb-2 pt-4">
            <Button type="submit" className="w-full" disabled={!canSubmit || saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Submit Single Order
            </Button>
          </div>
        </form>
      )}

      {/* Confirmation dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MetricIcon className="h-5 w-5 text-cyan-600" />
              Confirm Single Order
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-3">
              <PlatformIcon className="h-5 w-5 text-slate-400" />
              <div>
                <p className="font-medium text-slate-800">{name.trim()}</p>
                <p className="text-xs text-slate-500">{platform} • {METRIC_LABELS[metric]} • {formatNumber(totalQty)} qty</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between"><span className="text-slate-500">Provider</span><span className="font-medium">{selectedProvider?.name}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Service</span><span className="font-medium text-right truncate ml-2 max-w-[180px]">{selectedService?.name}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Runs</span><span className="font-medium">{runs}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Est. cost</span><span className="font-medium">{formatCurrency(estimatedCost)}</span></div>
            </div>
            {dist.length > 0 && (
              <div className="rounded-lg border border-slate-200 p-2 space-y-1">
                {dist.map((q, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="text-slate-500">Run {i + 1}</span>
                    <span className="font-medium">{formatNumber(q)} @ {fmtTime(runTimes[i])}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter className="sticky bottom-0 flex-col gap-2 bg-background pt-2 sm:flex-row">
            <Button variant="outline" onClick={() => setShowConfirm(false)} className="w-full sm:w-auto">Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving} className="w-full sm:w-auto">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Confirm &amp; Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ServiceDetailsSheet
        service={detailsService}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        isFavorite={detailsService ? isFav(detailsService) : false}
        onToggleFavorite={toggleFavorite}
        isDefault={detailsService ? isDefaultForMetric(detailsService) : false}
        onToggleDefault={toggleDefault}
        onSaveOverride={saveOverride}
      />
    </>
  );
}
