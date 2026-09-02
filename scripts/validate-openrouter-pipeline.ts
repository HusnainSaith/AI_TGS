import { NestFactory } from '@nestjs/core';
import { hash } from 'argon2';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { UserRole } from '../src/common/enums/user-role.enum';
import { AuthenticatedUser } from '../src/common/interfaces/authenticated-user.interface';
import { AiGenerationService } from '../src/modules/ai-generation/ai-generation.service';
import { GroundingMode } from '../src/modules/ai-generation/generation.enums';
import { Board, Chapter, CurriculumClass, Subject, Topic } from '../src/modules/curriculum/curriculum.entities';
import { EmbeddingService } from '../src/modules/embeddings/embedding.service';
import { KnowledgeBaseService } from '../src/modules/knowledge-base/knowledge-base.service';
import { DocumentMappingsService } from '../src/modules/knowledge-base/document-mappings.service';
import { KnowledgeSourceType, MappingStatus, TenantScope } from '../src/modules/knowledge-base/enums/knowledge-base.enums';
import { IngestionProcessorService } from '../src/modules/ingestion/ingestion-processor.service';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { QuestionsService } from '../src/modules/questions/questions.service';
import { QuestionType } from '../src/modules/questions/enums/question.enums';
import { RetrievalService } from '../src/modules/retrieval/retrieval.service';
import { School } from '../src/modules/schools/school.entity';
import { Plan } from '../src/modules/subscriptions/entities/plan.entity';
import { Subscription } from '../src/modules/subscriptions/entities/subscription.entity';
import { BillingInterval, SubscriptionStatus } from '../src/modules/subscriptions/subscription.enums';
import { TestExportsService } from '../src/modules/test-exports/test-exports.service';
import { TestExportType } from '../src/modules/test-exports/test-export.enums';
import { TestsService } from '../src/modules/tests/tests.service';
import { User } from '../src/modules/users/user.entity';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const db = app.get(DataSource);
  const id: Record<'school'|'teacher'|'system'|'plan'|'subscription'|'board'|'classId'|'subject'|'chapter'|'topic'|'unsupportedTopic', string> & Record<string, string> = {
    school: randomUUID(), teacher: randomUUID(), system: randomUUID(), plan: randomUUID(), subscription: randomUUID(), board: randomUUID(), classId: randomUUID(), subject: randomUUID(), chapter: randomUUID(), topic: randomUUID(), unsupportedTopic: randomUUID(),
  };
  const teacher: AuthenticatedUser = { id: id.teacher, email: `${id.teacher}@test.invalid`, role: UserRole.TEACHER, schoolId: id.school, emailVerified: true };
  const system: AuthenticatedUser = { id: id.system, email: `${id.system}@test.invalid`, role: UserRole.SYSTEM_ADMIN, schoolId: null, emailVerified: true };
  const result: Record<string, unknown> = {};
  try {
    await db.getRepository(School).insert({ id: id.school, name: `OpenRouter validation ${id.school}` });
    const passwordHash = await hash(randomUUID());
    await db.getRepository(User).insert([
      { ...teacher, name: 'OpenRouter validation teacher', passwordHash },
      { ...system, name: 'OpenRouter validation admin', passwordHash },
    ]);
    await db.getRepository(Plan).insert({ id: id.plan, name: 'OpenRouter validation', code: `OR_${id.plan.replaceAll('-','')}`, price: '0.00', currency: 'USD', billingInterval: BillingInterval.MONTHLY, isActive: true, isDefault: false, limits: { aiQuestionsPerPeriod: 20, testsPerPeriod: 10, pdfExportsPerPeriod: 10 }, features: {} });
    await db.getRepository(Subscription).insert({ id: id.subscription, userId: id.teacher, schoolId: null, planId: id.plan, status: SubscriptionStatus.ACTIVE, currentPeriodStart: new Date(Date.now()-3600000), currentPeriodEnd: new Date(Date.now()+86400000), cancelAtPeriodEnd: false, cancelledAt: null, provider: null, providerCustomerId: null, providerSubscriptionId: null, metadata: null });
    await db.getRepository(Board).insert({ id: id.board, name: `OpenRouter board ${id.board}` });
    await db.getRepository(CurriculumClass).insert({ id: id.classId, boardId: id.board, name: 'Class 9', createdBy: id.system });
    await db.getRepository(Subject).insert({ id: id.subject, boardId: id.board, classId: id.classId, name: 'Biology', language: 'en' });
    await db.getRepository(Chapter).insert({ id: id.chapter, subjectId: id.subject, chapterNumber: 1, name: 'Plant nutrition' });
    await db.getRepository(Topic).insert([
      { id: id.topic, chapterId: id.chapter, name: 'Photosynthesis', description: 'Chlorophyll and energy conversion in plants', order: 1 },
      { id: id.unsupportedTopic, chapterId: id.chapter, name: 'Quantum chromodynamics', description: 'Quarks and gluons', order: 2 },
    ]);

    const kb = app.get(KnowledgeBaseService);
    const ingestion = app.get(IngestionProcessorService);
    const mappings = app.get(DocumentMappingsService);
    const embeddings = app.get(EmbeddingService);
    const retrieval = app.get(RetrievalService);
    const generation = app.get(AiGenerationService);
    const questions = app.get(QuestionsService);
    const tests = app.get(TestsService);
    const exports = app.get(TestExportsService);
    const notifications = app.get(NotificationsService);
    const content = Buffer.from('Photosynthesis is the process by which green plants use chlorophyll and sunlight to convert carbon dioxide and water into glucose. Oxygen is released as a by-product. The light-dependent reactions capture solar energy, while the Calvin cycle uses that energy to build sugars.');
    const document = await kb.create({ title: 'Controlled OpenRouter grounding source', tenantScope: TenantScope.GLOBAL, sourceType: KnowledgeSourceType.TXT, language: 'en', rights: { permissionConfirmed: true, sourceOwner: 'controlled validation fixture', rightsType: 'owned test content' } }, system);
    id.document = document.id;
    const uploaded = await kb.upload(document.id, { buffer: content, mimetype: 'text/plain', originalname: 'photosynthesis.txt', size: content.length }, system);
    id.version = uploaded.version.id;
    id.ingestionJob = uploaded.ingestionJob.id;
    const ingested = await ingestion.processJob(id.ingestionJob, system.id);
    result.ingestion = { status: ingested.status, currentStep: ingested.currentStep, metrics: ingested.metrics };
    const mapping = await mappings.create(id.version, { boardId: id.board, classId: id.classId, subjectId: id.subject, chapterId: id.chapter, topicId: id.topic }, system);
    await mappings.transition(mapping.id, MappingStatus.PENDING_REVIEW, system);
    await mappings.transition(mapping.id, MappingStatus.APPROVED, system);
    const embeddingJob = await embeddings.createAndProcess(id.version, system);
    result.embeddingJob = embeddingJob;
    await mappings.submitVersionReview(id.version, system);
    const published = await mappings.publish(id.version, system);
    result.publication = published;
    const supported = await retrieval.preview({ queryText: 'How do chlorophyll and sunlight enable photosynthesis?', boardId: id.board, classId: id.classId, subjectId: id.subject, chapterId: id.chapter, topicId: id.topic, language: 'en', documentIds: [id.document], topK: 5, minSimilarity: 0 }, teacher);
    const unsupported = await retrieval.preview({ queryText: 'Explain quark confinement in quantum chromodynamics', boardId: id.board, classId: id.classId, subjectId: id.subject, chapterId: id.chapter, topicId: id.unsupportedTopic, language: 'en', documentIds: [id.document], topK: 5, minSimilarity: 0.99 }, teacher);
    result.retrieval = { supportedStatus: supported.status, supportedChunks: supported.evidence.length, unsupportedStatus: unsupported.status, unsupportedChunks: unsupported.evidence.length };
    const before = await db.query(`SELECT COALESCE(SUM(consumed),0)::int AS consumed FROM usage_counters WHERE subscription_id=$1`, [id.subscription]);
    const generated = await generation.create({ classId: id.classId, subjectId: id.subject, language: 'en', knowledgeBase: { mode: GroundingMode.REQUIRED, documentIds: [id.document] }, units: [{ chapterId: id.chapter, topicId: id.topic, questionMix: [{ type: QuestionType.MCQ, count: 2, difficulty: { easy: 2, medium: 0, hard: 0 } }, { type: QuestionType.SHORT, count: 1, difficulty: { easy: 1, medium: 0, hard: 0 } }] }] }, teacher);
    id.generationJob = generated.id;
    const generationResult = await generation.process(generated.id, teacher);
    const generatedQuestions = await db.query(`SELECT id, grounding_status, review_status FROM questions WHERE generation_job_id=$1 ORDER BY created_at`, [generated.id]);
    const citations = await db.query(`SELECT COUNT(*)::int AS count FROM question_citations WHERE question_id=ANY($1::uuid[])`, [generatedQuestions.map((q: {id:string}) => q.id)]);
    const after = await db.query(`SELECT COALESCE(SUM(consumed),0)::int AS consumed FROM usage_counters WHERE subscription_id=$1`, [id.subscription]);
    result.generation = { status: generationResult.status, requestedCount: generationResult.requestedCount, generatedCount: generationResult.generatedCount, failedCount: generationResult.failedCount, questions: generatedQuestions.length, citationCount: citations[0]?.count ?? 0, quotaDelta: Number(after[0]?.consumed ?? 0)-Number(before[0]?.consumed ?? 0) };
    const failBefore = Number(after[0]?.consumed ?? 0);
    const failed = await generation.create({ classId: id.classId, subjectId: id.subject, language: 'en', knowledgeBase: { mode: GroundingMode.REQUIRED, documentIds: [id.document] }, units: [{ chapterId: id.chapter, topicId: id.unsupportedTopic, questionMix: [{ type: QuestionType.SHORT, count: 1, difficulty: { easy: 1, medium: 0, hard: 0 } }] }] }, teacher);
    id.failedJob = failed.id;
    const failedResult = await generation.process(failed.id, teacher);
    const failAfterRows = await db.query(`SELECT COALESCE(SUM(consumed),0)::int AS consumed FROM usage_counters WHERE subscription_id=$1`, [id.subscription]);
    result.insufficientGeneration = { status: failedResult.status, generatedCount: failedResult.generatedCount, quotaDelta: Number(failAfterRows[0]?.consumed ?? 0)-failBefore };
    for (const question of generatedQuestions) await questions.approve(question.id, system);
    const test = await tests.create({ title: 'OpenRouter grounded validation test', classId: id.classId, subjectId: id.subject, language: 'en', durationMinutes: 15 }, teacher);
    id.test = test.id;
    await tests.bulk(test.id, { questionIds: generatedQuestions.map((q: {id:string}) => q.id) }, teacher);
    const finalized = await tests.finalize(test.id, teacher);
    const pdf = await exports.create(test.id, { type: TestExportType.QUESTION_PAPER }, teacher, `openrouter-${id.test}`);
    id.export = pdf.id;
    const notes = await notifications.list(teacher.id, 1, 20);
    result.downstream = { testStatus: finalized.status, testQuestions: finalized.totalQuestions, pdfStatus: pdf.status, pdfSizeBytes: pdf.sizeBytes, notifications: notes.total };
    result.persistence = (await db.query(`SELECT (SELECT COUNT(*) FROM content_chunks WHERE document_version_id=$1)::int chunks, (SELECT COUNT(*) FROM content_chunk_embeddings e JOIN content_chunks c ON c.id=e.content_chunk_id WHERE c.document_version_id=$1 AND e.status='COMPLETED')::int embeddings`, [id.version]))[0];
    process.stdout.write(`OPENROUTER_PIPELINE_VALIDATION=${JSON.stringify(result)}\n`);
  } finally {
    await app.close();
  }
}
main().catch((error: unknown) => { const safe = error instanceof Error ? `${error.name}: ${error.message}` : 'Unknown validation error'; process.stderr.write(`OPENROUTER_PIPELINE_VALIDATION_FAILED=${safe}\n`); process.exitCode = 1; });
