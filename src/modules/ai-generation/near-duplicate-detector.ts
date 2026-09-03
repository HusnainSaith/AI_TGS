import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import {
  EMBEDDING_PROVIDER,
  EmbeddingProvider,
} from '../../infrastructure/providers/provider.contracts';
@Injectable()
export class NearDuplicateDetector {
  constructor(
    private readonly data: DataSource,
    private readonly config: ConfigService,
    @Inject(EMBEDDING_PROVIDER) private readonly embeddings: EmbeddingProvider,
  ) {}
  async assertUnique(
    texts: string[],
    topicId: string,
    user: AuthenticatedUser,
    recentTestCount: number,
  ) {
    const normalized = texts.map((text) => this.normalize(text));
    if (new Set(normalized).size !== normalized.length)
      throw new ConflictException('AI_DUPLICATE_REJECTED');
    for (let left = 0; left < normalized.length; left++)
      for (let right = left + 1; right < normalized.length; right++)
        if (this.jaccard(normalized[left]!, normalized[right]!) >= this.textThreshold())
          throw new ConflictException('AI_DUPLICATE_REJECTED');
    const candidates = await this.candidates(user.id, topicId, recentTestCount);
    for (const text of normalized)
      if (
        candidates.some(
          (candidate) => this.jaccard(text, this.normalize(candidate)) >= this.textThreshold(),
        )
      )
        throw new ConflictException('AI_DUPLICATE_REJECTED');
    if (!candidates.length) return;
    const results = await this.embeddings.embedBatch([...texts, ...candidates]);
    const generated = results.slice(0, texts.length),
      history = results.slice(texts.length);
    for (let left = 0; left < generated.length; left++) {
      for (let right = left + 1; right < generated.length; right++)
        if (
          this.cosine(generated[left]!.vector, generated[right]!.vector) >=
          this.embeddingThreshold()
        )
          throw new ConflictException('AI_DUPLICATE_REJECTED');
      if (
        history.some(
          (candidate) =>
            this.cosine(generated[left]!.vector, candidate.vector) >= this.embeddingThreshold(),
        )
      )
        throw new ConflictException('AI_DUPLICATE_REJECTED');
    }
  }
  private async candidates(
    userId: string,
    topicId: string,
    recentTestCount: number,
  ): Promise<string[]> {
    const limit = this.config.get<number>('aiGeneration.duplicateCandidateLimit') ?? 500;
    const rows = await this.data.query(
      `WITH recent_tests AS (
      SELECT id FROM tests WHERE created_by=$1 ORDER BY created_at DESC LIMIT $3
    ), candidates AS (
      SELECT question_text AS text FROM questions WHERE created_by=$1 AND topic_id=$2 AND status='ACTIVE'
      UNION SELECT tq.question_text_snapshot AS text FROM test_questions tq JOIN recent_tests rt ON rt.id=tq.test_id WHERE tq.topic_id_snapshot=$2
    ) SELECT text FROM candidates LIMIT $4`,
      [userId, topicId, recentTestCount, limit],
    );
    return (rows as Array<{ text: string }>).map((row) => row.text);
  }
  private normalize(text: string) {
    return text
      .normalize('NFKC')
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  private jaccard(left: string, right: string) {
    const a = new Set(left.split(' ').filter(Boolean)),
      b = new Set(right.split(' ').filter(Boolean)),
      union = new Set([...a, ...b]);
    return union.size ? [...a].filter((token) => b.has(token)).length / union.size : 1;
  }
  private cosine(left: readonly number[], right: readonly number[]) {
    if (left.length !== right.length || !left.length) return -1;
    let dot = 0,
      leftNorm = 0,
      rightNorm = 0;
    for (let index = 0; index < left.length; index++) {
      dot += left[index]! * right[index]!;
      leftNorm += left[index]! ** 2;
      rightNorm += right[index]! ** 2;
    }
    return leftNorm && rightNorm ? dot / Math.sqrt(leftNorm * rightNorm) : -1;
  }
  private textThreshold() {
    return this.config.get<number>('aiGeneration.duplicateTextThreshold') ?? 0.85;
  }
  private embeddingThreshold() {
    return this.config.get<number>('aiGeneration.duplicateEmbeddingThreshold') ?? 0.92;
  }
}
