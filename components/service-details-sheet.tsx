'use client';

import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Star, RefreshCw, CheckCircle2, XCircle, Info, Tag, Calendar } from 'lucide-react';
import type { ProviderService, MetricKey, ClassificationSource } from '@/lib/types';
import { METRIC_LABELS, METRIC_KEYS, PLATFORMS } from '@/lib/types';
import { formatNumber, formatCurrency, formatProviderRate, formatDate } from '@/lib/format';
import { useState } from 'react';

type ServiceDetailsSheetProps = {
  service: ProviderService | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isFavorite: boolean;
  onToggleFavorite: (service: ProviderService) => void;
  isDefault: boolean;
  onToggleDefault: (service: ProviderService) => void;
  onSaveOverride: (service: ProviderService, platform: string, metric: MetricKey) => Promise<void>;
};

const SOURCE_LABELS: Record<ClassificationSource, string> = {
  api: 'API',
  inferred: 'Inferred from name',
  manual: 'Manual override',
};

const SOURCE_COLORS: Record<ClassificationSource, string> = {
  api: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  inferred: 'border-slate-200 bg-slate-50 text-slate-600',
  manual: 'border-amber-200 bg-amber-50 text-amber-700',
};

export function ServiceDetailsSheet({
  service,
  open,
  onOpenChange,
  isFavorite,
  onToggleFavorite,
  isDefault,
  onToggleDefault,
  onSaveOverride,
}: ServiceDetailsSheetProps) {
  const [editPlatform, setEditPlatform] = useState('');
  const [editMetric, setEditMetric] = useState('');
  const [saving, setSaving] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  if (!service) return null;

  const rawData = service.raw_data as Record<string, unknown> | null;
  const description = rawData?.description ? String(rawData.description) : null;
  const source = service.classification_source ?? 'inferred';

  const effectivePlatform = service.manual_platform ?? service.platform;
  const effectiveMetric = (service.manual_metric ?? service.metric) as MetricKey | 'unclassified';

  const handleSave = async () => {
    if (!service) return;
    setSaving(true);
    try {
      await onSaveOverride(service, editPlatform, editMetric as MetricKey);
      setShowEdit(false);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = () => {
    setEditPlatform(effectivePlatform === 'Other' ? 'Other' : effectivePlatform);
    setEditMetric(effectiveMetric === 'unclassified' ? 'views' : effectiveMetric);
    setShowEdit(true);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh] overflow-y-auto">
        <DrawerHeader className="text-left">
          <DrawerTitle className="text-base font-semibold text-slate-800 pr-8">
            {service.name}
          </DrawerTitle>
          <DrawerDescription className="text-xs text-slate-500">
            Service ID: {service.external_service_id ?? '—'}
          </DrawerDescription>
        </DrawerHeader>

        <div className="space-y-3 px-4 pb-6">
          {/* Favorite / default actions */}
          <div className="flex gap-2">
            <button
              onClick={() => onToggleFavorite(service)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                isFavorite
                  ? 'border-amber-300 bg-amber-50 text-amber-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-amber-200 hover:bg-amber-50/40'
              }`}
            >
              <Star className={`h-3.5 w-3.5 ${isFavorite ? 'fill-amber-400 text-amber-500' : ''}`} />
              {isFavorite ? 'Favorited' : 'Add to Favorites'}
            </button>
            {isFavorite && (
              <button
                onClick={() => onToggleDefault(service)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                  isDefault
                    ? 'border-cyan-300 bg-cyan-50 text-cyan-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-cyan-200 hover:bg-cyan-50/40'
                }`}
              >
                <CheckCircle2 className={`h-3.5 w-3.5 ${isDefault ? 'text-cyan-600' : ''}`} />
                {isDefault ? 'Default' : 'Set Default'}
              </button>
            )}
          </div>

          {/* Badges with classification source */}
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className="border-cyan-200 bg-cyan-50 text-cyan-700 text-xs">
              {effectivePlatform}
            </Badge>
            <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700 text-xs">
              {effectiveMetric === 'unclassified' ? 'Unclassified' : METRIC_LABELS[effectiveMetric]}
            </Badge>
            <Badge variant="outline" className={`text-xs ${SOURCE_COLORS[source]}`}>
              <Tag className="mr-0.5 h-2.5 w-2.5" />
              {SOURCE_LABELS[source]}
            </Badge>
            {service.service_type && (
              <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600 text-xs">
                Type: {service.service_type}
              </Badge>
            )}
            {service.service_category && (
              <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600 text-xs">
                {service.service_category}
              </Badge>
            )}
          </div>

          {/* Manual override section */}
          {showEdit ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50/30 p-3 space-y-2">
              <p className="text-xs font-medium text-slate-700">Correct classification</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <span className="text-xs text-slate-500">Platform</span>
                  <Select value={editPlatform} onValueChange={setEditPlatform}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-slate-500">Metric</span>
                  <Select value={editMetric} onValueChange={setEditMetric}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {METRIC_KEYS.map((m) => <SelectItem key={m} value={m}>{METRIC_LABELS[m]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="h-7 text-xs flex-1" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving...' : 'Save Override'}
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowEdit(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <button
              onClick={startEdit}
              className="flex items-center gap-1.5 text-xs text-cyan-600 hover:text-cyan-700"
            >
              <RefreshCw className="h-3 w-3" />
              Correct platform/metric classification
            </button>
          )}

          <Separator />

          {/* Description */}
          {description && (
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-slate-600">Description</span>
              <p className="text-xs text-slate-500 leading-relaxed break-words">{description}</p>
            </div>
          )}

          {/* Key details */}
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Rate</span>
              <span className="font-semibold text-slate-700">{formatProviderRate(service)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Rate (INR)</span>
              <span className="font-medium text-slate-600">{formatCurrency(service.rate_paise_per_1000)} / 1K</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Min quantity</span>
              <span className="font-medium text-slate-700">{formatNumber(service.min_quantity)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Max quantity</span>
              <span className="font-medium text-slate-700">{formatNumber(service.max_quantity)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Refill</span>
              {service.refill_supported ? (
                <span className="flex items-center gap-1 font-medium text-emerald-600">
                  <CheckCircle2 className="h-3 w-3" /> Available
                </span>
              ) : (
                <span className="flex items-center gap-1 text-slate-400">
                  <XCircle className="h-3 w-3" /> Not available
                </span>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Cancel</span>
              {service.cancel_supported ? (
                <span className="flex items-center gap-1 font-medium text-emerald-600">
                  <CheckCircle2 className="h-3 w-3" /> Available
                </span>
              ) : (
                <span className="flex items-center gap-1 text-slate-400">
                  <XCircle className="h-3 w-3" /> Not available
                </span>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Last synced
              </span>
              <span className="font-medium text-slate-600">{formatDate(service.created_at)}</span>
            </div>
          </div>

          <Separator />

          {/* Raw data */}
          {rawData && Object.keys(rawData).length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-xs font-medium text-slate-600">Raw API details</span>
              </div>
              <pre className="rounded-lg bg-slate-50 p-2.5 text-[10px] leading-relaxed text-slate-600 max-h-40 overflow-y-auto break-all whitespace-pre-wrap">
                {JSON.stringify(rawData, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
