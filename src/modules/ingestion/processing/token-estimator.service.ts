import { Injectable } from '@nestjs/common';
@Injectable()
export class TokenEstimatorService {
  estimate(text: string): number {
    return Math.max(1, Math.ceil(text.length / 4));
  }
}
