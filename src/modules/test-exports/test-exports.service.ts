import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import {
  OBJECT_STORAGE_PROVIDER,
  ObjectStorageProvider,
} from '../../infrastructure/storage/object-storage.provider';
import { AuditService } from '../audit/audit.service';
import { EntitlementException, EntitlementService } from '../subscriptions/entitlement.service';
import { UsageMetric } from '../subscriptions/subscription.enums';
import { UsageService } from '../subscriptions/usage.service';
import { ExamTest } from '../tests/entities/test.entity';
import { TestStatus } from '../tests/test.enums';
import { CreateTestExportDto } from './dto/test-export.dto';
import { TestExport } from './entities/test-export.entity';
import {
  TestExportErrorCode,
  TestExportStatus,
  TestExportType,
  TestRenderMode,
} from './test-export.enums';
import { PDF_RENDERER, PdfRenderer } from './test-render-model';
import { TestRenderModelService } from './test-render-model.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/notification.types';

@Injectable()
export class TestExportsService {
  private readonly logger = new Logger(TestExportsService.name);
  constructor(
    private data: DataSource,
    @InjectRepository(TestExport) private exports: Repository<TestExport>,
    @InjectRepository(ExamTest) private tests: Repository<ExamTest>,
    private config: ConfigService,
    private models: TestRenderModelService,
    @Inject(PDF_RENDERER) private renderer: PdfRenderer,
    @Inject(OBJECT_STORAGE_PROVIDER) private storage: ObjectStorageProvider,
    private entitlement: EntitlementService,
    private usage: UsageService,
    private audit: AuditService,
    private notifications?: NotificationsService,
  ) {}

  async create(
    testId: string,
    dto: CreateTestExportDto,
    user: AuthenticatedUser,
    idempotencyKey?: string,
  ) {
    const prepared = await this.data.transaction(async (manager) => {
      const test = await this.lockTest(testId, user, manager);
      if (test.status !== TestStatus.FINALIZED)
        throw new BadRequestException(TestExportErrorCode.TEST_NOT_FINALIZED);
      const renderVersion = this.config.get<string>('pdf.renderVersion') ?? 'test-pdf-v1';
      await manager.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [
        `${testId}:${dto.type}:${renderVersion}`,
      ]);
      if (idempotencyKey) {
        const prior = await manager
          .getRepository(TestExport)
          .findOneBy({ requestedBy: user.id, idempotencyKey: idempotencyKey.slice(0, 180) });
        if (prior) return { export: prior, process: false };
      }
      const cached = await manager.getRepository(TestExport).findOne({
        where: { testId, type: dto.type, renderVersion, status: TestExportStatus.COMPLETED },
        order: { createdAt: 'DESC' },
      });
      if (cached) return { export: cached, process: false };
      const active = await manager.getRepository(TestExport).findOne({
        where: { testId, type: dto.type, renderVersion, status: TestExportStatus.PROCESSING },
        order: { createdAt: 'DESC' },
      });
      if (active?.leaseExpiresAt && active.leaseExpiresAt > new Date())
        throw new ConflictException(TestExportErrorCode.TEST_EXPORT_ALREADY_PROCESSING);
      const entity = await manager.getRepository(TestExport).save({
        testId,
        requestedBy: user.id,
        type: dto.type,
        status: TestExportStatus.PENDING,
        storageKey: null,
        filename: this.filename(test.title, dto.type),
        mimeType: 'application/pdf',
        sizeBytes: null,
        sha256: null,
        renderVersion,
        testSnapshotVersion: test.version,
        usageReservationId: null,
        idempotencyKey: idempotencyKey?.slice(0, 180) || null,
        errorCode: null,
        processingToken: null,
        leaseExpiresAt: null,
        startedAt: null,
        completedAt: null,
        failedAt: null,
        downloadCount: 0,
        lastDownloadedAt: null,
      });
      try {
        const entitlement = await this.entitlement.resolve(user, UsageMetric.PDF_EXPORTS, manager);
        const reservation = await this.usage.reserve(
          entitlement,
          1,
          'TEST_EXPORT',
          entity.id,
          user.id,
          manager,
        );
        entity.usageReservationId = reservation.id;
        await manager.getRepository(TestExport).save(entity);
      } catch (error) {
        if (error instanceof EntitlementException)
          throw new ConflictException(TestExportErrorCode.PDF_EXPORT_LIMIT_EXCEEDED);
        throw error;
      }
      await this.audit.record(
        {
          actorId: user.id,
          action: 'test.export.create',
          entityType: 'test_export',
          entityId: entity.id,
          metadata: { testId, type: dto.type, renderVersion },
        },
        manager,
      );
      return { export: entity, process: true };
    });
    if (!prepared.process) return this.safe(prepared.export);
    return this.process(prepared.export.id, user);
  }

  async process(exportId: string, user: AuthenticatedUser) {
    const token = randomUUID();
    const claimedRows = await this.data.query(
      `UPDATE test_exports SET status='PROCESSING',processing_token=$2,lease_expires_at=now()+interval '10 minutes',started_at=COALESCE(started_at,now()),error_code=NULL WHERE id=$1 AND (status='PENDING' OR status='FAILED' OR (status='PROCESSING' AND lease_expires_at<now())) RETURNING *`,
      [exportId, token],
    );
    if (!claimedRows.length)
      throw new ConflictException(TestExportErrorCode.TEST_EXPORT_ALREADY_PROCESSING);
    const claimed = await this.exports.findOneByOrFail({ id: exportId, processingToken: token });
    const storageKey = `${this.config.get<string>('pdf.storagePrefix') ?? 'test-exports'}/${claimed.testId}/${claimed.id}.pdf`;
    let stored = false;
    let phase: 'render' | 'storage' | 'settlement' = 'render';
    try {
      const mode =
        claimed.type === TestExportType.ANSWER_KEY
          ? TestRenderMode.ANSWER_KEY
          : TestRenderMode.QUESTION_PAPER;
      const model = await this.models.build(claimed.testId, mode);
      if (model.questions.length > (this.config.get<number>('pdf.maxQuestions') ?? 500))
        throw new BadRequestException('PDF question limit exceeded');
      let buffer: Buffer;
      if (await this.storage.exists(storageKey)) buffer = await this.storage.getObject(storageKey);
      else {
        buffer = await this.renderer.render(model);
        this.validate(buffer);
        phase = 'storage';
        await this.storage.putObject(storageKey, buffer, 'application/pdf');
        stored = true;
      }
      this.validate(buffer);
      const sha256 = createHash('sha256').update(buffer).digest('hex');
      phase = 'settlement';
      const completed = await this.data.transaction(async (manager) => {
        const current = await manager
          .getRepository(TestExport)
          .findOneByOrFail({ id: exportId, processingToken: token });
        if (!current.usageReservationId) throw new Error('EXPORT_RESERVATION_MISSING');
        await this.usage.settleReservation(current.usageReservationId, 1, user.id, manager);
        Object.assign(current, {
          status: TestExportStatus.COMPLETED,
          storageKey,
          sizeBytes: buffer.length,
          sha256,
          completedAt: new Date(),
          processingToken: null,
          leaseExpiresAt: null,
          errorCode: null,
        });
        await manager.getRepository(TestExport).save(current);
        await this.audit.record(
          {
            actorId: user.id,
            action: 'test.export.complete',
            entityType: 'test_export',
            entityId: exportId,
            metadata: {
              type: current.type,
              sizeBytes: buffer.length,
              sha256,
              renderVersion: current.renderVersion,
            },
          },
          manager,
        );
        return current;
      });
      await this.notifications?.create({
        userId: user.id,
        type: NotificationType.PDF_EXPORT_COMPLETED,
        title: 'PDF export completed',
        message: 'Your secure PDF export is ready to download.',
        deduplicationKey: `pdf:${exportId}:completed:${user.id}`,
        metadata: { exportId, testId: completed.testId, type: completed.type },
      });
      return this.safe(completed);
    } catch (error) {
      this.logger.error(
        'Test PDF export processing failed',
        error instanceof Error ? error.stack : undefined,
      );
      if (stored) await this.storage.deleteObject(storageKey).catch(() => undefined);
      const current = await this.exports.findOneBy({ id: exportId });
      if (current?.usageReservationId)
        await this.usage
          .releaseReservation(current.usageReservationId, user.id)
          .catch(() => undefined);
      const code =
        error instanceof BadRequestException
          ? TestExportErrorCode.PDF_INVALID_OUTPUT
          : phase === 'storage'
            ? TestExportErrorCode.PDF_STORAGE_FAILED
            : phase === 'settlement'
              ? TestExportErrorCode.PDF_EXPORT_PROVIDER_ERROR
              : TestExportErrorCode.PDF_RENDER_FAILED;
      await this.exports.update(
        { id: exportId, processingToken: token },
        {
          status: TestExportStatus.FAILED,
          errorCode: code,
          failedAt: new Date(),
          processingToken: null,
          leaseExpiresAt: null,
        },
      );
      await this.audit.record({
        actorId: user.id,
        action: 'test.export.failed',
        entityType: 'test_export',
        entityId: exportId,
        metadata: { errorCode: code },
        outcome: 'FAILED',
      });
      await this.notifications
        ?.create({
          userId: user.id,
          type: NotificationType.PDF_EXPORT_FAILED,
          title: 'PDF export failed',
          message: 'Your PDF export could not be completed. You can retry from the application.',
          deduplicationKey: `pdf:${exportId}:failed:${user.id}`,
          metadata: { exportId },
        })
        ?.catch(() => undefined);
      throw new BadRequestException(code);
    }
  }

  async list(testId: string, user: AuthenticatedUser) {
    await this.scopedTest(testId, user);
    return (await this.exports.find({ where: { testId }, order: { createdAt: 'DESC' } })).map(
      (item) => this.safe(item),
    );
  }
  async get(testId: string, exportId: string, user: AuthenticatedUser) {
    await this.scopedTest(testId, user);
    const item = await this.exports.findOneBy({ id: exportId, testId });
    if (!item) throw new NotFoundException(TestExportErrorCode.TEST_EXPORT_NOT_FOUND);
    return this.safe(item);
  }
  async download(testId: string, exportId: string, user: AuthenticatedUser) {
    await this.scopedTest(testId, user);
    const item = await this.exports.findOneBy({
      id: exportId,
      testId,
      status: TestExportStatus.COMPLETED,
    });
    if (!item?.storageKey) throw new NotFoundException(TestExportErrorCode.TEST_EXPORT_NOT_FOUND);
    const buffer = await this.storage.getObject(item.storageKey);
    this.validate(buffer);
    await this.exports.increment({ id: item.id }, 'downloadCount', 1);
    await this.exports.update(item.id, { lastDownloadedAt: new Date() });
    await this.audit.record({
      actorId: user.id,
      action: 'test.export.download',
      entityType: 'test_export',
      entityId: item.id,
      metadata: { type: item.type },
    });
    return { buffer, filename: item.filename, mimeType: item.mimeType };
  }
  private validate(buffer: Buffer) {
    const max = this.config.get<number>('pdf.maxFileSizeBytes') ?? 10 * 1024 * 1024;
    if (
      buffer.length < 8 ||
      buffer.length > max ||
      buffer.subarray(0, 5).toString('ascii') !== '%PDF-'
    )
      throw new BadRequestException(TestExportErrorCode.PDF_INVALID_OUTPUT);
  }
  private filename(title: string, type: TestExportType) {
    const slug =
      title
        .normalize('NFKD')
        .split('')
        .map((character) => (character.charCodeAt(0) < 32 ? ' ' : character))
        .join('')
        .replace(/[<>:"/\\|?*]+/g, ' ')
        .replace(/\.\.+/g, ' ')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 100) || 'test';
    return `${slug}-${type === TestExportType.ANSWER_KEY ? 'answer-key' : 'question-paper'}.pdf`;
  }
  private async lockTest(id: string, user: AuthenticatedUser, manager: EntityManager) {
    const test = await manager
      .getRepository(ExamTest)
      .createQueryBuilder('test')
      .setLock('pessimistic_read')
      .where('test.id=:id', { id })
      .getOne();
    if (!test) throw new NotFoundException('Test not found');
    this.authorize(test, user);
    return test;
  }
  private async scopedTest(id: string, user: AuthenticatedUser) {
    const test = await this.tests.findOneBy({ id });
    if (!test) throw new NotFoundException('Test not found');
    this.authorize(test, user);
    return test;
  }
  private authorize(test: ExamTest, user: AuthenticatedUser) {
    if (user.role !== UserRole.SYSTEM_ADMIN && test.createdBy !== user.id)
      throw new ForbiddenException(TestExportErrorCode.TEST_EXPORT_ACCESS_DENIED);
  }
  private safe(item: TestExport) {
    return {
      id: item.id,
      testId: item.testId,
      type: item.type,
      status: item.status,
      filename: item.filename,
      mimeType: item.mimeType,
      sizeBytes: item.sizeBytes,
      sha256: item.sha256,
      renderVersion: item.renderVersion,
      testSnapshotVersion: item.testSnapshotVersion,
      errorCode: item.errorCode,
      createdAt: item.createdAt,
      completedAt: item.completedAt,
      downloadCount: item.downloadCount,
      lastDownloadedAt: item.lastDownloadedAt,
    };
  }
}
