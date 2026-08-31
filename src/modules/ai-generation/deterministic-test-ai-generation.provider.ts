import { createHash } from 'node:crypto';
import {
  AiGenerationProvider,
  GenerationProviderResult,
  StructuredPromptRequest,
} from './generation.contracts';
import { AiErrorCode } from './generation.enums';
export class DeterministicTestAiGenerationProvider implements AiGenerationProvider {
  readonly providerName = 'test';
  constructor() {
    if ((process.env.APP_ENV ?? 'development') === 'production')
      throw new Error('The deterministic AI generation provider is forbidden in production');
  }
  generateQuestions(prompt: StructuredPromptRequest): Promise<GenerationProviderResult> {
    if (prompt.user.includes('[TEST_PROVIDER_ERROR]'))
      return Promise.reject(new Error(AiErrorCode.PROVIDER_ERROR));
    if (prompt.user.includes('[TEST_TIMEOUT]'))
      return Promise.reject(new Error(AiErrorCode.TIMEOUT));
    if (prompt.user.includes('[TEST_RATE_LIMIT]'))
      return Promise.reject(new Error(AiErrorCode.RATE_LIMITED));
    if (prompt.user.includes('[TEST_AUTH_FAILURE]'))
      return Promise.reject(new Error(AiErrorCode.AUTH_FAILED));
    if (prompt.user.includes('[TEST_MALFORMED]'))
      return Promise.resolve({ output: '{bad', latencyMs: 0 });
    const count = Number(prompt.user.match(/Count: (\d+)/)?.[1] ?? 1);
    const type = prompt.user.match(/Type: ([A-Z_]+)/)?.[1] ?? 'SHORT';
    const difficulty = prompt.user.match(/Difficulty: ([A-Z_]+)/)?.[1] ?? 'MEDIUM';
    const label = prompt.user.includes('[TEST_UNKNOWN_CITATION]')
      ? 'SRC_UNKNOWN'
      : (prompt.user.match(/<SOURCE id="([^"]+)">/)?.[1] ?? 'SRC_UNKNOWN');
    const topic = prompt.user.match(/Curriculum: .* > (.+)/)?.[1] ?? 'topic';
    const questions = Array.from({ length: count }, (_, index) => {
      const suffix = createHash('sha256')
        .update(`${prompt.user}:${index}`)
        .digest('hex')
        .slice(0, 8);
      const options =
        type === 'MCQ'
          ? ['Correct answer', 'Distractor one', 'Distractor two', 'Distractor three'].map(
              (text, i) => ({ text: `${text} ${suffix}`, isCorrect: i === 0 }),
            )
          : type === 'TRUE_FALSE'
            ? [
                { text: 'TRUE', isCorrect: true },
                { text: 'FALSE', isCorrect: false },
              ]
            : [];
      return {
        type,
        questionText: prompt.user.includes('[TEST_DUPLICATE]')
          ? `Duplicate grounded ${topic} question?`
          : `Grounded ${topic} ${difficulty.toLowerCase()} question ${index + 1} ${suffix}?`,
        difficulty,
        marks: type === 'LONG' ? 5 : type === 'SHORT' ? 2 : 1,
        explanation: `Answer grounded in ${label}.`,
        options,
        citations: [label],
      };
    });
    return Promise.resolve({
      output: JSON.stringify({ questions }),
      usage: { inputTokens: 10, outputTokens: count * 10, totalTokens: 10 + count * 10 },
      latencyMs: 0,
    });
  }
}
