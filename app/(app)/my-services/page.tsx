'use client';

import { useEffect, useState, useCallback } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  Star,
  CheckCircle2,
  AlertCircle,
  Eye,
  Heart,
  MessageCircle,
  Share2,
  Repeat2,
  Bookmark,
  Users,
  Youtube,
  Search,
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
  formatNumber,
  formatProviderRate,
} from '@/lib/format';
import type { Provider, ProviderService, MetricKey, FavoriteService } from '@/lib/types';
import { METRIC_LABELS, METRIC_KEYS, PLATFORMS } from '@/lib/types';
import { ServiceDetailsSheet } from '@/components/service-details-sheet';

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

const ALL_METRICS: MetricKey[] = ['views', 'likes', 'comments', 'shares', 'reposts', 'saves', 'followers', 'subscribers'];

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

export default function MyServicesPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [services, setServices] = useState<ProviderService[]>([]);
  const [favorites, setFavorites] = useState<FavoriteService[]>([]);
  const [loading, setLoading] = useState(true);
  const [providerId, setProviderId] = useState('');
  const [platform, setPlatform] = useState('Instagram');
  const [searchQuery, setSearchQuery] = useState('');
  const [detailsService, setDetailsService] = useState<ProviderService | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

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
    toast.success(newDefault ? `Set as default for ${METRIC_LABELS[svcMetric as MetricKey]}` : 'Removed default');
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

  const availableServices = services.filter(
    (s) => s.provider_id === providerId && (s.manual_platform ?? s.platform) === platform,
  );

  const PLATFORM_ORDER: Record<string, number> = {
    'YouTube': 0, 'TikTok': 1, 'Instagram': 2, 'Facebook': 3, 'Twitter/X': 4,
    'Telegram': 5, 'Twitch': 6, 'Website': 7, 'Other': 99,
  };
  const platforms = Array.from(new Set(services
    .filter((s) => s.provider_id === providerId)
    .map((s) => s.manual_platform ?? s.platform)
    .filter((p): p is string => Boolean(p) && PLATFORMS.includes(p)),
  )).sort((a, b) => (PLATFORM_ORDER[a] ?? 50) - (PLATFORM_ORDER[b] ?? 50) || a.localeCompare(b));

  const servicesForMetric = (metric: MetricKey) => {
    let list = availableServices.filter((s) => (s.manual_metric ?? s.metric) === metric);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((s) =>
        s.name.toLowerCase().includes(q) ||
        (s.service_type ?? '').toLowerCase().includes(q) ||
        (s.service_category ?? '').toLowerCase().includes(q),
      );
    }
    return list;
  };

  const defaultForMetric = (metric: MetricKey): FavoriteService | undefined =>
    favorites.find((f) => f.is_default && f.metric === metric && (f.platform ?? '') === platform && f.provider_id === providerId);

  const defaultServiceForMetric = (metric: MetricKey): ProviderService | undefined => {
    const def = defaultForMetric(metric);
    if (!def) return undefined;
    return services.find(
      (s) => s.provider_id === def.provider_id && s.external_service_id === def.external_service_id,
    );
  };

  const favCountForMetric = (metric: MetricKey) =>
    favorites.filter((f) => f.metric === metric && f.provider_id === providerId).length;

  const totalDefaults = ALL_METRICS.filter((m) => defaultForMetric(m)).length;

  // Metrics that have services for this provider+platform
  const availableMetrics = ALL_METRICS.filter((metric) =>
    availableServices.some((s) => (s.manual_metric ?? s.metric) === metric),
  );
  const unavailableMetrics = ALL_METRICS.filter((metric) =>
    !availableServices.some((s) => (s.manual_metric ?? s.metric) === metric),
  );

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  }

  return (
    <>
      <PageHeader
        title="My Services"
        description="Pick your preferred service for each engagement metric"
      />

      {/* Provider + Platform + Search */}
      <Card className="border-slate-200/80 p-4 shadow-sm shadow-slate-200/50 mb-4">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Provider</Label>
            <Select value={providerId} onValueChange={setProviderId}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                {providers.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}{p.kind === 'mock' ? ' (Mock)' : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Platform pills */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Platform</Label>
            <div className="flex flex-wrap gap-1.5">
              {PLATFORMS.map((p) => {
                const Icon = PLATFORM_ICONS[p] ?? Film;
                const isSelected = platform === p;
                const count = services.filter((s) => s.provider_id === providerId && (s.manual_platform ?? s.platform) === p).length;
                return (
                  <button
                    key={p}
                    onClick={() => setPlatform(p)}
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-200 ${
                      isSelected
                        ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-sm shadow-cyan-500/25'
                        : count > 0
                          ? 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
                          : 'bg-slate-50 text-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    {p}
                    {count > 0 && (
                      <span className={`text-[10px] tabular-nums ${isSelected ? 'text-white/70' : 'text-slate-400'}`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search services by name, type or category..."
              className="h-10 pl-9 border-slate-200 focus:border-cyan-400 focus:ring-cyan-400/20"
            />
          </div>
        </div>
      </Card>

      {/* Progress summary */}
      <div className="mb-4 flex items-center justify-between rounded-xl bg-gradient-to-r from-slate-900 to-slate-800 px-4 py-3.5">
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-medium text-slate-200">
            {totalDefaults} of {availableMetrics.length} defaults set
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          {ALL_METRICS.map((m) => {
            const hasDefault = Boolean(defaultForMetric(m));
            const hasServices = availableMetrics.includes(m);
            const Icon = METRIC_ICONS[m];
            return (
              <div
                key={m}
                className={`flex h-7 w-7 items-center justify-center rounded-full transition-all ${!hasServices ? 'bg-slate-700/40 text-slate-500' : hasDefault ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30' : 'bg-slate-700/50 text-slate-400'}`}
                title={METRIC_LABELS[m]}
              >
                <Icon className="h-3.5 w-3.5" />
              </div>
            );
          })}
        </div>
      </div>

      {/* Per-metric service selection */}
      <div className="space-y-3">
        {availableMetrics.map((metric) => {
          const matching = servicesForMetric(metric);
          const favs = matching.filter((s) => isFav(s));
          const nonFavs = matching.filter((s) => !isFav(s));
          const currentDefault = defaultServiceForMetric(metric);
          const Icon = METRIC_ICONS[metric];
          const favCount = favCountForMetric(metric);

          return (
            <Card key={metric} className="border-slate-200/80 p-4 shadow-sm shadow-slate-200/50">
              <div className="flex items-center gap-2 mb-3">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all ${currentDefault ? 'bg-emerald-100 ring-1 ring-emerald-200' : 'bg-slate-100'}`}>
                  <Icon className={`h-4 w-4 ${currentDefault ? 'text-emerald-600' : 'text-slate-400'}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-slate-800">{METRIC_LABELS[metric]}</h3>
                  <p className="text-xs text-slate-500">
                    {matching.length} service{matching.length !== 1 ? 's' : ''} available
                    {favCount > 0 && ` · ${favCount} favorited`}
                  </p>
                </div>
                {currentDefault ? (
                  <Badge className="shrink-0 bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
                    <CheckCircle2 className="mr-0.5 h-3 w-3" /> Default set
                  </Badge>
                ) : (
                  <Badge variant="outline" className="shrink-0 text-xs text-slate-400">No default</Badge>
                )}
              </div>

              {currentDefault && (
                <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-2.5">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-700 break-words leading-snug">{currentDefault.name}</p>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
                        <span>{formatProviderRate(currentDefault)}</span>
                        <span>Min: {formatNumber(currentDefault.min_quantity)}</span>
                        <span>Max: {formatNumber(currentDefault.max_quantity)}</span>
                        {currentDefault.refill_supported && <span className="text-emerald-600">Refill</span>}
                        {currentDefault.cancel_supported && <span>Cancel</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => openDetails(currentDefault)}
                      className="shrink-0 text-cyan-600 hover:text-cyan-700"
                      title="Details"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}

              <Separator className="bg-slate-100 mb-3" />

              {matching.length === 0 ? (
                <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-700">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>No services found for {METRIC_LABELS[metric]} on {platform}. Try a different platform or sync services from your provider.</span>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {favs.length > 0 && (
                    <>
                      <p className="text-xs font-semibold text-amber-600 sticky top-0 bg-white py-1">
                        <Star className="mr-1 inline h-3 w-3 fill-amber-400 text-amber-500" />
                        My Services ({favs.length})
                      </p>
                      {favs.map((s) => {
                        const isDef = isDefaultForMetric(s);
                        return (
                          <ServiceRow
                            key={s.id}
                            service={s}
                            isFav
                            isDefault={isDef}
                            onToggleFav={() => toggleFavorite(s)}
                            onToggleDefault={() => toggleDefault(s)}
                            onOpenDetails={() => openDetails(s)}
                          />
                        );
                      })}
                      {nonFavs.length > 0 && (
                        <p className="text-xs font-semibold text-slate-500 sticky top-0 bg-white py-1 pt-2">
                          Browse All Services ({nonFavs.length})
                        </p>
                      )}
                    </>
                  )}
                  {favs.length === 0 && nonFavs.length > 0 && (
                    <p className="text-xs text-slate-400 py-1">
                      No favorites yet. Tap the star on a service to add it.
                    </p>
                  )}
                  {nonFavs.map((s) => (
                    <ServiceRow
                      key={s.id}
                      service={s}
                      isFav={false}
                      isDefault={false}
                      onToggleFav={() => toggleFavorite(s)}
                      onToggleDefault={() => toggleDefault(s)}
                      onOpenDetails={() => openDetails(s)}
                    />
                  ))}
                </div>
              )}
            </Card>
          );
        })}

        {/* Unavailable metrics */}
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

        {availableMetrics.length === 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>No services found for {platform}. Try syncing services from your provider, or select a different platform.</span>
          </div>
        )}
      </div>

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

function ServiceRow({
  service,
  isFav,
  isDefault,
  onToggleFav,
  onToggleDefault,
  onOpenDetails,
}: {
  service: ProviderService;
  isFav: boolean;
  isDefault: boolean;
  onToggleFav: () => void;
  onToggleDefault: () => void;
  onOpenDetails: () => void;
}) {
  return (
    <div className={`flex items-start gap-2 rounded-lg border p-2 transition-colors ${isDefault ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-100 bg-white hover:bg-slate-50'}`}>
      <button
        onClick={onToggleFav}
        className="mt-0.5 shrink-0"
        title={isFav ? 'Remove from favorites' : 'Add to favorites'}
      >
        <Star className={`h-4 w-4 ${isFav ? 'fill-amber-400 text-amber-500' : 'text-slate-300 hover:text-amber-400'}`} />
      </button>

      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-slate-700 break-words leading-snug">{service.name}</p>
        <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
          <span>{formatProviderRate(service)}</span>
          <span>Min: {formatNumber(service.min_quantity)}</span>
          <span>Max: {formatNumber(service.max_quantity)}</span>
          {service.refill_supported && <span className="text-emerald-600">Refill</span>}
          {service.cancel_supported && <span>Cancel</span>}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {isFav && (
          <button
            onClick={onToggleDefault}
            className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${isDefault ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600 hover:bg-cyan-50 hover:text-cyan-700'}`}
            title={isDefault ? 'Remove as default' : 'Set as default for this metric'}
          >
            {isDefault ? 'Default' : 'Set Default'}
          </button>
        )}
        <button
          onClick={onOpenDetails}
          className="text-cyan-600 hover:text-cyan-700"
          title="Details"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
