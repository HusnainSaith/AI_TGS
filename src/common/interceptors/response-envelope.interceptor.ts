import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';
export interface ApiResponse<T> {
  success: true;
  message: string;
  data: T;
}
@Injectable()
export class ResponseEnvelopeInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    return next
      .handle()
      .pipe(map((data) => ({ success: true, message: 'Operation successful', data })));
  }
}
