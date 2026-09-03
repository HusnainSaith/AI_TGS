import { Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { EmbeddingService } from './embedding.service';

@Injectable()
export class EmbeddingReindexService {
  constructor(private readonly embeddings: EmbeddingService) {}
  reindex(versionId: string, user: AuthenticatedUser) {
    return this.embeddings.createAndDispatch(versionId, user, true);
  }
}
