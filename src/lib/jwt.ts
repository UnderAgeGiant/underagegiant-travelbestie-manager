import jwt from 'jsonwebtoken';
import { AuthPayload } from '../types';

const SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): AuthPayload {
  return jwt.verify(token, SECRET) as AuthPayload;
}
