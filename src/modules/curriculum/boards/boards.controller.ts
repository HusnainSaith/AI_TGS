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
import { CreateBoardDto, PaginationQueryDto, UpdateBoardDto } from '../dto/curriculum.dto';
import { BoardsService } from './boards.service';
import { assertStatusFilterAllowed } from '../curriculum.utils';
@ApiTags('Curriculum - Boards')
@ApiBearerAuth()
@RequireVerifiedEmail()
@Controller('boards')
export class BoardsController {
  constructor(private readonly service: BoardsService) {}
  @Post() @Roles(UserRole.SYSTEM_ADMIN) @ApiOperation({ summary: 'Create a global board' }) create(
    @Body() dto: CreateBoardDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.service.create(dto, u.id);
  }
  @Get() @ApiOperation({ summary: 'List boards with pagination' }) list(
    @Query() q: PaginationQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    assertStatusFilterAllowed(q.status, user);
    return this.service.list(q);
  }
  @Get(':id') @ApiOperation({ summary: 'Get a board' }) get(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.find(id);
  }
  @Patch(':id')
  @Roles(UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Update an active board' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBoardDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.service.update(id, dto, u.id);
  }
  @Delete(':id')
  @HttpCode(204)
  @Roles(UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Archive a board' })
  archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthenticatedUser) {
    return this.service.archive(id, u.id);
  }
}
