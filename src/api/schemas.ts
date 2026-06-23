import { z } from 'zod';

export const cardCodeParamsSchema = z.object({
  code: z.string().min(1).max(128),
}).strict();

export const createCardBodySchema = z.object({
  code: z.string().min(1).max(128),
  amount: z.number().positive(),
}).strict();

export const mutateCardBodySchema = z.object({
  amount: z.number().positive(),
  description: z.string().max(500).optional(),
}).strict();

export type CardCodeParams = z.infer<typeof cardCodeParamsSchema>;
export type CreateCardBody = z.infer<typeof createCardBodySchema>;
export type MutateCardBody = z.infer<typeof mutateCardBodySchema>;
