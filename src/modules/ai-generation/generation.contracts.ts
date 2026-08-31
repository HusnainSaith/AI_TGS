import { QuestionDifficulty, QuestionType } from '../questions/enums/question.enums';
export const AI_GENERATION_PROVIDER = Symbol('AiGenerationProvider');
export interface StructuredPromptRequest {
  system: string;
  user: string;
  schema: Record<string, unknown>;
}
export interface ProviderQuestion {
  type: QuestionType;
  questionText: string;
  difficulty: QuestionDifficulty;
  marks: number;
  explanation?: string | null;
  options?: { text: string; isCorrect: boolean }[];
  citations: string[];
}
export interface GenerationProviderResult {
  output: string;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  latencyMs: number;
}
export interface AiGenerationProvider {
  readonly providerName: string;
  generateQuestions(prompt: StructuredPromptRequest): Promise<GenerationProviderResult>;
}
export interface GenerationUnit {
  topicId: string;
  chapterId: string;
  type: QuestionType;
  difficulty: QuestionDifficulty;
  count: number;
}
export interface ValidatedCurriculum {
  boardId: string;
  classId: string;
  subjectId: string;
  chapterId: string;
  topicId: string;
  className: string;
  subjectName: string;
  chapterName: string;
  topicName: string;
  topicDescription: string | null;
}
