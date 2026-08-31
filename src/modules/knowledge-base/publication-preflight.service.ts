import { Injectable } from '@nestjs/common';
import { DocumentVersion } from './entities/document-version.entity';
import { KnowledgeReadinessService } from './knowledge-readiness.service';
@Injectable()
export class PublicationPreflightService {
  constructor(private readonly readiness: KnowledgeReadinessService) {}
  evaluate(version: DocumentVersion) {
    return this.readiness.evaluate(version);
  }
}
