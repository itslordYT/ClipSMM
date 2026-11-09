import { createClient } from '@/lib/supabase/client';
import type { ProviderService, Provider } from '@/lib/types';

export type SubmitResult = {
  success: boolean;
  externalOrderId: string | null;
  error: string | null;
  charge: number | null;
  startCount: number | null;
  currency: string | null;
};

export async function submitRunToProvider(params: {
  provider: Provider;
  service: ProviderService;
  link: string;
  quantity: number;
}): Promise<SubmitResult> {
  const { provider, service, link, quantity } = params;

  if (provider.kind === 'mock') {
    return {
      success: true,
      externalOrderId: `mock-${Date.now()}`,
      error: null,
      charge: Math.round((service.rate_paise_per_1000 * quantity) / 1000),
      startCount: 0,
      currency: 'INR',
    };
  }

  if (!service.external_service_id) {
    return { success: false, externalOrderId: null, error: 'Service has no external service ID', charge: null, startCount: null, currency: null };
  }

  if (!link.trim()) {
    return { success: false, externalOrderId: null, error: 'No target link provided', charge: null, startCount: null, currency: null };
  }

  // Strip tracking query params that SMM panels often reject (?stkn=, ?igsh=, etc.)
  const cleanLink = link.trim().split('?')[0];

  try {
    const apiUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/cheapestsmm-proxy`;
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        action: 'add',
        provider_id: provider.id,
        service: service.external_service_id,
        link: cleanLink,
        quantity: String(quantity),
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errMsg = (data as Record<string, unknown>)?.error ?? `HTTP ${res.status}`;
      return { success: false, externalOrderId: null, error: String(errMsg), charge: null, startCount: null, currency: null };
    }

    if ((data as Record<string, unknown>)?.error) {
      return { success: false, externalOrderId: null, error: String((data as Record<string, unknown>).error), charge: null, startCount: null, currency: null };
    }

    const orderId = String((data as Record<string, unknown>)?.order ?? '');
    const charge = parseFloat(String((data as Record<string, unknown>)?.charge ?? '0'));
    const startCount = parseInt(String((data as Record<string, unknown>)?.start_count ?? '0'), 10);

    if (!orderId) {
      return { success: false, externalOrderId: null, error: 'Provider did not return an order ID', charge: null, startCount: null, currency: null };
    }

    return {
      success: true,
      externalOrderId: orderId,
      error: null,
      charge: isNaN(charge) ? null : Math.round(charge * 100),
      startCount: isNaN(startCount) ? null : startCount,
      currency: provider.currency ?? 'INR',
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Network error';
    return { success: false, externalOrderId: null, error: errMsg, charge: null, startCount: null, currency: null };
  }
}

export async function recordProviderOrder(params: {
  campaignId: string;
  metricId: string;
  runItemId: string;
  providerId: string;
  serviceId: string;
  externalOrderId: string;
  quantity: number;
  chargePaise: number;
  currency: string;
  startCount: number | null;
  responseData: Record<string, unknown>;
  balanceBefore: number | null;
  balanceAfter: number | null;
}): Promise<void> {
  const supabase = createClient();
  await supabase.from('provider_orders').insert({
    campaign_id: params.campaignId,
    run_id: null,
    metric_id: params.metricId,
    provider_id: params.providerId,
    service_id: params.serviceId,
    external_order_id: params.externalOrderId,
    quantity: params.quantity,
    charge_paise: params.chargePaise,
    status: 'SUBMITTED',
    response_data: params.responseData,
    currency: params.currency,
    delivered_quantity: 0,
    start_count: params.startCount,
    provider_status: 'Pending',
    balance_before_paise: params.balanceBefore,
    balance_after_paise: params.balanceAfter,
  });
}
