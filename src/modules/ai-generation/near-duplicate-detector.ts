import { Injectable } from '@nestjs/common';
@Injectable()
export class NearDuplicateDetector {
  check() {
    return { duplicate: false, implemented: false };
  }
}
