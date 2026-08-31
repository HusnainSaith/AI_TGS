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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequireVerifiedEmail } from '../../common/decorators/verified-email.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import {
  AddQuestionDto,
  BulkAddQuestionsDto,
  CreateTestDto,
  ListTestsDto,
  ReorderQuestionsDto,
  UpdateTestDto,
} from './dto/test.dto';
import { TestsService } from './tests.service';
@ApiTags('Test Builder')
@ApiBearerAuth()
@RequireVerifiedEmail()
@Roles(UserRole.TEACHER, UserRole.SCHOOL_ADMIN, UserRole.SYSTEM_ADMIN)
@Controller('tests')
export class TestsController {
  constructor(private tests: TestsService) {}
  @Post() @ApiOperation({ summary: 'Create a free editable DRAFT Test' }) create(
    @Body() d: CreateTestDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.tests.create(d, u);
  }
  @Get() list(@Query() q: ListTestsDto, @CurrentUser() u: AuthenticatedUser) {
    return this.tests.list(q, u);
  }
  @Get(':id') get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthenticatedUser) {
    return this.tests.get(id, u);
  }
  @Get(':id/preview') preview(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.tests.preview(id, u);
  }
  @Get(':id/answer-key') answer(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.tests.answerKey(id, u);
  }
  @Patch(':id') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: UpdateTestDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.tests.update(id, d, u);
  }
  @Post(':id/questions') add(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: AddQuestionDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.tests.add(id, d, u);
  }
  @Post(':id/questions/bulk') bulk(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: BulkAddQuestionsDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.tests.bulk(id, d, u);
  }
  @Patch(':id/questions/order') order(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: ReorderQuestionsDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.tests.reorder(id, d, u);
  }
  @Post(':id/questions/:testQuestionId/refresh') refresh(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('testQuestionId', ParseUUIDPipe) qid: string,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.tests.refresh(id, qid, u);
  }
  @Delete(':id/questions/:testQuestionId') @HttpCode(204) remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('testQuestionId', ParseUUIDPipe) qid: string,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.tests.remove(id, qid, u);
  }
  @Post(':id/finalize')
  @ApiOperation({ summary: 'Atomically freeze snapshots and consume one TESTS unit' })
  finalize(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthenticatedUser) {
    return this.tests.finalize(id, u);
  }
  @Post(':id/clone') clone(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.tests.clone(id, u);
  }
  @Delete(':id') @HttpCode(204) archive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.tests.archive(id, u);
  }
}
