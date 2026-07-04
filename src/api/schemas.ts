import { z } from 'zod';

export const cardCodeParamsSchema = z.object({
  code: z.string().min(1).max(128),
}).strict();

export type CardCodeParams = z.infer<typeof cardCodeParamsSchema>;
