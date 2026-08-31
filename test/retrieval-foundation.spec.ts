import {
  ContextPackingService,
  RankedEvidence,
} from '../src/modules/retrieval/context-packing.service';
const item = (overrides: Partial<RankedEvidence>): RankedEvidence => ({
  contentChunkId: 'chunk-1',
  documentVersionId: 'version-1',
  documentId: 'document-1',
  chunkOrder: 1,
  content: 'Newton first law inertia motion force',
  contentHash: 'a'.repeat(64),
  estimatedTokens: 20,
  locator: { type: 'PDF_PAGE', pageFrom: 1, pageTo: 1 },
  vectorScore: 0.8,
  keywordScore: 0.5,
  hybridScore: 0.71,
  ...overrides,
});
describe('Retrieval context packing', () => {
  const packer = new ContextPackingService();
  it('preserves rank, whole chunks, stable labels and token budget', () => {
    const result = packer.pack(
      [
        item({}),
        item({
          contentChunkId: 'chunk-2',
          contentHash: 'b'.repeat(64),
          documentVersionId: 'version-2',
          chunkOrder: 4,
          content: 'Photosynthesis converts light energy',
          estimatedTokens: 15,
          hybridScore: 0.6,
        }),
        item({
          contentChunkId: 'chunk-3',
          contentHash: 'c'.repeat(64),
          documentVersionId: 'version-3',
          estimatedTokens: 30,
          hybridScore: 0.5,
        }),
      ],
      40,
      10,
    );
    expect(result.map((value) => value.label)).toEqual(['SRC_1', 'SRC_2']);
    expect(result.reduce((sum, value) => sum + value.estimatedTokens, 0)).toBeLessThanOrEqual(40);
    expect(result[0]?.content).toBe('Newton first law inertia motion force');
  });
  it('suppresses exact hashes and highly-overlapping adjacent chunks deterministically', () => {
    const values = [
      item({}),
      item({
        contentChunkId: 'duplicate',
        contentHash: 'a'.repeat(64),
        documentVersionId: 'version-x',
      }),
      item({
        contentChunkId: 'adjacent',
        contentHash: 'b'.repeat(64),
        chunkOrder: 2,
        content: 'Newton first law inertia motion force explained',
      }),
      item({
        contentChunkId: 'useful',
        contentHash: 'c'.repeat(64),
        chunkOrder: 5,
        content: 'Newton second law acceleration proportional mass',
      }),
    ];
    const first = packer.pack(values, 100, 10);
    expect(first.map((value) => value.contentChunkId)).toEqual(['chunk-1', 'useful']);
    expect(packer.pack(values, 100, 10)).toEqual(first);
  });
  it('never truncates an over-budget chunk', () => {
    expect(packer.pack([item({ estimatedTokens: 101 })], 100, 10)).toEqual([]);
  });
});
