import type { IntervalUnit, ProviderService } from '@/lib/types';

export function paiseToRupees(paise: number): number {
  return paise / 100;
}

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function formatCurrency(paise: number): string {
  const rupees = paiseToRupees(paise);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  minimumFractionDigits: 0,
  }).format(rupees);
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-IN').format(n);
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function computeEstimatedCost(quantity: number, ratePaisePer1000: number): number {
  return Math.ceil((quantity / 1000) * ratePaisePer1000);
}

export function divideAcrossRuns(total: number, runs: number): number[] {
  if (runs <= 0) return [];
  const base = Math.floor(total / runs);
  const remainder = total % runs;
  return Array.from({ length: runs }, (_, i) => base + (i < remainder ? 1 : 0));
}

export function distributeQuantities(
  total: number,
  runs: number,
  minQuantity: number,
  maxQuantity: number
): number[] {
  if (runs <= 0 || total <= 0) return [];
  const base = Math.floor(total / runs);
  const remainder = total % runs;
  const raw = Array.from({ length: runs }, (_, i) => {
    let qty = base + (i < remainder ? 1 : 0);
    if (qty < minQuantity) qty = minQuantity;
    if (qty > maxQuantity) qty = maxQuantity;
    return qty;
  });
  let sum = raw.reduce((a, b) => a + b, 0);
  let idx = 0;
  while (sum !== total && idx < runs * 1000) {
    const i = idx % runs;
    if (sum < total && raw[i] < maxQuantity) { raw[i]++; sum++; }
    else if (sum > total && raw[i] > minQuantity) { raw[i]--; sum--; }
    idx++;
  }
  return raw;
}

// Deterministic varied allocation: distributes total across runs with a
// transparent deterministic pattern (triangular wave). Not random, not
// "natural" — the same inputs always produce the same output. Ensures the
// sum exactly equals the target, every run is > 0, and min/max are respected.
export function distributeVariedQuantities(
  total: number,
  runs: number,
  minQuantity: number,
  maxQuantity: number
): number[] {
  if (runs <= 0 || total <= 0) return [];
  if (total < runs * minQuantity) return [];
  if (total > runs * maxQuantity) return [];

  // Start with equal base distribution
  const base = Math.floor(total / runs);
  const remainder = total % runs;
  const raw = Array.from({ length: runs }, (_, i) => base + (i < remainder ? 1 : 0));

  // Apply a deterministic triangular variation pattern
  // Peak at the middle, tapering at edges — ±25% of base, clamped to min/max
  const maxVariation = Math.max(0, Math.floor(base * 0.25));
  for (let i = 0; i < runs; i++) {
    // Triangular wave: 0 at edges, peak at center
    const normalizedPos = (i + 0.5) / runs; // 0..1
    const triangular = 1 - Math.abs(2 * normalizedPos - 1); // 0 at edges, 1 at center
    // Alternate direction: even indices add, odd subtract
    const direction = i % 2 === 0 ? 1 : -1;
    const delta = Math.round(maxVariation * triangular * direction);
    let qty = raw[i] + delta;
    if (qty < minQuantity) qty = minQuantity;
    if (qty > maxQuantity) qty = maxQuantity;
    raw[i] = qty;
  }

  // Correct sum to exactly match total
  let sum = raw.reduce((a, b) => a + b, 0);
  let idx = 0;
  const maxIter = runs * 1000;
  while (sum !== total && idx < maxIter) {
    const i = idx % runs;
    if (sum < total && raw[i] < maxQuantity) { raw[i]++; sum++; }
    else if (sum > total && raw[i] > minQuantity) { raw[i]--; sum--; }
    idx++;
  }

  return raw;
}

export function generateRunTimes(
  startAt: Date,
  endAt: Date | null,
  intervalMinutes: number | null,
  runCount: number,
  firstRunMode: 'at_start' | 'after_interval'
): Date[] {
  const times: Date[] = [];
  const interval = intervalMinutes ?? 60;

  if (firstRunMode === 'at_start') {
    for (let i = 0; i < runCount; i++) {
      const time = new Date(startAt.getTime() + i * interval * 60 * 1000);
      if (endAt && time > endAt) break;
      times.push(time);
    }
  } else {
    for (let i = 1; i <= runCount; i++) {
      const time = new Date(startAt.getTime() + i * interval * 60 * 1000);
      if (endAt && time > endAt) break;
      times.push(time);
    }
  }

  return times;
}

export function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromLocalInputValue(value: string): Date {
  return new Date(value);
}

// ── Interval unit helpers ──────────────────────────────────────────────

export function intervalToMinutes(value: number, unit: IntervalUnit): number {
  if (unit === 'minutes') return Math.max(1, Math.round(value));
  if (unit === 'hours') return Math.max(1, Math.round(value * 60));
  return Math.max(1, Math.round(value * 1440));
}

export function formatIntervalReadable(value: number, unit: IntervalUnit): string {
  const mins = intervalToMinutes(value, unit);
  if (mins < 60) return `Every ${mins} min`;
  if (mins < 1440) {
    const hrs = mins / 60;
    return `Every ${hrs % 1 === 0 ? hrs : hrs.toFixed(1)} hr${hrs !== 1 ? 's' : ''}`;
  }
  const days = mins / 1440;
  return `Every ${days % 1 === 0 ? days : days.toFixed(1)} day${days !== 1 ? 's' : ''}`;
}

export function formatProviderRate(svc: ProviderService): string {
  if (svc.rate_usd !== null && svc.rate_usd !== undefined) {
    return `${svc.rate_usd.toFixed(2)} / 1K`;
  }
  return `${formatCurrency(svc.rate_paise_per_1000)} / 1K`;
}

export function formatBalanceDisplay(
  balancePaise: number | bigint,
  currency: string,
  lastBalanceAt: string | null,
  conversionRate: number | null,
): { text: string; sub: string; isSynced: boolean } {
  const isSynced = lastBalanceAt !== null;
  if (!isSynced) {
    return { text: 'Not synced', sub: 'Click Balance to sync', isSynced: false };
  }
  const amount = Number(balancePaise) / 100;
  const text = `${currency} ${amount.toFixed(2)}`;
  let sub = '';
  if (currency !== 'INR' && conversionRate && conversionRate > 0) {
    const inr = amount * conversionRate;
    sub = `\u2248 ${formatCurrency(Math.round(inr * 100))}`;
  }
  return { text, sub, isSynced: true };
}
