import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { CurriculumModule } from '../curriculum/curriculum.module';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { CurriculumMappingValidator } from '../knowledge-base/curriculum-mapping-validator.service';
import { ContextPackingService } from './context-packing.service';
import { RetrievalController } from './retrieval.controller';
import { RetrievalService } from './retrieval.service';
import { RetrievalEvent } from './entities/retrieval-event.entity';
import { RetrievalEventChunk } from './entities/retrieval-event-chunk.entity';
@Module({
  imports: [
    TypeOrmModule.forFeature([RetrievalEvent, RetrievalEventChunk]),
    AuditModule,
    CurriculumModule,
    EmbeddingsModule,
  ],
  controllers: [RetrievalController],
  providers: [RetrievalService, ContextPackingService, CurriculumMappingValidator],
  exports: [RetrievalService],
})
export class RetrievalModule {}
