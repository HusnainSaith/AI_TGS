import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<Request>();
    const status =
      error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = error instanceof HttpException ? error.getResponse() : undefined;
    const objectBody =
      typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
    const rawMessage = objectBody.message ?? (typeof body === 'string' ? body : undefined);
    const messages = Array.isArray(rawMessage) ? rawMessage.map(String) : undefined;
    const safeMessage = typeof rawMessage === 'string' ? rawMessage : 'Request failed';
    response.status(status).json({
      success: false,
      message: status === 500 ? 'Internal server error' : (messages?.[0] ?? safeMessage),
      errors: messages ? { validation: messages } : objectBody.errors,
      requestId: request.headers['x-request-id'],
    });
  }
}
