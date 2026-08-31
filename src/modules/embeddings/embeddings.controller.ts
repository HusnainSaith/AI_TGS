import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequireVerifiedEmail } from '../../common/decorators/verified-email.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { EmbeddingReindexService } from './embedding-reindex.service';
import { EmbeddingService } from './embedding.service';

@ApiTags('Knowledge Base Embeddings')
@ApiBearerAuth()
@RequireVerifiedEmail()
@Controller('kb')
export class EmbeddingsController {
  constructor(
    private readonly embeddings: EmbeddingService,
    private readonly reindexer: EmbeddingReindexService,
  ) {}

  @Post('document-versions/:id/embed')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.SCHOOL_ADMIN)
  @ApiOperation({
    summary: 'Create and synchronously process durable embedding work',
    description:
      'Uses the server-controlled active provider/model. Requires CLEAN malware status and completed extraction. Vectors are never returned.',
  })
  embed(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.embeddings.createAndProcess(id, user);
  }

  @Get('document-versions/:id/embeddings')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.TEACHER)
  @ApiOperation({ summary: 'Read safe active embedding status without vector values' })
  status(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.embeddings.status(id, user);
  }

  @Post('document-versions/:id/embeddings/reindex')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.SCHOOL_ADMIN)
  @ApiOperation({
    summary: 'Re-index missing, failed, or stale embeddings using active configuration',
  })
  reindex(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.reindexer.reindex(id, user);
  }

  @Post('embedding-jobs/:id/retry')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.SCHOOL_ADMIN)
  @ApiOperation({ summary: 'Retry only failed work in a FAILED or PARTIAL embedding job' })
  retry(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.embeddings.retry(id, user);
  }
}
