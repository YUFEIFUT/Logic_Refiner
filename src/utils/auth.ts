import type { Request } from 'express';

export interface AuthContext {
  isAdmin: boolean;
  sessionId: string | null;
}

export function getAuthContext(req: Request): AuthContext {
  const adminToken = process.env.ADMIN_TOKEN;
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const isAdmin = !!adminToken && token === adminToken;
  const sessionId = (req.headers['x-session-id'] as string) || null;
  return { isAdmin, sessionId };
}
