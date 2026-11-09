'use client';

import { useEffect, useState, useCallback } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Server,
  PlusCircle,
  RefreshCw,
  Loader2,
  Trash2,
  Pencil,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Download,
  Key,
  CheckCircle2,
  Star,
  Info,
  Plug,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { createClient, fetchAllRows } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { formatCurrency, formatDate, formatNumber, formatProviderRate, formatBalanceDisplay } from '@/lib/format';
import type { Provider, ProviderService, ProviderKind, ProviderStatus, MetricKey, FavoriteService } from '@/lib/types';
import { METRIC_LABELS, PLATFORMS } from '@/lib/types';
import { classifyService } from '@/lib/service-classification';
import { ServiceDetailsSheet } from '@/components/service-details-sheet';

export default function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [services, setServices] = useState<ProviderService[]>([]);
  const [favorites, setFavorites] = useState<FavoriteService[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [form, setForm] = useState({ name: '', slug: '', kind: 'external' as ProviderKind, status: 'active' as ProviderStatus, balance: '', apiKey: '', conversionRate: '', apiUrl: '' });
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [keyStatus, setKeyStatus] = useState<Record<string, boolean>>({});
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [detailsService, setDetailsService] = useState<ProviderService | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const loadData = useCallback(async () => {
    const supabase = createClient();
    const [p, s, favs] = await Promise.all([
      fetchAllRows<Provider>(supabase, 'providers'),
      fetchAllRows<ProviderService>(supabase, 'provider_services'),
      fetchAllRows<FavoriteService>(supabase, 'favorite_services'),
    ]);
    const sortedProviders = [...p].sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
    const sortedServices = [...s].sort((a, b) => (a.platform ?? '').localeCompare(b.platform ?? '') || (a.metric ?? '').localeCompare(b.metric ?? ''));
    setProviders(sortedProviders);
    setServices(sortedServices);
    setFavorites(favs);
    const extProviders = sortedProviders;
    const keyResults: Record<string, boolean> = {};
    await Promise.all(
      extProviders
        .filter((prov) => prov.kind === 'external')
        .map(async (prov) => {
          const { data } = await supabase.rpc('has_provider_api_key', { p_provider_id: prov.id });
          keyResults[prov.id] = Boolean(data);
        }),
    );
    setKeyStatus(keyResults);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

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
    toast.success(newDefault ? 'Set as default for this metric' : 'Removed default');
  };

  const openDetails = (svc: ProviderService) => {
    setDetailsService(svc);
    setDetailsOpen(true);
  };

  const openAdd = () => {
    setEditingProvider(null);
    setForm({ name: '', slug: '', kind: 'external', status: 'active', balance: '', apiKey: '', conversionRate: '', apiUrl: '' });
    setDialogOpen(true);
  };

  const openEdit = (p: Provider) => {
    setEditingProvider(p);
    setForm({
      name: p.name, slug: p.slug, kind: p.kind, status: p.status,
      balance: String(Number(p.balance_paise) / 100),
      apiKey: '',
      conversionRate: p.conversion_rate_to_inr ? String(p.conversion_rate_to_inr) : '',
      apiUrl: p.api_url ?? '',
    });
    setDialogOpen(true);
  };

  const saveProvider = async () => {
    const supabase = createClient();
    const slug = form.slug || form.name.toLowerCase().replace(/\s+/g, '-');
    const balancePaise = Math.round(parseFloat(form.balance || '0') * 100);
    const conversionRate = form.conversionRate ? parseFloat(form.conversionRate) : null;
    if (!form.name) { toast.error('Provider name is required'); return; }

    if (editingProvider) {
      const { error } = await supabase.from('providers').update({
        name: form.name, kind: form.kind, status: form.status,
        balance_paise: balancePaise, updated_at: new Date().toISOString(),
        conversion_rate_to_inr: conversionRate,
        api_url: form.apiUrl || null,
      }).eq('id', editingProvider.id);
      if (error) { toast.error('Failed to update'); return; }
      if (form.kind === 'external' && form.apiKey) {
        const { error: keyError } = await supabase.rpc('set_provider_api_key', {
          p_provider_id: editingProvider.id,
          p_api_key: form.apiKey,
        });
        if (keyError) { toast.error('Failed to save API key'); return; }
        toast.success('API key saved');
      }
      toast.success('Provider updated');
    } else {
      const { data: newProvider, error } = await supabase.from('providers').insert({
        name: form.name, slug, kind: form.kind, status: form.status, balance_paise: balancePaise,
        conversion_rate_to_inr: conversionRate,
        api_url: form.apiUrl || null,
      }).select('id').single();
      if (error || !newProvider) { toast.error('Failed to create'); return; }
      if (form.kind === 'external' && form.apiKey) {
        const { error: keyError } = await supabase.rpc('set_provider_api_key', {
          p_provider_id: (newProvider as { id: string }).id,
          p_api_key: form.apiKey,
        });
        if (keyError) { toast.error('Failed to save API key'); return; }
      }
      toast.success('Provider created');
    }
    setDialogOpen(false);
    loadData();
  };

  const deleteProvider = async (p: Provider) => {
    const supabase = createClient();
    const { error } = await supabase.from('providers').delete().eq('id', p.id);
    if (error) { toast.error('Failed to delete'); return; }
    toast.success('Provider deleted');
    loadData();
  };

  const refreshBalance = async (p: Provider) => {
    setRefreshing(p.id);
    const supabase = createClient();
    try {
        const apiUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/cheapestsmm-proxy`;
        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ action: 'balance', provider_id: p.id }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const errMsg = errData.error || 'Failed to fetch balance';
          await supabase.from('providers').update({
            last_balance_error: errMsg, updated_at: new Date().toISOString(),
          }).eq('id', p.id);
          toast.error(errMsg);
          setRefreshing(null);
          loadData();
          return;
        }
        const data = await res.json();
        if (data.error) {
          await supabase.from('providers').update({
            last_balance_error: data.error, updated_at: new Date().toISOString(),
          }).eq('id', p.id);
          toast.error(data.error);
          setRefreshing(null);
          loadData();
          return;
        }
        const balance = parseFloat(data.balance ?? '0');
        const currency = String(data.currency ?? 'USD');
        const balancePaise = Math.round(balance * 100);
        await supabase.from('providers').update({
          balance_paise: balancePaise,
          currency,
          last_balance_at: new Date().toISOString(),
          last_balance_error: null,
          updated_at: new Date().toISOString(),
        }).eq('id', p.id);
        await supabase.from('provider_balance_snapshots').insert({
          provider_id: p.id, balance_paise: balancePaise, currency,
        });
        toast.success(`Balance: ${currency} ${balance.toFixed(2)}`);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Network error';
        await supabase.from('providers').update({
          last_balance_error: errMsg, updated_at: new Date().toISOString(),
        }).eq('id', p.id);
        toast.error('Failed to refresh balance — add your API key in the provider settings first');
      }
    setRefreshing(null);
    loadData();
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

  const testApiConnection = async (p: Provider) => {
    if (p.kind !== 'external') { toast.info('Test is for external providers only'); return; }
    setTesting(p.id);
    try {
      const apiUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/cheapestsmm-proxy`;
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ action: 'balance', provider_id: p.id }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        toast.error(`Connection failed: ${errData.error || res.statusText}`);
      } else {
        const data = await res.json();
        if (data.error) { toast.error(`API error: ${data.error}`); }
        else { toast.success(`Connection OK — balance: ${data.currency ?? ''} ${data.balance ?? '?'}`); }
      }
    } catch {
      toast.error('Failed to reach API — check your API key and network');
    }
    setTesting(null);
  };

  const syncServices = async (p: Provider) => {
    if (p.kind !== 'external') { toast.info('Service sync is for external providers only'); return; }
    setSyncing(p.id);
    const supabase = createClient();
    try {
      const apiUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/cheapestsmm-proxy`;
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ action: 'services', provider_id: p.id }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || 'Failed to fetch services'); setSyncing(null); return;
      }
      const data = await res.json();
      if (data.error) { toast.error(data.error); setSyncing(null); return; }
      if (!Array.isArray(data)) { toast.error('Unexpected services response'); setSyncing(null); return; }

      let added = 0;
      let updated = 0;
      let unchanged = 0;
      const beforeCount = services.filter((s) => s.provider_id === p.id).length;
      for (const svc of data as Record<string, unknown>[]) {
        const externalId = String(svc.service ?? '');
        const name = String(svc.name ?? 'Unknown');
        const type = String(svc.type ?? '');
        const category = String(svc.category ?? '');
        const rate = parseFloat(String(svc.rate ?? '0'));
        const min = parseInt(String(svc.min ?? '1'), 10);
        const max = parseInt(String(svc.max ?? '1000000'), 10);
        const refillStr = String(svc.refill ?? '0');
        const cancelStr = String(svc.cancel ?? '0');
        const classified = classifyService(name, category);

        const { data: existing } = await supabase
          .from('provider_services')
          .select('id')
          .eq('provider_id', p.id)
          .eq('external_service_id', externalId)
          .maybeSingle();

        // Respect manual overrides — don't overwrite platform/metric if manual override exists
        const existingSvc = services.find((s) => s.id === existing?.id);
        const hasManualOverride = existingSvc?.manual_platform || existingSvc?.manual_metric;

        const serviceData = {
          provider_id: p.id,
          name,
          platform: hasManualOverride ? existingSvc!.platform : classified.platform,
          metric: hasManualOverride ? existingSvc!.metric : classified.metric,
          min_quantity: isNaN(min) ? 1 : Math.max(1, min),
          max_quantity: isNaN(max) ? 1000000 : Math.max(1, max),
          rate_paise_per_1000: Math.round(rate * 100),
          refill_days: 0,
          active: true,
          external_service_id: externalId,
          service_type: type,
          service_category: category,
          rate_usd: isNaN(rate) ? null : rate,
          refill_supported: refillStr === '1' || refillStr.toLowerCase() === 'true',
          cancel_supported: cancelStr === '1' || cancelStr.toLowerCase() === 'true',
          raw_data: svc,
          // Preserve manual overrides and source
          manual_platform: existingSvc?.manual_platform ?? null,
          manual_metric: existingSvc?.manual_metric ?? null,
          classification_source: hasManualOverride ? 'manual' : 'inferred',
        };

        if (existing) {
          await supabase.from('provider_services').update(serviceData).eq('id', existing.id);
          updated++;
        } else {
          await supabase.from('provider_services').insert(serviceData);
          added++;
        }
      }
      const afterCount = beforeCount + added;
      const diff = added > 0 ? ` (+${added} new)` : '';
      toast.success(`Synced ${added + updated} services${diff}`);
      loadData();
    } catch {
      toast.error('Failed to sync services — add your API key in the provider settings first');
    }
    setSyncing(null);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  }

  return (
    <>
      <PageHeader title="Providers & Services" description="Manage providers and service catalogues">
        <Button onClick={openAdd} className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500">
          <PlusCircle className="mr-2 h-4 w-4" /> Add Provider
        </Button>
      </PageHeader>

      <div className="space-y-3">
        {providers.map((p) => {
          const providerServices = services.filter((s) => s.provider_id === p.id);
          const platforms = ['all', ...Array.from(new Set(providerServices.map((s) => s.manual_platform ?? s.platform)
            .filter((pf): pf is string => Boolean(pf) && PLATFORMS.includes(pf))))].sort();
          const filteredServices = platformFilter === 'all'
            ? providerServices
            : providerServices.filter((s) => (s.manual_platform ?? s.platform) === platformFilter);
          const isExpanded = expandedId === p.id;
          const balanceInfo = formatBalanceDisplay(
            p.balance_paise, p.currency, p.last_balance_at, p.conversion_rate_to_inr,
          );
          return (
            <Card key={p.id} className="border-slate-200 p-3 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50">
                  <Server className="h-4 w-4 text-indigo-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="truncate text-sm font-semibold text-slate-800">{p.name}</h3>
                    <Badge className={p.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 text-xs' : 'bg-rose-50 text-rose-700 border-rose-200 text-xs'} variant="outline">{p.status.toUpperCase()}</Badge>
                  </div>
                  {/* Balance display */}
                  <div className="mt-0.5">
                    <span className={`text-xs font-medium ${balanceInfo.isSynced ? 'text-slate-600' : 'text-slate-400'}`}>
                      Balance: {balanceInfo.text}
                    </span>
                    {balanceInfo.sub && (
                      <span className="ml-1.5 text-xs text-slate-400">{balanceInfo.sub}</span>
                    )}
                  </div>
                  <p className="truncate text-xs text-slate-400">
                    {balanceInfo.isSynced ? `Last sync: ${formatDate(p.last_balance_at)}` : 'Never synced'}
                  </p>
                  {p.last_balance_error && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-rose-500">
                      <AlertCircle className="h-3 w-3 shrink-0" />
                      <span className="truncate">Sync error: {p.last_balance_error}</span>
                    </p>
                  )}
                  {p.kind === 'external' && (
                    <p className={`mt-0.5 flex items-center gap-1 text-xs ${keyStatus[p.id] ? 'text-emerald-600' : 'text-rose-500'}`}>
                      {keyStatus[p.id] ? <CheckCircle2 className="h-3 w-3 shrink-0" /> : <AlertCircle className="h-3 w-3 shrink-0" />}
                      {keyStatus[p.id] ? 'API key set' : 'No API key — click edit to add'}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => refreshBalance(p)} disabled={refreshing === p.id} className="flex-1">
                  {refreshing === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Balance
                </Button>
                {p.kind === 'external' && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => testApiConnection(p)} disabled={testing === p.id} className="flex-1">
                      {testing === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />}
                      Test
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => syncServices(p)} disabled={syncing === p.id} className="flex-1">
                      {syncing === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                      Sync
                    </Button>
                  </>
                )}
                <Button size="sm" variant="outline" onClick={() => openEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button size="sm" variant="outline" className="text-rose-600 hover:text-rose-700" onClick={() => deleteProvider(p)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>

              <button
                onClick={() => { setExpandedId(isExpanded ? null : p.id); setPlatformFilter('all'); }}
                className="mt-3 flex w-full items-center justify-between border-t border-slate-100 pt-2 text-xs font-medium text-slate-600"
              >
                <span>Services ({providerServices.length})</span>
                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>

              {isExpanded && (
                <div className="mt-2 space-y-2">
                  {platforms.length > 2 && (
                    <div className="flex flex-wrap gap-1">
                      {platforms.map((pf) => (
                        <button
                          key={pf}
                          onClick={() => setPlatformFilter(pf)}
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
                            platformFilter === pf
                              ? 'bg-cyan-500 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {pf === 'all' ? 'All' : pf}
                        </button>
                      ))}
                    </div>
                  )}
                  {filteredServices.length === 0 ? (
                    <p className="text-xs text-slate-400">No services configured. {p.kind === 'external' && 'Click Sync to pull services from the API.'}</p>
                  ) : (
                    filteredServices.map((s) => (
                      <div key={s.id} className="rounded bg-slate-50 p-2">
                        <div className="flex items-start gap-1.5">
                          <button
                            onClick={() => toggleFavorite(s)}
                            className="mt-0.5 shrink-0"
                            title={isFav(s) ? 'Remove from favorites' : 'Add to favorites'}
                          >
                            <Star className={`h-3.5 w-3.5 ${isFav(s) ? 'fill-amber-400 text-amber-500' : 'text-slate-300 hover:text-amber-400'}`} />
                          </button>
                          <p className="flex-1 text-xs font-medium text-slate-700 break-words leading-snug">{s.name}</p>
                          <button
                            onClick={() => openDetails(s)}
                            className="mt-0.5 shrink-0 text-cyan-600 hover:text-cyan-700"
                            title="Service details"
                          >
                            <Info className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <span className="rounded bg-cyan-50 px-1.5 py-0.5 text-[10px] font-medium text-cyan-700">{s.manual_platform ?? s.platform}</span>
                          <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">{METRIC_LABELS[(s.manual_metric ?? s.metric) as MetricKey]}</span>
                          {isFav(s) && isDefaultForMetric(s) && (
                            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">Default</span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
                          <span>{formatNumber(s.min_quantity)}–{formatNumber(s.max_quantity)}</span>
                          <span>{formatProviderRate(s)}</span>
                          {s.refill_supported && <span className="text-emerald-600">Refill</span>}
                          {s.cancel_supported && <span className="text-slate-500">Cancel</span>}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain">
          <DialogHeader><DialogTitle>{editingProvider ? 'Edit Provider' : 'Add Provider'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="p-name">Name</Label>
              <Input id="p-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="My Provider" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="p-kind">Type</Label>
                <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as ProviderKind })}>
                  <SelectTrigger id="p-kind"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="external">External (API)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-status">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as ProviderStatus })}>
                  <SelectTrigger id="p-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-balance">Balance (INR)</Label>
              <Input id="p-balance" type="number" value={form.balance} onChange={(e) => setForm({ ...form, balance: e.target.value })} placeholder="0.00" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-conversion">Currency to INR Conversion Rate (optional)</Label>
              <Input
                id="p-conversion"
                type="number"
                step="0.01"
                value={form.conversionRate}
                onChange={(e) => setForm({ ...form, conversionRate: e.target.value })}
                placeholder="e.g. 83.5 for USD to INR"
              />
              <p className="text-xs text-slate-400">
                If the provider&apos;s currency is not INR, enter the conversion rate to show an INR equivalent.
              </p>
            </div>
            {form.kind === 'external' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="p-apiurl">SMM Panel API URL</Label>
                  <Input
                    id="p-apiurl"
                    type="url"
                    value={form.apiUrl}
                    onChange={(e) => setForm({ ...form, apiUrl: e.target.value })}
                    placeholder="https://cheapestsmmpanels.com/api/v2"
                  />
                  <p className="text-xs text-slate-400">
                    Enter your SMM panel&apos;s API endpoint URL. Leave blank to use the default (CheapestSMM).
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p-apikey">SMM Panel API Key</Label>
                  <Input
                    id="p-apikey"
                    type="password"
                    value={form.apiKey}
                    onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                    placeholder={editingProvider && keyStatus[editingProvider.id] ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022 (enter new key to replace)' : 'Paste your SMM panel API key here'}
                  />
                  <div className="flex items-start gap-2 rounded-lg border border-cyan-200 bg-cyan-50 p-2.5 text-xs text-cyan-700">
                    <Key className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>Your API key is stored securely in the database and never sent to the browser. Paste it here, click Save, then use Sync to pull services or Balance to check your account.</span>
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter className="sticky bottom-0 flex-col gap-2 bg-background pt-2 sm:flex-row">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="w-full sm:w-auto">Cancel</Button>
            <Button onClick={saveProvider} className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500 sm:w-auto">
              {editingProvider ? 'Save' : 'Create'}
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
