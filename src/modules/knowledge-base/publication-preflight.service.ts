import { Injectable } from '@nestjs/common';
import { DocumentVersion } from './entities/document-version.entity';
import { KnowledgeReadinessService } from './knowledge-readiness.service';
import { EntityManager } from 'typeorm';
@Injectable()
export class PublicationPreflightService {
  constructor(private readonly readiness: KnowledgeReadinessService) {}
  evaluate(version: DocumentVersion, manager?: EntityManager) {
    return this.readiness.evaluate(version, manager);
  }
}
