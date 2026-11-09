import type { MetricKey, ClassificationSource } from '@/lib/types';

export type ServiceClassification = {
  platform: string;
  metric: MetricKey | 'unclassified';
  source: ClassificationSource;
};

const platformRules: Array<[string, RegExp]> = [
  ['Instagram', /instagram|\big\b|reel|story/i],
  ['YouTube', /youtube|\byt\b|subscriber|watch hour|yt views|yt likes/i],
  ['TikTok', /tiktok|tt views|tt likes/i],
  ['Facebook', /facebook|fb page|fb post|fb reaction/i],
  ['LinkedIn', /linkedin/i],
  ['Spotify', /spotify|playlist play|monthly listener/i],
  ['Twitter/X', /twitter|\bx\s+(?:followers|likes|retweet|views)/i],
  ['Telegram', /telegram|\btg\b/i],
  ['Website', /website|seo traffic|traffic/i],
  ['WhatsApp', /whatsapp/i],
  ['Snapchat', /snapchat/i],
  ['Twitch', /twitch/i],
];

const metricRules: Array<[MetricKey, RegExp]> = [
  ['subscribers', /subscriber/i],
  ['followers', /follower|member/i],
  ['comments', /comment|reply/i],
  ['reposts', /repost|retweet/i],
  ['shares', /share/i],
  ['saves', /save|bookmark/i],
  ['likes', /like|reaction|favorite|favourite|heart/i],
  ['views', /view|play|impression|reach|stream|watch/i],
];

export function classifyService(name: string, category: string): ServiceClassification {
  const searchableText = `${name} ${category}`;
  const platform = platformRules.find(([, rule]) => rule.test(searchableText))?.[0] ?? 'Other';
  const metric = metricRules.find(([, rule]) => rule.test(searchableText))?.[0] ?? 'unclassified';

  return { platform, metric, source: 'inferred' };
}

export function resolvePlatform(svc: {
  manual_platform: string | null;
  platform: string;
}): string {
  return svc.manual_platform ?? svc.platform;
}

export function resolveMetric(svc: {
  manual_metric: string | null;
  metric: string;
}): MetricKey | 'unclassified' {
  return (svc.manual_metric ?? svc.metric) as MetricKey | 'unclassified';
}
