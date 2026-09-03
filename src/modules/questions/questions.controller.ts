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
import { RequireVerifiedEmail } from '../../common/decorators/verified-email.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { CreateQuestionDto, ListQuestionsDto, UpdateQuestionDto } from './dto/question.dto';
import { QuestionsService } from './questions.service';
@ApiTags('Question Bank')
@ApiBearerAuth()
@RequireVerifiedEmail()
@Controller('questions')
export class QuestionsController {
  constructor(private readonly questions: QuestionsService) {}
  @Post()
  @Roles(UserRole.TEACHER, UserRole.SYSTEM_ADMIN)
  @ApiOperation({
    summary: 'Create a trusted manual question',
    description:
      'MCQ requires four options; TRUE_FALSE requires TRUE and FALSE. Internal provenance fields are server controlled.',
  })
  create(@Body() dto: CreateQuestionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.questions.create(dto, user);
  }
  @Get()
  @Roles(UserRole.TEACHER, UserRole.SCHOOL_ADMIN, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'List the accessible question bank with PostgreSQL pagination' })
  list(@Query() query: ListQuestionsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.questions.list(query, user);
  }
  @Get(':id')
  @Roles(UserRole.TEACHER, UserRole.SCHOOL_ADMIN, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Get an authorized question with ordered options' })
  find(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.questions.find(id, user);
  }
  @Patch(':id')
  @Roles(UserRole.TEACHER, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Update an owned manual question atomically' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuestionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.questions.update(id, dto, user);
  }
  @Delete(':id')
  @HttpCode(204)
  @Roles(UserRole.TEACHER, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Archive an authorized question' })
  archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.questions.archive(id, user);
  }
  @Post(':id/approve')
  @Roles(UserRole.TEACHER, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Approve an authorized question without changing grounding' })
  approve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.questions.approve(id, user);
  }
  @Post(':id/publish-to-school')
  @Roles(UserRole.SCHOOL_ADMIN)
  @ApiOperation({ summary: 'Publish an approved question to the administrator school bank' })
  publish(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.questions.publishToSchool(id, user);
  }
  @Delete(':id/publish-to-school')
  @HttpCode(204)
  @Roles(UserRole.SCHOOL_ADMIN)
  @ApiOperation({ summary: 'Remove a question from the administrator school bank' })
  unpublish(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.questions.unpublishFromSchool(id, user);
  }
}
