import { z } from 'zod';

export const addCommentSchema = z.object({
  text:   z.string().trim().min(1).max(2000),
  rating: z.number().int().min(1).max(5),
  color:  z.string().trim().min(1).max(20),
  date:   z.string().trim().min(1).max(50),
}).passthrough();

export const addStepCommentSchema = z.object({
  text: z.string().trim().min(50).max(5000),
}).passthrough();
