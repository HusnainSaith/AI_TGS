import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { School } from './school.entity';
import { User } from '../users/user.entity';
import { SchoolCurriculumPublication } from './school-curriculum-publication.entity';
import { SchoolGovernanceController } from './school-governance.controller';
import { SchoolGovernanceService } from './school-governance.service';
import { AuditModule } from '../audit/audit.module';
import { StorageModule } from '../../infrastructure/storage/storage.module';
@Module({
  imports: [
    TypeOrmModule.forFeature([School, User, SchoolCurriculumPublication]),
    AuditModule,
    StorageModule,
  ],
  controllers: [SchoolGovernanceController],
  providers: [SchoolGovernanceService],
  exports: [TypeOrmModule],
})
export class SchoolsModule {}
