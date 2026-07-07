import type { FeatureFlagRecord, FeatureKey } from '../application/feature-flags.ts';
import { db } from '../db/knex.ts';

type FeatureFlagRow = {
  key: FeatureKey;
  enabled: boolean;
  audience: FeatureFlagRecord['audience'];
  allowlist: string[] | string;
};

export class FeatureFlagRepository {
  async getByKey(key: FeatureKey): Promise<FeatureFlagRecord | undefined> {
    const row = await db<FeatureFlagRow>('feature_flags')
      .where({ key })
      .first();

    if (!row) {
      return undefined;
    }

    return {
      key: row.key,
      enabled: row.enabled,
      audience: row.audience,
      allowlist: Array.isArray(row.allowlist) ? row.allowlist : JSON.parse(row.allowlist),
    };
  }
}
