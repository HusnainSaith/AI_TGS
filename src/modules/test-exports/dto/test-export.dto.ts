import { IsEnum } from 'class-validator';
import { TestExportType } from '../test-export.enums';
export class CreateTestExportDto {
  @IsEnum(TestExportType) type!: TestExportType;
}
