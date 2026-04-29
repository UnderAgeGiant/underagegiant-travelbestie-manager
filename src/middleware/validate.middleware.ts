import { Request, Response, NextFunction } from 'express';

type FieldRule = { required?: boolean; type?: string; minLength?: number };
type Schema = Record<string, FieldRule>;

export function validate(schema: Schema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: string[] = [];
    for (const [key, rules] of Object.entries(schema)) {
      const val = req.body[key];
      if (rules.required && (val === undefined || val === null || val === '')) {
        errors.push(`${key} is required`);
        continue;
      }
      if (val !== undefined && rules.type && typeof val !== rules.type) {
        errors.push(`${key} must be a ${rules.type}`);
      }
      if (typeof val === 'string' && rules.minLength && val.length < rules.minLength) {
        errors.push(`${key} must be at least ${rules.minLength} characters`);
      }
    }
    if (errors.length > 0) { res.status(400).json({ error: errors.join('; ') }); return; }
    next();
  };
}
