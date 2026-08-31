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
import { ClassesQueryDto, CreateClassDto, UpdateClassDto } from '../dto/curriculum.dto';
import { ClassesService } from './classes.service';
import { assertStatusFilterAllowed } from '../curriculum.utils';
@ApiTags('Curriculum - Classes')
@ApiBearerAuth()
@RequireVerifiedEmail()
@Controller('classes')
export class ClassesController {
  constructor(private readonly service: ClassesService) {}
  @Post()
  @Roles(UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Create a class under an active board' })
  create(@Body() dto: CreateClassDto, @CurrentUser() u: AuthenticatedUser) {
    return this.service.create(dto, u.id);
  }
  @Get() @ApiOperation({ summary: 'List classes; optionally filter by boardId' }) list(
    @Query() q: ClassesQueryDto,
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
    @Body() dto: UpdateClassDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.service.update(id, dto, u.id);
  }
  @Delete(':id')
  @HttpCode(204)
  @Roles(UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Archive a class' })
  archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthenticatedUser) {
    return this.service.archive(id, u.id);
  }
}
