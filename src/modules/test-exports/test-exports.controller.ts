import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequireVerifiedEmail } from '../../common/decorators/verified-email.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { CreateTestExportDto } from './dto/test-export.dto';
import { TestExportsService } from './test-exports.service';
@ApiTags('Test PDF Exports')
@ApiBearerAuth()
@RequireVerifiedEmail()
@Roles(UserRole.TEACHER, UserRole.SCHOOL_ADMIN, UserRole.SYSTEM_ADMIN)
@Controller('tests/:testId/exports')
export class TestExportsController {
  constructor(private exports: TestExportsService) {}
  @Post()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary:
      'Create or reuse a FINALIZED Test PDF artifact; successful new artifacts consume one PDF_EXPORTS unit',
  })
  create(
    @Param('testId', ParseUUIDPipe) testId: string,
    @Body() dto: CreateTestExportDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.exports.createAndDispatch(testId, dto, user, key);
  }
  @Get() list(
    @Param('testId', ParseUUIDPipe) testId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.exports.list(testId, user);
  }
  @Get(':exportId') get(
    @Param('testId', ParseUUIDPipe) testId: string,
    @Param('exportId', ParseUUIDPipe) exportId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.exports.get(testId, exportId, user);
  }
  @Get(':exportId/download')
  @ApiOperation({ summary: 'Download an authorized stored PDF without consuming additional quota' })
  async download(
    @Param('testId', ParseUUIDPipe) testId: string,
    @Param('exportId', ParseUUIDPipe) exportId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ) {
    const file = await this.exports.download(testId, exportId, user);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Length', String(file.buffer.length));
    response.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    response.send(file.buffer);
  }
}
