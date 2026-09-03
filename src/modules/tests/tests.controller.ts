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
  CreateTestSectionDto,
  UpdateTestSectionDto,
  ReorderTestSectionsDto,
  AssignQuestionSectionDto,
} from './dto/test.dto';
import { TestsService } from './tests.service';
import { TestSectionsService } from './test-sections.service';
@ApiTags('Test Builder')
@ApiBearerAuth()
@RequireVerifiedEmail()
@Roles(UserRole.TEACHER, UserRole.SCHOOL_ADMIN, UserRole.SYSTEM_ADMIN)
@Controller('tests')
export class TestsController {
  constructor(
    private tests: TestsService,
    private sections: TestSectionsService,
  ) {}
  @Get(':id/sections')
  @ApiOperation({ summary: 'List ordered sections for an authorized Test' })
  sectionsList(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthenticatedUser) {
    return this.sections.list(id, u);
  }
  @Post(':id/sections')
  @ApiOperation({ summary: 'Create a section on an authorized DRAFT Test' })
  sectionCreate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: CreateTestSectionDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.sections.create(id, d, u);
  }
  @Patch(':id/sections/order')
  @ApiOperation({ summary: 'Replace the complete section order on a DRAFT Test' })
  sectionOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: ReorderTestSectionsDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.sections.reorder(id, d, u);
  }
  @Patch(':id/sections/:sectionId')
  @ApiOperation({ summary: 'Update section metadata on a DRAFT Test' })
  sectionUpdate(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Body() d: UpdateTestSectionDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.sections.update(id, sectionId, d, u);
  }
  @Delete(':id/sections/:sectionId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete an empty section from a DRAFT Test' })
  sectionDelete(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.sections.remove(id, sectionId, u);
  }
  @Patch(':id/questions/:testQuestionId/section')
  @ApiOperation({ summary: 'Assign a Test Question to an owned section' })
  questionSection(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('testQuestionId', ParseUUIDPipe) questionId: string,
    @Body() d: AssignQuestionSectionDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.sections.assign(id, questionId, d, u);
  }
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
