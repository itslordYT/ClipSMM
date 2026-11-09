export type CampaignStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'PROCESSING'
  | 'PARTIAL'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type MetricKey =
  | 'views'
  | 'likes'
  | 'comments'
  | 'shares'
  | 'reposts'
  | 'saves'
  | 'followers'
  | 'subscribers';

export type RunStatus = 'PLANNED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';



export type ClassificationSource = 'api' | 'inferred' | 'manual';

export type ProviderKind = 'mock' | 'external';

export type ProviderStatus = 'active' | 'paused' | 'error';

export type WalletTxnType =
  | 'credit'
  | 'debit'
  | 'provider_recharge'
  | 'refund'
  | 'adjustment';

export type ExpenseCategory =
  | 'editing'
  | 'promotion'
  | 'tools'
  | 'provider_api'
  | 'other';

export type ExpenseSource = 'manual' | 'api';

export interface Provider {
  id: string;
  name: string;
  slug: string;
  kind: ProviderKind;
  status: ProviderStatus;
  balance_paise: bigint;
  currency: string;
  last_balance_at: string | null;
  last_balance_error: string | null;
  conversion_rate_to_inr: number | null;
  api_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProviderService {
  id: string;
  provider_id: string;
  name: string;
  platform: string;
  metric: MetricKey;
  min_quantity: number;
  max_quantity: number;
  rate_paise_per_1000: number;
  refill_days: number;
  active: boolean;
  external_service_id: string | null;
  service_type: string | null;
  service_category: string | null;
  rate_usd: number | null;
  refill_supported: boolean;
  cancel_supported: boolean;
  raw_data: Record<string, unknown>;
  classification_source: ClassificationSource | null;
  manual_platform: string | null;
  manual_metric: MetricKey | null;
  created_at: string;
}

export interface Campaign {
  id: string;
  name: string;
  platform: string;
  post_url: string;
  provider_id: string | null;
  status: CampaignStatus;
  approved_at: string | null;
  revenue_paise: number;
  budget_paise: number;
  notes: string;
  start_at: string | null;
  end_at: string | null;
  interval_minutes: number | null;
  run_count: number;
  first_run_mode: 'at_start' | 'after_interval';
  variation_percent: number;
  created_at: string;
  updated_at: string;
}

export interface CampaignMetric {
  id: string;
  campaign_id: string;
  metric: MetricKey;
  service_id: string | null;
  quantity: number;
  delivered_quantity: number;
  estimated_cost_paise: number;
  variation_percent: number;
  target_link: string | null;
  created_at: string;
}

export interface CampaignRun {
  id: string;
  campaign_id: string;
  run_number: number;
  planned_at: string;
  status: RunStatus;
  created_at: string;
}

export interface ProviderOrder {
  id: string;
  campaign_id: string | null;
  run_id: string | null;
  metric_id: string | null;
  provider_id: string | null;
  service_id: string | null;
  external_order_id: string | null;
  quantity: number;
  charge_paise: number;
  status: string;
  response_data: Record<string, unknown>;
  currency: string;
  delivered_quantity: number;
  start_count: number | null;
  provider_status: string | null;
  checked_at: string | null;
  balance_before_paise: number | null;
  balance_after_paise: number | null;
  created_at: string;
}

export interface CampaignRunItem {
  id: string;
  campaign_id: string;
  campaign_metric_id: string;
  campaign_run_id: string;
  run_number: number;
  planned_at: string;
  planned_quantity: number;
  delivered_quantity: number;
  remaining_quantity: number;
  provider_order_id: string | null;
  status: RunItemStatus;
  charge_paise: number;
  currency: string;
  start_count: number | null;
  submitted_at: string | null;
  completed_at: string | null;
  editable: boolean;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export type RunItemStatus = 'SCHEDULED' | 'WAITING' | 'SUBMITTED' | 'PROCESSING' | 'COMPLETED' | 'PAUSED' | 'FAILED' | 'CANCELLED';

export interface WalletTransaction {
  id: string;
  type: WalletTxnType;
  amount_paise: number;
  description: string;
  provider_id: string | null;
  campaign_id: string | null;
  expense_id: string | null;
  created_at: string;
}

export interface Expense {
  id: string;
  category: ExpenseCategory;
  description: string;
  amount_paise: number;
  campaign_id: string | null;
  provider_order_id: string | null;
  provider_id: string | null;
  source: ExpenseSource;
  currency: string;
  expense_date: string;
  created_at: string;
}

export interface Revenue {
  id: string;
  campaign_id: string | null;
  description: string;
  amount_paise: number;
  revenue_date: string;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  detail: string;
  created_at: string;
}

export const METRIC_LABELS: Record<MetricKey, string> = {
  views: 'Views',
  likes: 'Likes',
  comments: 'Comments',
  shares: 'Shares',
  reposts: 'Reposts',
  saves: 'Saves',
  followers: 'Followers',
  subscribers: 'Subscribers',
};

export const PLATFORMS: string[] = [
  'Instagram',
  'YouTube',
  'TikTok',
  'Facebook',
  'Twitter/X',
  'Telegram',
  'Twitch',
  'Website',
  'Other',
];

export const METRIC_KEYS: MetricKey[] = [
  'views',
  'likes',
  'comments',
  'shares',
  'reposts',
  'saves',
  'followers',
  'subscribers',
];

export const METRIC_PRIORITY: Record<MetricKey, number> = {
  views: 1,
  likes: 2,
  comments: 3,
  shares: 4,
  reposts: 5,
  saves: 6,
  followers: 7,
  subscribers: 8,
};

export const CAMPAIGN_STATUSES: CampaignStatus[] = [
  'DRAFT',
  'SCHEDULED',
  'PROCESSING',
  'PARTIAL',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
];

export const STATUS_COLORS: Record<CampaignStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700 border-slate-200',
  SCHEDULED: 'bg-blue-50 text-blue-700 border-blue-200',
  PROCESSING: 'bg-amber-50 text-amber-700 border-amber-200',
  PARTIAL: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  FAILED: 'bg-rose-50 text-rose-700 border-rose-200',
  CANCELLED: 'bg-slate-100 text-slate-500 border-slate-200',
};

export const RUN_ITEM_STATUS_COLORS: Record<RunItemStatus, string> = {
  SCHEDULED: 'bg-slate-100 text-slate-700 border-slate-200',
  WAITING: 'bg-violet-50 text-violet-700 border-violet-200',
  SUBMITTED: 'bg-blue-50 text-blue-700 border-blue-200',
  PROCESSING: 'bg-amber-50 text-amber-700 border-amber-200',
  COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PAUSED: 'bg-orange-50 text-orange-700 border-orange-200',
  FAILED: 'bg-rose-50 text-rose-700 border-rose-200',
  CANCELLED: 'bg-slate-100 text-slate-500 border-slate-200',
};

export interface ProviderBalanceSnapshot {
  id: string;
  provider_id: string;
  balance_paise: number;
  currency: string;
  balance_before_paise: number | null;
  captured_at: string;
}

export const FOLLOWER_METRICS: MetricKey[] = ['followers', 'subscribers'];

export interface FavoriteService {
  id: string;
  provider_id: string;
  external_service_id: string;
  metric: string;
  platform: string | null;
  is_default: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type IntervalUnit = 'minutes' | 'hours' | 'days';

export const INTERVAL_UNITS: IntervalUnit[] = ['minutes', 'hours', 'days'];

export const INTERVAL_UNIT_LABELS: Record<IntervalUnit, string> = {
  minutes: 'Minutes',
  hours: 'Hours',
  days: 'Days',
};
