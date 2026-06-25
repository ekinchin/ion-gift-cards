import type { FastifyReply } from 'fastify';
import type { ZodError } from 'zod';
import { AppError } from '../../application/errors.ts';

export function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: error.message,
      code: error.code,
    });
  }

  const message = error instanceof Error ? error.message : 'Unknown error';
  return reply.status(500).send({ error: message, code: 'INTERNAL_ERROR' });
}

export function sendValidationError(reply: FastifyReply, error: ZodError) {
  return reply.status(400).send({
    error: 'Invalid request',
    code: 'VALIDATION_ERROR',
    issues: error.issues,
  });
}
