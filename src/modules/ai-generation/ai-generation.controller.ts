import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequireVerifiedEmail } from '../../common/decorators/verified-email.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AiGenerationService } from './ai-generation.service';
import { CreateGenerationDto } from './dto/generation.dto';
@ApiTags('Grounded AI Generation')
@ApiBearerAuth()
@RequireVerifiedEmail()
@Controller('ai')
export class AiGenerationController {
  constructor(private readonly generation: AiGenerationService) {}
  @Post('tests/generate')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Roles(UserRole.TEACHER, UserRole.SCHOOL_ADMIN, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Create an asynchronous REQUIRED-grounding generation job' })
  create(@Body() dto: CreateGenerationDto, @CurrentUser() user: AuthenticatedUser) {
    return this.generation.create(dto, user);
  }
  @Post('jobs/:jobId/process')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Roles(UserRole.TEACHER, UserRole.SCHOOL_ADMIN, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Process a durable job using the same service future workers call' })
  process(@Param('jobId', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.generation.process(id, user);
  }
  @Get('jobs/:jobId')
  @Roles(UserRole.TEACHER, UserRole.SCHOOL_ADMIN, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Read an owned generation job and its item status' })
  get(@Param('jobId', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.generation.get(id, user);
  }
  @Get('jobs/:jobId/items')
  @Roles(UserRole.TEACHER, UserRole.SCHOOL_ADMIN, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'List deterministic generation units and failures' })
  items(@Param('jobId', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.generation.listItems(id, user);
  }
  @Get('jobs/:jobId/retrieval')
  @Roles(UserRole.TEACHER, UserRole.SCHOOL_ADMIN, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'List safe RetrievalEvent metadata linked to job items' })
  retrieval(@Param('jobId', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.generation.retrievalEvents(id, user);
  }
  @Post('jobs/:jobId/items/:itemId/regenerate')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Roles(UserRole.TEACHER, UserRole.SCHOOL_ADMIN, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Regenerate one item with new retrieval and preserved history' })
  regenerate(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.generation.regenerate(jobId, itemId, user);
  }
  @Delete('jobs/:jobId')
  @HttpCode(204)
  @Roles(UserRole.TEACHER, UserRole.SCHOOL_ADMIN, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Cancel a job without deleting questions or citations' })
  cancel(@Param('jobId', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.generation.cancel(id, user);
  }
}
