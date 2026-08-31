import { Module } from '@nestjs/common';
import { FileValidationService } from './file-validation.service';
import {
  MALWARE_SCANNER_PROVIDER,
  UnconfiguredMalwareScannerProvider,
} from './malware-scanner.provider';
@Module({
  providers: [
    FileValidationService,
    UnconfiguredMalwareScannerProvider,
    { provide: MALWARE_SCANNER_PROVIDER, useExisting: UnconfiguredMalwareScannerProvider },
  ],
  exports: [FileValidationService, MALWARE_SCANNER_PROVIDER],
})
export class FileSecurityModule {}
