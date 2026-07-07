export const featureKeys = ['card_transfer'] as const;

export type FeatureKey = typeof featureKeys[number];
export type FeatureAudience = 'off' | 'allowlist' | 'operators' | 'all';

export type FeatureFlagRecord = {
  key: FeatureKey;
  enabled: boolean;
  audience: FeatureAudience;
  allowlist: string[];
};

export type FeatureActor = {
  telegramUserIdHmac?: string;
  isOperator?: boolean;
};

export function evaluateFeatureFlag(flag: FeatureFlagRecord, actor: FeatureActor): boolean {
  if (!flag.enabled || flag.audience === 'off') {
    return false;
  }

  if (flag.audience === 'all') {
    return true;
  }

  if (flag.audience === 'operators') {
    return actor.isOperator === true;
  }

  if (!actor.telegramUserIdHmac) {
    return false;
  }

  return flag.allowlist.includes(actor.telegramUserIdHmac);
}
