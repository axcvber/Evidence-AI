import type { EndpointDefinition, HttpMethod } from '@evidence/shared';
import {
  applyDecorators,
  createParamDecorator,
  ExecutionContext,
  HttpCode,
  HttpStatus,
  RequestMapping,
  RequestMethod,
  SetMetadata,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { z } from 'zod';
import { DomainError } from '../common/domain-error.js';

export const ENDPOINT = 'api:endpoint';

const requestMethods: Record<HttpMethod, RequestMethod> = {
  GET: RequestMethod.GET,
  POST: RequestMethod.POST,
  PUT: RequestMethod.PUT,
  PATCH: RequestMethod.PATCH,
  DELETE: RequestMethod.DELETE,
};

type JsonSchema = Record<string, unknown>;

function jsonSchema(schema: z.ZodType): JsonSchema {
  return z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' });
}

function fieldDocs(
  schema: z.ZodObject<Record<string, z.ZodType>> | undefined,
  kind: 'param' | 'query',
): MethodDecorator[] {
  if (!schema) return [];
  const fields = Object.entries(schema.shape);
  return fields.map(([name, field]) => {
    const options = {
      name,
      required: !field.safeParse(undefined).success,
      schema: jsonSchema(field),
    };
    return kind === 'param' ? ApiParam(options) : ApiQuery(options);
  });
}

/**
 * Registers a route from a shared contract: method and path, success status, OpenAPI docs
 * (generated from the contract's Zod schemas) and, through @Input(), validated input. The
 * response is filtered through the contract by ContractResponseInterceptor.
 */
export function Endpoint(contract: EndpointDefinition) {
  const status = contract.status ?? HttpStatus.OK;
  const hasInput = Boolean(contract.params ?? contract.query ?? contract.body);
  return applyDecorators(
    SetMetadata(ENDPOINT, contract),
    RequestMapping({ path: contract.path, method: requestMethods[contract.method] }),
    HttpCode(status),
    ApiOperation({ summary: contract.summary }),
    ApiResponse({ status, description: 'Success', standardSchema: contract.response }),
    ...(contract.body ? [ApiBody({ schema: jsonSchema(contract.body) })] : []),
    ...(hasInput
      ? [ApiBadRequestResponse({ description: 'VALIDATION_FAILED: invalid input' })]
      : []),
    ...fieldDocs(contract.params, 'param'),
    ...fieldDocs(contract.query, 'query'),
  );
}

export interface ValidationIssue {
  /** Where the problem is, e.g. `body.email` or `query.limit`. */
  path: string;
  message: string;
}

export class ValidationFailedError extends DomainError {
  override readonly name = 'ValidationFailedError';
  readonly status = HttpStatus.BAD_REQUEST;
  readonly code = 'VALIDATION_FAILED';

  constructor(override readonly details: ValidationIssue[]) {
    super('The request is invalid');
  }
}

interface RawRequest {
  params: unknown;
  query: unknown;
  body: unknown;
}

/**
 * The validated `{ params, query, body }` of an @Endpoint route, typed with
 * `ValidatedInput<typeof contract>`. Invalid input never reaches the handler: it becomes a
 * 400 VALIDATION_FAILED listing every problem.
 */
export const Input = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const contract = Reflect.getMetadata(ENDPOINT, context.getHandler()) as
    EndpointDefinition | undefined;
  if (!contract) throw new Error('@Input() can only be used on @Endpoint() routes');

  const request = context.switchToHttp().getRequest<RawRequest>();
  const issues: ValidationIssue[] = [];
  const parse = (part: keyof RawRequest, schema: z.ZodType | undefined) => {
    if (!schema) return undefined;
    const result = schema.safeParse(request[part] ?? (part === 'body' ? undefined : {}));
    if (result.success) return result.data;
    for (const issue of result.error.issues) {
      issues.push({ path: [part, ...issue.path.map(String)].join('.'), message: issue.message });
    }
    return undefined;
  };

  const input = {
    params: parse('params', contract.params),
    query: parse('query', contract.query),
    body: parse('body', contract.body),
  };
  if (issues.length > 0) throw new ValidationFailedError(issues);
  return input;
});
