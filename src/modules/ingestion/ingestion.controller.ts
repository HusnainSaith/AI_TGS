import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequireVerifiedEmail } from '../../common/decorators/verified-email.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { IngestionService } from './ingestion.service';
import { IngestionProcessorService } from './ingestion-processor.service';
import { MalwareScanningService } from './malware-scanning.service';
@ApiTags('Knowledge Base Ingestion')
@ApiBearerAuth()
@RequireVerifiedEmail()
@Controller('kb/ingestion-jobs')
export class IngestionController {
  constructor(
    private readonly ingestion: IngestionService,
    private readonly processor: IngestionProcessorService,
    private readonly scanning: MalwareScanningService,
  ) {}
  @Get(':id') @Roles(UserRole.SYSTEM_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.TEACHER) find(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ingestion.find(id, user);
  }
  @Post(':id/scan')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.SCHOOL_ADMIN)
  @ApiOperation({
    summary: 'Scan a quarantined source with the configured real scanner',
    description:
      'Same-school authorization is enforced. CLEAN is idempotent, FAILED may retry, and INFECTED cannot be automatically retried. No scanner path or raw output is returned.',
  })
  async scan(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    const job = await this.ingestion.authorizeProcessing(id, user);
    return this.scanning.scan(job.documentVersion, user.id);
  }
  @Post(':id/retry')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.SCHOOL_ADMIN)
  @ApiOperation({
    summary: 'Requeue a failed foundation ingestion job',
    description:
      'Limited to three retries. This does not execute malware scanning, extraction, OCR, chunking, or embedding.',
  })
  retry(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ingestion.retry(id, user);
  }
  @Post(':id/process')
  @Roles(UserRole.SYSTEM_ADMIN, UserRole.SCHOOL_ADMIN)
  @ApiOperation({
    summary: 'Process a queued ingestion job without Redis',
    description:
      'Uses the same durable processor intended for future BullMQ workers and stops at AWAITING_MAPPING. Scanner/OCR availability is reported accurately.',
  })
  async process(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.ingestion.authorizeProcessing(id, user);
    return this.processor.processJob(id, user.id);
  }
}
