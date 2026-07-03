import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ZodTypeAny, ZodError } from 'zod';

/** Validate req.body against a zod schema. On success, replaces req.body with the
 *  parsed (typed, unknown-key-stripped) value and calls next(). On failure, responds
 *  400 with { error } — the same shape the legacy validate() middleware used. */
export function validateBody(schema: ZodTypeAny): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: formatZodError(result.error) });
      return;
    }
    req.body = result.data;
    next();
  };
}

function formatZodError(err: ZodError): string {
  return err.issues
    .map(i => {
      const path = i.path.join('.');
      return path ? `${path}: ${i.message}` : i.message;
    })
    .join('; ');
}
