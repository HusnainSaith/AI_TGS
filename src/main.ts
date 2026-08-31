import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  const config = app.get(ConfigService);
  if (config.get('app.trustProxy')) app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.use(helmet());
  app.enableCors({ origin: config.get<string[]>('app.corsOrigins'), credentials: true });
  app.setGlobalPrefix(config.getOrThrow('app.prefix'));
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
  if (config.get('app.swagger') && config.get('app.env') !== 'production') {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('TGS API').setVersion('1.0').addBearerAuth().build(),
    );
    SwaggerModule.setup('api/docs', app, document);
  }
  await app.listen(config.getOrThrow<number>('app.port'));
}
void bootstrap();
