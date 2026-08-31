import { Injectable } from '@nestjs/common';
export interface RankedEvidence {
  contentChunkId: string;
  documentVersionId: string;
  documentId: string;
  chunkOrder: number;
  content: string;
  contentHash: string;
  estimatedTokens: number;
  locator: Record<string, unknown>;
  vectorScore: number;
  keywordScore: number;
  hybridScore: number;
}
@Injectable()
export class ContextPackingService {
  pack(candidates: RankedEvidence[], budget: number, topK: number) {
    const selected: RankedEvidence[] = [];
    const hashes = new Set<string>();
    for (const candidate of candidates) {
      if (selected.length >= topK) break;
      if (hashes.has(candidate.contentHash)) continue;
      const redundant = selected.some(
        (item) =>
          item.documentVersionId === candidate.documentVersionId &&
          Math.abs(item.chunkOrder - candidate.chunkOrder) <= 1 &&
          this.overlap(item.content, candidate.content) >= 0.8,
      );
      if (redundant) continue;
      const used = selected.reduce((sum, item) => sum + item.estimatedTokens, 0);
      if (used + candidate.estimatedTokens > budget) continue;
      hashes.add(candidate.contentHash);
      selected.push(candidate);
    }
    return selected.map((item, index) => ({ ...item, label: `SRC_${index + 1}`, rank: index + 1 }));
  }
  private overlap(a: string, b: string) {
    const aa = new Set(a.toLowerCase().split(/\s+/));
    const bb = new Set(b.toLowerCase().split(/\s+/));
    if (!aa.size || !bb.size) return 0;
    let common = 0;
    for (const value of aa) if (bb.has(value)) common++;
    return common / Math.min(aa.size, bb.size);
  }
}
