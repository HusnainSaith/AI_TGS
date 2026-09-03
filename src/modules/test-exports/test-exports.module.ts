import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import { AuditModule } from '../audit/audit.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { TestQuestion } from '../tests/entities/test-question.entity';
import { ExamTest } from '../tests/entities/test.entity';
import { TestExport } from './entities/test-export.entity';
import { PdfLibRenderer } from './pdf-lib-renderer.service';
import { TestExportsController } from './test-exports.controller';
import { TestExportsService } from './test-exports.service';
import { PDF_RENDERER } from './test-render-model';
import { TestRenderModelService } from './test-render-model.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { TestSection } from '../tests/entities/test-section.entity';
@Module({
  imports: [
    TypeOrmModule.forFeature([TestExport, ExamTest, TestQuestion, TestSection]),
    StorageModule,
    AuditModule,
    SubscriptionsModule,
    NotificationsModule,
  ],
  controllers: [TestExportsController],
  providers: [
    TestExportsService,
    TestRenderModelService,
    PdfLibRenderer,
    { provide: PDF_RENDERER, useExisting: PdfLibRenderer },
  ],
  exports: [TestExportsService, TestRenderModelService, PDF_RENDERER],
})
export class TestExportsModule {}
