'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { classifyService } from '@/lib/service-classification';

/**
 * Auto-syncs provider balances and services when the app loads.
 * Runs once on mount, then every 5 minutes. Fires silently —
 * errors are swallowed so the UI doesn't break if the provider
 * API key isn't configured yet.
 */
export function useAutoSync() {
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const sync = async () => {
      const supabase = createClient();
      const { data: providers } = await supabase
        .from('providers')
        .select('id, kind, status')
        .eq('status', 'active')
        .eq('kind', 'external');

      if (!providers || providers.length === 0) return;

      const apiUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/cheapestsmm-proxy`;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      // Sync each external provider's balance silently
      await Promise.allSettled(
        providers.map(async (p) => {
          try {
            const res = await fetch(apiUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${anonKey}`,
              },
              body: JSON.stringify({ action: 'balance', provider_id: p.id }),
            });
            if (!res.ok) return;
            const data = await res.json();
            if (data.error || !data.balance) return;

            const balance = parseFloat(data.balance);
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
              provider_id: p.id,
              balance_paise: balancePaise,
              currency,
            });
          } catch {
            // Silently skip — user may not have configured API key yet
          }
        }),
      );

      // Sync services for each external provider
      await Promise.allSettled(
        providers.map(async (p) => {
          try {
            const res = await fetch(apiUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${anonKey}`,
              },
              body: JSON.stringify({ action: 'services', provider_id: p.id }),
            });
            if (!res.ok) return;
            const data = await res.json();
            if (data.error || !Array.isArray(data)) return;

            // Fetch existing services to preserve manual overrides
            const { data: existing } = await supabase
              .from('provider_services')
              .select('id, external_service_id, manual_platform, manual_metric, classification_source')
              .eq('provider_id', p.id);

            const existingMap = new Map<string, { id: string; manual_platform: string | null; manual_metric: string | null; classification_source: string | null }>();
            for (const row of (existing ?? [])) {
              existingMap.set(row.external_service_id, row);
            }

            const rows = (data as Record<string, unknown>[]).map((svc) => {
              const externalId = String(svc.service ?? '');
              const name = String(svc.name ?? '');
              const type = String(svc.type ?? '');
              const category = String(svc.category ?? '');
              const rate = parseFloat(String(svc.rate ?? '0'));
              const min = parseInt(String(svc.min ?? '0'), 10);
              const max = parseInt(String(svc.max ?? '0'), 10);
              const refillStr = String(svc.refill ?? '0');
              const cancelStr = String(svc.cancel ?? '0');

              const existingRow = existingMap.get(externalId);
              const hasManualOverride = existingRow?.manual_platform || existingRow?.manual_metric;
              const classified = classifyService(name, category);

              return {
                provider_id: p.id,
                external_service_id: externalId,
                name,
                platform: hasManualOverride ? existingRow!.manual_platform! : classified.platform,
                metric: hasManualOverride ? existingRow!.manual_metric! : classified.metric,
                min_quantity: isNaN(min) ? 0 : Math.max(0, min),
                max_quantity: isNaN(max) ? 0 : Math.max(0, max),
                rate_paise_per_1000: isNaN(rate) ? 0 : Math.round(rate * 100),
                rate_usd: isNaN(rate) ? null : rate,
                refill_supported: refillStr === '1' || refillStr.toLowerCase() === 'true',
                cancel_supported: cancelStr === '1' || cancelStr.toLowerCase() === 'true',
                active: true,
                service_type: type,
                service_category: category,
                refill_days: 0,
                raw_data: svc,
                manual_platform: existingRow?.manual_platform ?? null,
                manual_metric: existingRow?.manual_metric ?? null,
                classification_source: hasManualOverride ? 'manual' : 'inferred',
              };
            });

            if (rows.length === 0) return;

            for (const row of rows) {
              await supabase
                .from('provider_services')
                .upsert(row, {
                  onConflict: 'provider_id,external_service_id',
                });
            }
          } catch {
            // Silently skip
          }
        }),
      );
    };

    sync();
    const interval = setInterval(sync, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);
}
