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
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequireVerifiedEmail } from '../../common/decorators/verified-email.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import {
  ListSchoolTeachersDto,
  PublishCurriculumDto,
  UpdateSchoolBrandingDto,
  UpdateTeacherStatusDto,
} from './dto/school-governance.dto';
import { SchoolGovernanceService } from './school-governance.service';

@ApiTags('School Governance')
@ApiBearerAuth()
@RequireVerifiedEmail()
@Roles(UserRole.SCHOOL_ADMIN)
@Controller('school')
export class SchoolGovernanceController {
  constructor(private service: SchoolGovernanceService) {}
  @Get('teachers') @ApiOperation({ summary: 'List teachers in the administrator school' }) teachers(
    @Query() q: ListSchoolTeachersDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.service.teachers(q, u);
  }
  @Get('teachers/:id') teacher(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.service.teacher(id, u);
  }
  @Patch('teachers/:id/status') status(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: UpdateTeacherStatusDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.service.setTeacherStatus(id, d.status, u);
  }
  @Delete('teachers/:id') @HttpCode(204) remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.service.removeTeacher(id, u);
  }
  @Get('curriculum-publications') curriculum(@CurrentUser() u: AuthenticatedUser) {
    return this.service.listCurriculum(u);
  }
  @Post('curriculum-publications') publish(
    @Body() d: PublishCurriculumDto,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.service.publishCurriculum(d, u);
  }
  @Delete('curriculum-publications/:id') @HttpCode(204) unpublish(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.service.unpublishCurriculum(id, u);
  }
  @Patch('branding')
  @ApiOperation({ summary: 'Update authoritative school PDF branding fields' })
  branding(@Body() d: UpdateSchoolBrandingDto, @CurrentUser() u: AuthenticatedUser) {
    return this.service.updateBranding(d, u);
  }
  @Post('branding/logo')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 1024 * 1024, files: 1 } }))
  logo(
    @UploadedFile() file: { buffer: Buffer; mimetype: string } | undefined,
    @CurrentUser() u: AuthenticatedUser,
  ) {
    return this.service.updateLogo(file, u);
  }
}
