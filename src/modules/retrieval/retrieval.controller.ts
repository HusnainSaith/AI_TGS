import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequireVerifiedEmail } from '../../common/decorators/verified-email.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { RetrievalPreviewDto } from './dto/retrieval.dto';
import { RetrievalService } from './retrieval.service';
@ApiTags('Knowledge Base Retrieval')
@ApiBearerAuth()
@RequireVerifiedEmail()
@Controller('kb')
export class RetrievalController {
  constructor(private readonly retrieval: RetrievalService) {}
  @Post('retrieval/preview')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.SCHOOL_ADMIN)
  @ApiOperation({
    summary: 'Preview tenant- and curriculum-filtered hybrid evidence retrieval',
    description:
      'Combines exact pgvector cosine similarity and PostgreSQL FTS, persists provenance, and returns no vectors. Only active PUBLISHED versions are eligible.',
  })
  preview(@Body() dto: RetrievalPreviewDto, @CurrentUser() user: AuthenticatedUser) {
    return this.retrieval.preview(dto, user);
  }
  @Get('retrieval-events/:id')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.SCHOOL_ADMIN)
  @ApiOperation({ summary: 'Inspect an authorized immutable retrieval evidence snapshot' })
  event(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.retrieval.findEvent(id, user);
  }
}
