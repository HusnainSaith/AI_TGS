export enum QuestionType {
  MCQ = 'MCQ',
  SHORT = 'SHORT',
  LONG = 'LONG',
  TRUE_FALSE = 'TRUE_FALSE',
  FILL_BLANK = 'FILL_BLANK',
}
export enum QuestionDifficulty {
  EASY = 'EASY',
  MEDIUM = 'MEDIUM',
  HARD = 'HARD',
}
export enum QuestionSource {
  MANUAL = 'MANUAL',
  AI_GENERATED = 'AI_GENERATED',
}
export enum QuestionReviewStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
}
export enum QuestionStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}
export enum GroundingStatus {
  NOT_APPLICABLE = 'NOT_APPLICABLE',
  GROUNDED = 'GROUNDED',
  UNGROUNDED = 'UNGROUNDED',
  INSUFFICIENT_EVIDENCE = 'INSUFFICIENT_EVIDENCE',
}
