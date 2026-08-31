import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequireVerifiedEmail } from '../../common/decorators/verified-email.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import {
  CreateKnowledgeDocumentDto,
  ListKnowledgeDocumentsDto,
  ListVersionsDto,
  UpdateKnowledgeDocumentDto,
} from './dto/knowledge-base.dto';
import { KnowledgeBaseService, UploadedFile as KbFile } from './knowledge-base.service';

@ApiTags('Knowledge Base')
@ApiBearerAuth()
@RequireVerifiedEmail()
@Controller('kb')
export class KnowledgeBaseController {
  constructor(private readonly kb: KnowledgeBaseService) {}
  @Post('documents')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.SCHOOL_ADMIN)
  @ApiOperation({
    summary: 'Create governed Knowledge Document metadata',
    description:
      'Scope is authorized from the authenticated role/school. Rights permission confirmation is mandatory. No publication occurs.',
  })
  create(@Body() dto: CreateKnowledgeDocumentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.kb.create(dto, user);
  }
  @Get('documents')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.TEACHER)
  list(@Query() query: ListKnowledgeDocumentsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.kb.list(query, user);
  }
  @Get('documents/:id')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.TEACHER)
  find(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.kb.find(id, user);
  }
  @Patch('documents/:id')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.SCHOOL_ADMIN)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateKnowledgeDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.kb.update(id, dto, user);
  }
  @Delete('documents/:id')
  @HttpCode(204)
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.SCHOOL_ADMIN)
  archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.kb.archive(id, user);
  }
  @Post('documents/:id/versions')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.SCHOOL_ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: Number(process.env.KB_MAX_FILE_SIZE_MB ?? 20) * 1024 * 1024, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({
    summary: 'Upload an immutable version into quarantine',
    description:
      'Accepts PDF, DOCX, or TXT matching the document source type. SHA-256, signature validation, and a durable queued ingestion job are created. Malware scanning/extraction/publication do not occur.',
  })
  upload(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: KbFile | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.kb.upload(id, file, user);
  }
  @Get('documents/:id/versions')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.TEACHER)
  versions(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListVersionsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.kb.listVersions(id, query, user);
  }
  @Get('document-versions/:id')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.TEACHER)
  version(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.kb.findVersion(id, user);
  }
  @Get('document-versions/:id/chunks')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.SCHOOL_ADMIN)
  @ApiOperation({
    summary: 'Inspect normalized chunks for an authorized document version',
    description:
      'Administrative read-only inspection with source locators. No chunk mutation is exposed.',
  })
  chunks(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListVersionsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.kb.listChunks(id, query, user);
  }
}
