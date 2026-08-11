import { z } from 'zod';

export const inviteCollaboratorSchema = z.object({
  email: z.string().trim().email().max(200),
}).strict();
