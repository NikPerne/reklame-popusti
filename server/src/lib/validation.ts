import createError from '@fastify/error';
import type { z } from 'zod';

const ValidationError = createError<[string]>('VALIDATION_ERROR', 'Invalid request: %s', 400);

/** Parses request input with zod; throws a 400 listing every problem. */
export function parseOrBadRequest<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
      .join('; ');
    throw new ValidationError(details);
  }
  return result.data;
}
