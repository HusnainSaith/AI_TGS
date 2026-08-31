import { Module } from '@nestjs/common';
import { FileValidationService } from './file-validation.service';
import {
  MALWARE_SCANNER_PROVIDER,
  UnconfiguredMalwareScannerProvider,
} from './malware-scanner.provider';
import { ConfigService } from '@nestjs/config';
import { WindowsDefenderMalwareScannerProvider } from './windows-defender-malware-scanner.provider';
@Module({
  providers: [
    FileValidationService,
    UnconfiguredMalwareScannerProvider,
    WindowsDefenderMalwareScannerProvider,
    {
      provide: MALWARE_SCANNER_PROVIDER,
      inject: [
        ConfigService,
        UnconfiguredMalwareScannerProvider,
        WindowsDefenderMalwareScannerProvider,
      ],
      useFactory: (
        config: ConfigService,
        none: UnconfiguredMalwareScannerProvider,
        defender: WindowsDefenderMalwareScannerProvider,
      ) =>
        config.get<string>('ingestion.malwareScannerProvider') === 'windows_defender'
          ? defender
          : none,
    },
  ],
  exports: [FileValidationService, MALWARE_SCANNER_PROVIDER],
})
export class FileSecurityModule {}
