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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequireVerifiedEmail } from '../../../common/decorators/verified-email.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../common/enums/user-role.enum';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { CreateSubjectDto, SubjectsQueryDto, UpdateSubjectDto } from '../dto/curriculum.dto';
import { SubjectsService } from './subjects.service';
import { assertStatusFilterAllowed } from '../curriculum.utils';
@ApiTags('Curriculum - Subjects')
@ApiBearerAuth()
@RequireVerifiedEmail()
@Controller('subjects')
export class SubjectsController {
  constructor(private readonly service: SubjectsService) {}
  @Post() @Roles(UserRole.SYSTEM_ADMIN) create(
    @Body() dto: CreateSubjectDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.service.create(dto, u.id);
  }
  @Get() @ApiOperation({ summary: 'List subjects with board/class hierarchy validation' }) list(
    @Query() q: SubjectsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    assertStatusFilterAllowed(q.status, user);
    return this.service.list(q);
  }
  @Get(':id') get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.find(id);
  }
  @Patch(':id') @Roles(UserRole.SYSTEM_ADMIN) update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSubjectDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.service.update(id, dto, u.id);
  }
  @Delete(':id')
  @HttpCode(204)
  @Roles(UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Archive a subject' })
  archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthenticatedUser) {
    return this.service.archive(id, u.id);
  }
}
