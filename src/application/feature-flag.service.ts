import {
  evaluateFeatureFlag,
  type FeatureActor,
  type FeatureFlagRecord,
  type FeatureKey,
} from './feature-flags.ts';

type FeatureFlagSource = {
  getByKey(key: FeatureKey): Promise<FeatureFlagRecord | undefined>;
};

export class FeatureFlagService {
  private readonly source: FeatureFlagSource;

  constructor(source: FeatureFlagSource) {
    this.source = source;
  }

  async isEnabled(key: FeatureKey, actor: FeatureActor): Promise<boolean> {
    const flag = await this.source.getByKey(key);

    if (!flag) {
      return false;
    }

    return evaluateFeatureFlag(flag, actor);
  }
}
