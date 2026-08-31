import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const id =
      typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'] : randomUUID();
    req.headers['x-request-id'] = id;
    res.setHeader('x-request-id', id);
    next();
  }
}
