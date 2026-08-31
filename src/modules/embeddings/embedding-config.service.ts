import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';

export interface ActiveEmbeddingConfig {
  provider: string;
  model: string;
  dimension: number;
  distanceMetric: 'cosine';
  preprocessingVersion: string;
  configVersion: string;
  configured: boolean;
}

@Injectable()
export class EmbeddingConfigService {
  constructor(private readonly config: ConfigService) {}
  active(): ActiveEmbeddingConfig {
    const provider = this.config.get<string>('embedding.provider') ?? '';
    const model = this.config.get<string>('embedding.model') ?? '';
    const dimension = this.config.get<number>('embedding.dimension') ?? 1536;
    const distanceMetric = 'cosine' as const;
    const preprocessingVersion =
      this.config.get<string>('embedding.preprocessingVersion') ?? 'normalized-chunk-v1';
    const canonical = JSON.stringify({
      provider,
      model,
      dimension,
      distanceMetric,
      preprocessingVersion,
    });
    return {
      provider,
      model,
      dimension,
      distanceMetric,
      preprocessingVersion,
      configVersion: createHash('sha256').update(canonical).digest('hex'),
      configured: provider === 'test' || (provider === 'openai' && Boolean(this.apiKey())),
    };
  }
  apiKey() {
    return this.config.get<string>('embedding.apiKey') ?? '';
  }
  batchSize() {
    return this.config.get<number>('embedding.batchSize') ?? 32;
  }
  timeoutMs() {
    return this.config.get<number>('embedding.timeoutMs') ?? 30000;
  }
  staleMinutes() {
    return this.config.get<number>('embedding.staleMinutes') ?? 15;
  }
}
