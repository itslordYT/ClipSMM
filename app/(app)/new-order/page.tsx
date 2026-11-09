'use client';

import { useEffect, useState, useCallback, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
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
  PlusCircle,
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
  EyeOff,
  Sparkles,
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
  intervalToMinutes,
  formatIntervalReadable,
  formatProviderRate,
  formatBalanceDisplay,
  formatDateTime,
} from '@/lib/format';
import type { Provider, ProviderService, MetricKey, FavoriteService, IntervalUnit } from '@/lib/types';
import { METRIC_LABELS, METRIC_KEYS, METRIC_PRIORITY, FOLLOWER_METRICS, INTERVAL_UNITS, INTERVAL_UNIT_LABELS, PLATFORMS } from '@/lib/types';
import { ServiceDetailsSheet } from '@/components/service-details-sheet';
import { submitRunToProvider, recordProviderOrder } from '@/lib/submit-order';

type MetricConfig = {
  enabled: boolean;
  serviceId: string;
  quantity: string;
  runCount: string;
  intervalValue: string;
  intervalUnit: IntervalUnit;
};

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

// Metrics that require a post/reel URL
const POST_URL_METRICS: MetricKey[] = ['views', 'likes', 'comments', 'shares', 'reposts', 'saves'];

export default function NewOrderPage() {
  const router = useRouter();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [services, setServices] = useState<ProviderService[]>([]);
  const [favorites, setFavorites] = useState<FavoriteService[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [detailsService, setDetailsService] = useState<ProviderService | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const [name, setName] = useState('');
  const [platform, setPlatform] = useState('Instagram');
  const [postUrl, setPostUrl] = useState('');
  const [profileUrl, setProfileUrl] = useState('');
  const [channelUrl, setChannelUrl] = useState('');
  const [providerId, setProviderId] = useState('');

  const [metrics, setMetrics] = useState<Record<string, MetricConfig>>({});
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [autoDistributeQty, setAutoDistributeQty] = useState('');

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

  // Auto-select first available platform when provider changes or data loads
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

  // When platform changes, clear metric selections
  useEffect(() => {
    setMetrics({});
  }, [platform]);

  // Services for the selected provider + platform
  const availableServices = services.filter(
    (s) => s.provider_id === providerId && (s.manual_platform ?? s.platform) === platform,
  );

  // Metrics that have at least one matching service
  const availableMetrics = METRIC_KEYS.filter((metric) =>
    availableServices.some((s) => (s.manual_metric ?? s.metric) === metric),
  );

  // Metrics with no services (to show "Not available")
  const unavailableMetrics = METRIC_KEYS.filter((metric) =>
    !availableServices.some((s) => (s.manual_metric ?? s.metric) === metric),
  );

  const servicesForMetric = (metric: MetricKey) =>
    availableServices.filter((s) => (s.manual_metric ?? s.metric) === metric);

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
    // Unset other defaults for same provider+platform+metric
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

  const selectedProvider = providers.find((p) => p.id === providerId);
  const balanceInfo = selectedProvider
    ? formatBalanceDisplay(selectedProvider.balance_paise, selectedProvider.currency, selectedProvider.last_balance_at, selectedProvider.conversion_rate_to_inr)
    : null;

  const hasFollowerMetric = Object.entries(metrics).some(
    ([k, c]) => c.enabled && k === 'followers',
  );
  const hasSubscriberMetric = Object.entries(metrics).some(
    ([k, c]) => c.enabled && k === 'subscribers',
  );
  const hasNonFollowerMetric = Object.entries(metrics).some(
    ([k, c]) => c.enabled && POST_URL_METRICS.includes(k as MetricKey),
  );
  const hasViewsMetric = metrics.views?.enabled ?? false;

  const toggleMetric = (metric: MetricKey) => {
    setMetrics((prev) => {
      const current = prev[metric];
      if (current?.enabled) {
        return { ...prev, [metric]: { ...current, enabled: false } };
      }
      const matching = servicesForMetric(metric);
      const favMatch = matching.filter((s) => isFav(s));
      const defaultMatch = favMatch.find((s) => isDefaultForMetric(s));
      const first = defaultMatch ?? favMatch[0] ?? matching[0];
      return {
        ...prev,
        [metric]: {
          enabled: true,
          serviceId: first?.id ?? '',
          quantity: String(first?.min_quantity ?? 100),
          runCount: '5',
          intervalValue: '3',
          intervalUnit: 'hours',
        },
      };
    });
  };

  const updateMetric = (metric: MetricKey, field: keyof MetricConfig, value: string) => {
    setMetrics((prev) => ({ ...prev, [metric]: { ...prev[metric], [field]: value } }));
  };

  // Smart auto-distribute: organic engagement ratios
  // 100% views, 1% likes, 0.8% shares, 0.6% comments, 0.4% reposts, 0.2% saves
  const SMART_RATIOS: Partial<Record<MetricKey, number>> = {
    views: 1.0,
    likes: 0.01,
    shares: 0.008,
    comments: 0.006,
    reposts: 0.004,
    saves: 0.002,
  };

  // Views start first, followed by interactions in the requested order.
  const STAGGER_HOURS: Partial<Record<MetricKey, number>> = {
    views: 0,
    likes: 1,
    shares: 3,
    comments: 4,
    reposts: 6,
    saves: 8,
  };

  const autoDistribute = () => {
    const viewsQty = parseInt(autoDistributeQty || '0', 10);
    if (viewsQty <= 0) {
      toast.error('Enter a total views quantity first');
      return;
    }

    const newMetrics: Record<string, MetricConfig> = {};
    const metricsToEnable: MetricKey[] = ['views', 'likes', 'comments', 'shares', 'reposts', 'saves'];

    for (const metric of metricsToEnable) {
      const matching = servicesForMetric(metric);
      if (matching.length === 0) continue;

      const favMatch = matching.filter((s) => isFav(s));
      const defaultMatch = favMatch.find((s) => isDefaultForMetric(s));
      const svc = defaultMatch ?? favMatch[0] ?? matching[0];

      const ratio = SMART_RATIOS[metric] ?? 0;
      let qty = Math.round(viewsQty * ratio);

      // Clamp to service min/max
      if (qty < svc.min_quantity) qty = svc.min_quantity;
      if (qty > svc.max_quantity) qty = svc.max_quantity;
      if (qty < 1) continue;

      newMetrics[metric] = {
        enabled: true,
        serviceId: svc.id,
        quantity: String(qty),
        runCount: '5',
        intervalValue: '3',
        intervalUnit: 'hours',
      };
    }

    setMetrics(newMetrics);
    toast.success(`Auto-distributed ${viewsQty} views into organic interaction ratios`);
  };

  // Auto-fill likes based on views quantity (when user manually enters views)
  const autoFillLikes = (viewsQty: number) => {
    if (viewsQty <= 0) return;
    const likesQty = Math.max(Math.round(viewsQty * 0.01), 50);
    const matching = servicesForMetric('likes');
    if (matching.length === 0) return;
    const favMatch = matching.filter((s) => isFav(s));
    const defaultMatch = favMatch.find((s) => isDefaultForMetric(s));
    const svc = defaultMatch ?? favMatch[0] ?? matching[0];
    const clampedQty = Math.min(Math.max(likesQty, svc.min_quantity), svc.max_quantity);
    setMetrics((prev) => ({
      ...prev,
      likes: {
        enabled: true,
        serviceId: svc.id,
        quantity: String(clampedQty),
        runCount: prev.likes?.runCount ?? '5',
        intervalValue: prev.likes?.intervalValue ?? '3',
        intervalUnit: prev.likes?.intervalUnit ?? 'hours',
      },
    }));
  };

  const enabledMetrics = Object.entries(metrics).filter(([, c]) => c.enabled);

  const metricRunTimes: Record<string, Date[]> = {};
  for (const [key, config] of enabledMetrics) {
    if (!startAt) { metricRunTimes[key] = []; continue; }
    const baseStart = fromLocalInputValue(startAt);
    const end = endAt ? fromLocalInputValue(endAt) : null;
    const runs = Math.max(1, parseInt(config.runCount || '1', 10));
    const intervalMin = intervalToMinutes(parseFloat(config.intervalValue || '1'), config.intervalUnit);

    // Stagger interaction start times after views
    const staggerHours = STAGGER_HOURS[key as MetricKey] ?? 0;
    const staggeredStart = new Date(baseStart.getTime() + staggerHours * 60 * 60 * 1000);

    // For end time, also push it by the stagger so the window is preserved
    const staggeredEnd = end ? new Date(end.getTime() + staggerHours * 60 * 60 * 1000) : null;
    metricRunTimes[key] = generateRunTimes(staggeredStart, staggeredEnd, intervalMin, runs, 'after_interval');
  }

  const estimatedCompletionAt = Object.values(metricRunTimes)
    .flat()
    .reduce<Date | null>((latest, runTime) => (!latest || runTime > latest ? runTime : latest), null);

  const distributionPreview = enabledMetrics.map(([metric, config]) => {
    const svc = services.find((s) => s.id === config.serviceId);
    const total = parseInt(config.quantity || '0', 10);
    const runTimes = metricRunTimes[metric] ?? [];
    if (!svc || total <= 0 || runTimes.length === 0) return null;
    const dist = distributeVariedQuantities(total, runTimes.length, svc.min_quantity, svc.max_quantity);
    if (dist.length === 0) return { metric, dist: [], sum: 0, target: total, hasZeros: true, min: svc.min_quantity, max: svc.max_quantity, runTimes };
    const sum = dist.reduce((a, b) => a + b, 0);
    return { metric, dist, sum, target: total, hasZeros: dist.some((q) => q === 0), min: svc.min_quantity, max: svc.max_quantity, runTimes };
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  const hasDistributionError = distributionPreview.some((d) => d.sum !== d.target || d.hasZeros || d.dist.length === 0);

  const totalEstimatedCost = enabledMetrics.reduce((sum, [, c]) => {
    const svc = services.find((s) => s.id === c.serviceId);
    if (!svc) return sum;
    return sum + computeEstimatedCost(parseInt(c.quantity || '0', 10), svc.rate_paise_per_1000);
  }, 0);

  const totalRuns = enabledMetrics.reduce((s, [, c]) => s + Math.max(1, parseInt(c.runCount || '1', 10)), 0);

  const unavailableFavorites = favorites.filter((f) => {
    const svc = services.find(
      (s) => s.provider_id === f.provider_id && s.external_service_id === f.external_service_id,
    );
    return !svc || !svc.active;
  });

  // Disable submit if balance not synced (for external providers)
  const balanceNotSynced = selectedProvider?.kind === 'external' && !balanceInfo?.isSynced;

  const canSubmit = !hasDistributionError
    && enabledMetrics.length > 0
    && (!hasNonFollowerMetric || hasViewsMetric)
    && name.trim() !== ''
    && startAt.trim() !== ''
    && (!hasNonFollowerMetric || postUrl.trim() !== '')
    && (!hasFollowerMetric || profileUrl.trim() !== '')
    && (!hasSubscriberMetric || channelUrl.trim() !== '')
    && !balanceNotSynced;

  const handleConfirm = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) {
      if (balanceNotSynced) toast.error('Provider balance not synced. Click Balance in Providers to sync first.');
      else toast.error('Please fix the errors before confirming');
      return;
    }
    setShowConfirm(true);
  };

  const handleSubmit = async () => {
    if (saving) return; // prevent duplicate submission
    setSaving(true);
    setShowConfirm(false);
    const supabase = createClient();

    const urls: string[] = [];
    if (postUrl.trim()) urls.push(postUrl.trim());
    if (profileUrl.trim()) urls.push(profileUrl.trim());
    if (channelUrl.trim()) urls.push(channelUrl.trim());
    const targetUrl = urls.join(' | ');

    // Determine the correct link per metric
    const linkForMetric = (metric: MetricKey): string => {
      if (metric === 'followers') return profileUrl.trim();
      if (metric === 'subscribers') return channelUrl.trim() || profileUrl.trim();
      return postUrl.trim();
    };

    const maxIntervalMin = Math.max(1, ...enabledMetrics.map(([, c]) =>
      intervalToMinutes(parseFloat(c.intervalValue || '1'), c.intervalUnit)
    ));

    const { data: order, error } = await supabase.from('campaigns').insert({
      name: name.trim(),
      platform,
      post_url: targetUrl,
      provider_id: providerId || null,
      status: 'PROCESSING',
      revenue_paise: 0,
      budget_paise: 0,
      notes: '',
      start_at: startAt ? fromLocalInputValue(startAt).toISOString() : null,
      end_at: endAt ? fromLocalInputValue(endAt).toISOString() : null,
      interval_minutes: maxIntervalMin,
      run_count: totalRuns,
      first_run_mode: 'after_interval',
      variation_percent: 0,
    }).select().single();

    if (error || !order) { toast.error('Failed to create order'); setSaving(false); return; }

    // Capture provider balance before submission
    const providerBefore = providers.find((p) => p.id === providerId);
    const balanceBeforePaise = providerBefore ? Number(providerBefore.balance_paise) : null;

    let submittedCount = 0;
    let failedCount = 0;
    let queuedCount = 0;
    const errors: string[] = [];
    const now = Date.now();

    const sortedMetrics = [...enabledMetrics].sort(
      ([a], [b]) => (METRIC_PRIORITY[a as MetricKey] ?? 99) - (METRIC_PRIORITY[b as MetricKey] ?? 99),
    );

    type PendingRun = {
      metric: MetricKey;
      metricRowId: string;
      svc: ProviderService;
      targetLink: string;
      runItemId: string;
      quantity: number;
      runCost: number;
      runNumber: number;
      plannedAt: Date;
      isDue: boolean;
    };
    const allPendingRuns: PendingRun[] = [];

    for (const [metric, config] of sortedMetrics) {
      const svc = services.find((s) => s.id === config.serviceId);
      const totalQty = parseInt(config.quantity, 10);
      const estCost = svc ? computeEstimatedCost(totalQty, svc.rate_paise_per_1000) : 0;
      const runTimes = metricRunTimes[metric] ?? [];
      const targetLink = linkForMetric(metric as MetricKey);

      const { data: metricRow } = await supabase.from('campaign_metrics').insert({
        campaign_id: order.id,
        metric: metric as MetricKey,
        service_id: config.serviceId || null,
        quantity: totalQty,
        delivered_quantity: 0,
        estimated_cost_paise: estCost,
        variation_percent: 0,
        target_link: targetLink || null,
      }).select().single();

      if (!metricRow) continue;

      const dist = svc
        ? distributeVariedQuantities(totalQty, runTimes.length, svc.min_quantity, svc.max_quantity)
        : [];

      for (let i = 0; i < dist.length && i < runTimes.length; i++) {
        const runCost = svc ? computeEstimatedCost(dist[i], svc.rate_paise_per_1000) : 0;
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

        if (runItem && svc && providerBefore) {
          allPendingRuns.push({
            metric: metric as MetricKey,
            metricRowId: metricRow.id,
            svc,
            targetLink,
            runItemId: runItem.id,
            quantity: dist[i],
            runCost,
            runNumber: i + 1,
            plannedAt: plannedDate,
            isDue,
          });
        }
      }
    }

    const dueRuns = allPendingRuns
      .filter((r) => r.isDue)
      .sort((a, b) => {
        const pri = (METRIC_PRIORITY[a.metric] ?? 99) - (METRIC_PRIORITY[b.metric] ?? 99);
        if (pri !== 0) return pri;
        return a.plannedAt.getTime() - b.plannedAt.getTime();
      });

    queuedCount = allPendingRuns.length - dueRuns.length;

    for (const run of dueRuns) {
      const result = await submitRunToProvider({
        provider: providerBefore!,
        service: run.svc,
        link: run.targetLink,
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
          metricId: run.metricRowId,
          runItemId: run.runItemId,
          providerId: providerBefore!.id,
          serviceId: run.svc.id,
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
        errors.push(`${METRIC_LABELS[run.metric]} run ${run.runNumber}: ${errMsg}`);
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

    // Refresh provider balance after order submission
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
        // Balance refresh is best-effort after order
      }
    }

    await supabase.from('activity_logs').insert({
      action: 'order_created',
      entity_type: 'campaign',
      entity_id: order.id,
      detail: `${name.trim()} (${newStatus}) — ${submittedCount} runs submitted, ${queuedCount} queued for later, ${failedCount} failed`,
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

  const openDetails = (svc: ProviderService) => {
    setDetailsService(svc);
    setDetailsOpen(true);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  }

  const fmtTime = (d: Date) => d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  const renderServiceSelect = (metric: MetricKey, config: MetricConfig) => {
    const all = servicesForMetric(metric);
    const favs = all.filter((s) => isFav(s));
    const nonFavs = all.filter((s) => !isFav(s));

    return (
      <Select value={config.serviceId} onValueChange={(v) => updateMetric(metric, 'serviceId', v)}>
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

  // Build confirmation summary items
  const confirmItems = enabledMetrics.map(([metric, config]) => {
    const svc = services.find((s) => s.id === config.serviceId);
    const qty = parseInt(config.quantity, 10);
    const cost = svc ? computeEstimatedCost(qty, svc.rate_paise_per_1000) : 0;
    const runs = Math.max(1, parseInt(config.runCount || '1', 10));
    const intervalStr = formatIntervalReadable(parseFloat(config.intervalValue), config.intervalUnit);
    const Icon = METRIC_ICONS[metric as MetricKey];
    return { metric: metric as MetricKey, config, svc, qty, cost, runs, intervalStr, Icon };
  });

  const PLATFORM_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
    Instagram: Instagram,
    YouTube: Youtube,
    TikTok: Music2,
    Facebook: Facebook,
    'Twitter/X': Twitter,
    Telegram: Send,
    Twitch: Twitch,
    Website: Globe,
    Other: Film,
  };

  // Platforms that have services for the selected provider
  // Sort by PLATFORMS priority (YouTube, TikTok, Instagram first), then alpha
  const PLATFORM_ORDER: Record<string, number> = {
    'YouTube': 0, 'TikTok': 1, 'Instagram': 2, 'Facebook': 3, 'Twitter/X': 4,
    'Telegram': 5, 'Twitch': 6, 'Website': 7, 'Other': 99,
  };
  const providerPlatforms = Array.from(new Set(services
    .filter((s) => s.provider_id === providerId)
    .map((s) => s.manual_platform ?? s.platform)
    .filter((p): p is string => Boolean(p) && PLATFORMS.includes(p)),
  )).sort((a, b) => (PLATFORM_ORDER[a] ?? 50) - (PLATFORM_ORDER[b] ?? 50) || a.localeCompare(b));

  return (
    <>
      <PageHeader title="New Order" description="Select metrics, choose services, set schedules" />

      <form onSubmit={handleConfirm} className="space-y-4">
        {/* Order Details */}
        <Card className="border-slate-200/80 p-4 shadow-sm shadow-slate-200/50">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600">
              <PlusCircle className="h-4 w-4 text-white" />
            </div>
            <h2 className="text-base font-semibold text-slate-800">Order Details</h2>
          </div>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-xs font-medium text-slate-500 uppercase tracking-wide">Order Name *</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Summer Reel Boost" className="h-10 border-slate-200 focus:border-cyan-400 focus:ring-cyan-400/20" />
            </div>

            {/* Platform pills */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Platform</Label>
              <div className="flex flex-wrap gap-1.5">
                {PLATFORMS.map((p) => {
                  const Icon = PLATFORM_ICONS[p] ?? Film;
                  const isSelected = platform === p;
                  const hasServices = providerPlatforms.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPlatform(p)}
                      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-200 ${
                        isSelected
                          ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-sm shadow-cyan-500/25'
                          : hasServices
                            ? 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
                            : 'bg-slate-50 text-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="provider" className="text-xs font-medium text-slate-500 uppercase tracking-wide">Provider</Label>
              <Select value={providerId} onValueChange={setProviderId}>
                <SelectTrigger id="provider" className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {providers.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}{p.kind === 'mock' ? ' (Mock)' : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {/* Provider balance display */}
            {selectedProvider && balanceInfo && (
              <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-slate-50 to-slate-100/50 px-3 py-2.5 text-xs border border-slate-200/60">
                <span className="text-slate-500 font-medium">Provider Balance</span>
                <div className="text-right">
                  <span className={`font-semibold ${balanceInfo.isSynced ? 'text-slate-700' : 'text-slate-400'}`}>
                    {balanceInfo.text}
                  </span>
                  {balanceInfo.sub && <span className="ml-1.5 text-slate-400">{balanceInfo.sub}</span>}
                </div>
              </div>
            )}
            {balanceNotSynced && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-700">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>Balance not synced. Order submission is disabled until you sync the provider balance.</span>
              </div>
            )}
            {hasNonFollowerMetric && (
              <div className="space-y-2">
                <Label htmlFor="post-url">Post / Reel URL *</Label>
                <Input id="post-url" value={postUrl} onChange={(e) => setPostUrl(e.target.value)} placeholder="https://instagram.com/reel/..." />
              </div>
            )}
            {hasFollowerMetric && (
              <div className="space-y-2">
                <Label htmlFor="profile-url">Profile URL or Handle *</Label>
                <Input id="profile-url" value={profileUrl} onChange={(e) => setProfileUrl(e.target.value)} placeholder="https://instagram.com/username or @username" />
              </div>
            )}
            {hasSubscriberMetric && (
              <div className="space-y-2">
                <Label htmlFor="channel-url">Channel / Video URL *</Label>
                <Input id="channel-url" value={channelUrl} onChange={(e) => setChannelUrl(e.target.value)} placeholder="https://youtube.com/@channel or video URL" />
              </div>
            )}
          </div>
        </Card>

        {/* Unavailable favorites warning */}
        {unavailableFavorites.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {unavailableFavorites.length} favorite service{unavailableFavorites.length !== 1 ? 's' : ''} no longer available.
              They may have been removed or renamed during a sync. Browse all services to find replacements.
            </span>
          </div>
        )}

        {/* Metrics & Per-Metric Scheduling */}
        <Card className="border-slate-200/80 p-4 shadow-sm shadow-slate-200/50">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600">
              <Target className="h-4 w-4 text-white" />
            </div>
            <h2 className="text-base font-semibold text-slate-800">Metrics & Schedule</h2>
          </div>

          {/* Shared time window */}
          <div className="mb-4 rounded-xl border border-cyan-200/60 bg-gradient-to-br from-cyan-50/60 to-blue-50/30 p-3.5">
            <div className="mb-2.5 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-cyan-600 shrink-0" />
              <span className="text-sm font-medium text-slate-700">Shared Time Window</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="start-at" className="text-xs text-slate-500">Start *</Label>
                <Input id="start-at" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className="h-9" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="end-at" className="text-xs text-slate-500">End (optional)</Label>
                <Input id="end-at" type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} className="h-9" />
              </div>
            </div>
            <p className="mt-2.5 text-xs text-slate-500">
              This is the delivery window. Every metric begins after its first interval, then continues in small batches at the interval you choose.
            </p>
            {estimatedCompletionAt && (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-cyan-200 bg-white/80 px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span className="text-xs font-medium text-slate-600">Estimated completion</span>
                </div>
                <span className="shrink-0 text-right text-xs font-semibold text-slate-800">{formatDateTime(estimatedCompletionAt.toISOString())}</span>
              </div>
            )}
          </div>

          {/* Smart Auto-Distribute */}
          <div className="mb-4 rounded-xl border border-emerald-200/60 bg-gradient-to-br from-emerald-50/60 to-teal-50/30 p-3.5">
            <div className="mb-2.5 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-600 shrink-0" />
              <span className="text-sm font-medium text-slate-700">Smart Auto-Distribute</span>
            </div>
            <p className="mb-2.5 text-xs text-slate-500">
              Enter total views and we'll calculate organic interaction ratios: 100% views, 1% likes, 0.8% shares, 0.6% comments, 0.4% reposts, 0.2% saves. Views always start first. Likes begin 1h later, shares 3h later, comments 4h later, reposts 6h later, and saves 8h later.
            </p>
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="Total views (e.g. 10000)"
                value={autoDistributeQty}
                onChange={(e) => setAutoDistributeQty(e.target.value)}
                className="h-9 flex-1"
              />
              <Button
                type="button"
                variant="outline"
                onClick={autoDistribute}
                disabled={!autoDistributeQty || parseInt(autoDistributeQty) <= 0}
                className="shrink-0 border-emerald-300 text-emerald-700 hover:bg-emerald-100"
              >
                <Sparkles className="mr-1.5 h-4 w-4" />
                Auto-Fill
              </Button>
            </div>
          </div>

          {/* Metric cards */}
          <div className="space-y-2.5">
            {availableMetrics.map((metric) => {
              const config = metrics[metric];
              const matching = servicesForMetric(metric);
              const svc = matching.find((s) => s.id === config?.serviceId);
              const qty = parseInt(config?.quantity || '0', 10);
              const cost = svc ? computeEstimatedCost(qty, svc.rate_paise_per_1000) : 0;
              const minMaxError = svc && config?.enabled && (qty < svc.min_quantity || qty > svc.max_quantity);
              const runTimes = config?.enabled ? (metricRunTimes[metric] ?? []) : [];
              const Icon = METRIC_ICONS[metric];
              const selectedFav = svc ? isFav(svc) : false;

              return (
                <div
                  key={metric}
                  className={`rounded-xl border transition-all duration-200 ${config?.enabled ? 'border-cyan-200 bg-cyan-50/20 shadow-sm' : 'border-slate-200 bg-white'}`}
                >
                  <div className="flex items-center gap-3 p-3">
                    <Checkbox
                      checked={config?.enabled ?? false}
                      onCheckedChange={() => toggleMetric(metric)}
                      id={`m-${metric}`}
                    />
                    <Label
                      htmlFor={`m-${metric}`}
                      className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700 min-w-0"
                    >
                      <Icon className={`h-4 w-4 shrink-0 ${config?.enabled ? 'text-cyan-600' : 'text-slate-400'}`} />
                      <span className="truncate">{METRIC_LABELS[metric]}</span>
                    </Label>
                    <span className="ml-auto shrink-0 text-xs text-slate-400">
                      {matching.length} service{matching.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {config?.enabled && (
                    <div className="space-y-3 px-3 pb-3">
                      <Separator className="bg-slate-100" />

                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs text-slate-500">Service</Label>
                          {svc && (
                            <button
                              type="button"
                              onClick={() => openDetails(svc)}
                              className="flex items-center gap-1 text-xs text-cyan-600 hover:text-cyan-700"
                            >
                              <Info className="h-3 w-3" /> Details
                            </button>
                          )}
                        </div>
                        {renderServiceSelect(metric, config)}
                        {svc && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-slate-400">
                              Min: {formatNumber(svc.min_quantity)} · Max: {formatNumber(svc.max_quantity)}
                            </span>
                            {selectedFav && (
                              <span className="flex items-center gap-0.5 text-xs text-amber-600">
                                <Star className="h-3 w-3 fill-amber-400" /> Favorite
                              </span>
                            )}
                            {svc.refill_supported && (
                              <span className="text-xs text-emerald-600">Refill</span>
                            )}
                            {svc.cancel_supported && (
                              <span className="text-xs text-slate-500">Cancel</span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <div className="flex-1 space-y-1">
                          <Label className="text-xs text-slate-500">Total Quantity</Label>
                          <Input
                            type="number"
                            value={config.quantity}
                            onChange={(e) => {
                              updateMetric(metric, 'quantity', e.target.value);
                              if (metric === 'views') {
                                const qty = parseInt(e.target.value || '0', 10);
                                if (qty > 0) autoFillLikes(qty);
                              }
                            }}
                            className="h-9"
                          />
                        </div>
                        <div className="w-24 space-y-1 shrink-0">
                          <Label className="text-xs text-slate-500">Est. Charge</Label>
                          <div className="flex h-9 items-center">
                            {minMaxError
                              ? <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-600 text-xs">Range</Badge>
                              : <span className="text-sm font-semibold text-slate-700">{formatCurrency(cost)}</span>}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                        <div className="mb-2 flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="text-xs font-medium text-slate-600">Delivery schedule</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs text-slate-500">Number of Runs</Label>
                            <Input
                              type="number"
                              value={config.runCount}
                              onChange={(e) => updateMetric(metric, 'runCount', e.target.value)}
                              min="1"
                              className="h-9"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            <div className="space-y-1">
                              <Label className="text-xs text-slate-500">Interval</Label>
                              <Input
                                type="number"
                                value={config.intervalValue}
                                onChange={(e) => updateMetric(metric, 'intervalValue', e.target.value)}
                                min="1"
                                step="0.5"
                                className="h-9"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-slate-500">Unit</Label>
                              <Select
                                value={config.intervalUnit}
                                onValueChange={(v) => updateMetric(metric, 'intervalUnit', v)}
                              >
                                <SelectTrigger className="h-9">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {INTERVAL_UNITS.map((u) => (
                                    <SelectItem key={u} value={u}>{INTERVAL_UNIT_LABELS[u]}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>
                        {config.intervalValue && config.intervalUnit && (
                          <p className="mt-2 text-xs font-medium text-cyan-700">
                            {formatIntervalReadable(parseFloat(config.intervalValue), config.intervalUnit)}
                          </p>
                        )}
                        {runTimes.length > 0 && (
                          <div className="mt-2 flex items-center gap-1.5 rounded-md bg-cyan-50/60 px-2 py-1.5 text-xs text-slate-600">
                            <Calendar className="h-3 w-3 text-cyan-500 shrink-0" />
                            <span className="truncate">
                              {runTimes.length} run{runTimes.length !== 1 ? 's' : ''} · {fmtTime(runTimes[0])} → {fmtTime(runTimes[runTimes.length - 1])}
                            </span>
                          </div>
                        )}
                      </div>

                      {runTimes.length > 0 && (() => {
                        const preview = distributionPreview.find((d) => d.metric === metric);
                        if (!preview) return null;
                        const sumOk = preview.sum === preview.target;
                        return (
                          <div className="rounded-lg border border-slate-100 bg-white p-2.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-slate-600">Per-run distribution</span>
                              <span className={`text-xs font-bold ${sumOk ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {formatNumber(preview.sum)} / {formatNumber(preview.target)}
                              </span>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1">
                              {preview.dist.map((q, i) => (
                                <span
                                  key={i}
                                  className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${q === 0 ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-600'}`}
                                  title={`Run ${i + 1}`}
                                >
                                  {formatNumber(q)}
                                </span>
                              ))}
                            </div>
                            {!sumOk && (
                              <p className="mt-1.5 text-xs text-rose-500">
                                Total must be between {formatNumber(preview.min * runTimes.length)} and {formatNumber(preview.max * runTimes.length)} for {runTimes.length} runs. Try reducing runs or increasing quantity.
                              </p>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Show unavailable metrics */}
            {unavailableMetrics.length > 0 && availableMetrics.length > 0 && (
              <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-3">
                <p className="mb-1.5 text-xs font-medium text-slate-500">Not available from this provider on {platform}:</p>
                <div className="flex flex-wrap gap-1.5">
                  {unavailableMetrics.map((m) => {
                    const Icon = METRIC_ICONS[m];
                    return (
                      <span key={m} className="flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-400">
                        <Icon className="h-3 w-3" /> {METRIC_LABELS[m]}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* No services at all */}
            {availableServices.length === 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>No services found for {platform}. Try syncing services from your provider, or select a different platform.</span>
              </div>
            )}
          </div>

          {/* Total summary bar */}
          <div className="mt-4 flex items-center justify-between rounded-xl bg-gradient-to-r from-slate-900 to-slate-800 px-4 py-3.5">
            <span className="text-sm font-medium text-slate-300">
              {enabledMetrics.length} metrics · {totalRuns} total runs
            </span>
            <div className="text-right shrink-0">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Total Est. Charge</p>
              <p className="text-xl font-bold text-white">{formatCurrency(totalEstimatedCost)}</p>
            </div>
          </div>
        </Card>

        <div className="flex flex-col gap-2">
          <Button
            type="submit"
            disabled={saving || !canSubmit}
            className="w-full h-11 bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500 transition-all hover:shadow-lg hover:shadow-cyan-500/20 disabled:opacity-40 disabled:shadow-none"
          >
            <Save className="mr-2 h-4 w-4" />
            Review & Confirm
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowPreview(true)}
              disabled={enabledMetrics.length === 0}
              className="flex-1 h-10 border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              <EyeOff className="mr-2 h-4 w-4" />
              Preview Request
            </Button>
            <Button type="button" variant="outline" onClick={() => router.push('/engagement-orders')} className="flex-1 h-10 border-slate-200 text-slate-600 hover:bg-slate-50">Cancel</Button>
          </div>
        </div>
      </form>

      {/* Preview dialog (no API call) */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-[calc(100vw-2rem)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <EyeOff className="h-5 w-5 text-slate-500" />
              Order Preview (no submission)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            <div className="rounded-xl bg-slate-50 p-3 space-y-1.5 text-sm">
              <div className="flex justify-between gap-2"><span className="text-slate-500 shrink-0">Order</span><span className="font-medium text-slate-800 truncate text-right">{name || 'Untitled'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Platform</span><span className="font-medium text-slate-800">{platform}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Target URL</span><span className="font-medium text-slate-800 truncate max-w-[60%] text-right">{postUrl || profileUrl || channelUrl || '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Total Runs</span><span className="font-medium text-slate-800">{totalRuns}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Total Est. Charge</span><span className="font-bold text-slate-900">{formatCurrency(totalEstimatedCost)}</span></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Est. completion</span><span className="font-semibold text-slate-800 text-right">{estimatedCompletionAt ? formatDateTime(estimatedCompletionAt.toISOString()) : 'Set a start time'}</span></div>
              {balanceInfo && (
                <div className="flex justify-between"><span className="text-slate-500">Provider Balance</span><span className={`font-medium ${balanceInfo.isSynced ? 'text-slate-700' : 'text-slate-400'}`}>{balanceInfo.text}</span></div>
              )}
            </div>
            {confirmItems.map(({ metric, config, svc, qty, cost, runs, intervalStr, Icon }) => (
              <div key={metric} className="rounded-lg border border-slate-100 p-2.5 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5 text-cyan-500 shrink-0" />
                  <span className="text-sm font-medium text-slate-700">{METRIC_LABELS[metric]}</span>
                  <span className="ml-auto text-xs text-slate-500 shrink-0">{formatNumber(qty)} · {formatCurrency(cost)}</span>
                </div>
                {svc && (
                  <p className="text-xs text-slate-500 break-words leading-snug pl-5">{svc.name}</p>
                )}
                {svc && (
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-400 pl-5">
                    <span>Service ID: {svc.external_service_id}</span>
                    <span>Min: {formatNumber(svc.min_quantity)}</span>
                    <span>Max: {formatNumber(svc.max_quantity)}</span>
                  </div>
                )}
                <div className="flex items-center gap-1 text-xs text-slate-400 pl-5">
                  <Clock className="h-3 w-3 shrink-0" />
                  {runs} runs · {intervalStr}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreview(false)} className="w-full">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="max-w-[calc(100vw-2rem)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Confirm Order
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            <div className="rounded-xl bg-slate-50 p-3 space-y-1.5 text-sm">
              <div className="flex justify-between gap-2"><span className="text-slate-500 shrink-0">Order</span><span className="font-medium text-slate-800 truncate text-right">{name}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Platform</span><span className="font-medium text-slate-800">{platform}</span></div>
              <div className="flex justify-between gap-2"><span className="text-slate-500 shrink-0">Target</span><span className="font-medium text-slate-800 truncate text-right max-w-[60%]">{postUrl || profileUrl || channelUrl || '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Metrics</span><span className="font-medium text-slate-800">{enabledMetrics.length}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Total Runs</span><span className="font-medium text-slate-800">{totalRuns}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Total Est. Charge</span><span className="font-bold text-slate-900">{formatCurrency(totalEstimatedCost)}</span></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Est. completion</span><span className="font-semibold text-slate-800 text-right">{estimatedCompletionAt ? formatDateTime(estimatedCompletionAt.toISOString()) : 'Set a start time'}</span></div>
              {balanceInfo && (
                <div className="flex justify-between"><span className="text-slate-500">Provider Balance</span><span className={`font-medium ${balanceInfo.isSynced ? 'text-slate-700' : 'text-slate-400'}`}>{balanceInfo.text}</span></div>
              )}
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-slate-600">Per-Metric Summary</p>
              {confirmItems.map(({ metric, svc, qty, cost, runs, intervalStr, Icon }) => (
                <div key={metric} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-2 text-xs">
                  <Icon className="h-3.5 w-3.5 text-cyan-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-medium text-slate-700 truncate">{METRIC_LABELS[metric]}</span>
                      <span className="text-slate-500 shrink-0">{formatNumber(qty)} · {formatCurrency(cost)}</span>
                    </div>
                    {svc && <p className="text-[10px] text-slate-400 truncate">{svc.name}</p>}
                    <div className="mt-0.5 flex items-center gap-1 text-slate-400">
                      <Clock className="h-3 w-3 shrink-0" />
                      {runs} runs · {intervalStr}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-700">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>No engagement is sent at the moment you confirm. Every metric is queued for its first interval, then submitted in small batches when each planned time arrives. Runs remain WAITING until the background scheduler reaches them.</span>
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setShowConfirm(false)} className="w-full sm:w-auto">Back</Button>
            <Button onClick={handleSubmit} disabled={saving} className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500 sm:w-auto">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Confirm & Create
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
