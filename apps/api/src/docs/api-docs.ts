import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

export const API_DOCS_PATH = 'api/docs';

export function createApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Evidence AI API')
    .setDescription(
      'Multi-tenant knowledge assistant: documents, search and cited answers. ' +
        'Every endpoint is scoped to the caller’s workspace.',
    )
    .setVersion('0.1.0')
    // Session cookie set by Better Auth (/api/auth/*); open the docs through the web origin to send it.
    .addCookieAuth('evidence.session_token')
    .build();

  return SwaggerModule.createDocument(app, config, {
    // Stable, readable operation ids (e.g. `Health_check`) for generated clients.
    operationIdFactory: (controllerKey, methodKey) =>
      `${controllerKey.replace(/Controller$/, '')}_${methodKey}`,
  });
}

/** Serves Swagger UI at /api/docs and the OpenAPI document at /api/docs-json. */
export function setupApiDocs(app: INestApplication): void {
  SwaggerModule.setup(API_DOCS_PATH, app, createApiDocument(app), {
    jsonDocumentUrl: `${API_DOCS_PATH}-json`,
    swaggerOptions: { persistAuthorization: true },
  });
}
