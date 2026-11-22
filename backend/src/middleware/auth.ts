import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { supabase } from '../config/supabase';

export type UserRole = 'admin' | 'user';

export interface AuthUser {
  _id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export const authorize = (...roles: UserRole[]) => (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user || !roles.includes(req.user.role)) {
    res.status(403).json({ success: false, message: 'You do not have permission to perform this action' });
    return;
  }
  next();
};

export const protect = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: 'Not authorized, no token' });
    return;
  }

  const secret = process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') {
    res.status(500).json({ success: false, message: 'Authentication is not configured' });
    return;
  }

  let decoded: string | JwtPayload;
  try {
    decoded = jwt.verify(authHeader.split(' ')[1], secret || 'secret');
  } catch {
    res.status(401).json({ success: false, message: 'Token invalid or expired' });
    return;
  }

  if (typeof decoded === 'string' || typeof decoded.id !== 'string' || !decoded.id) {
    res.status(401).json({ success: false, message: 'Token invalid or expired' });
    return;
  }
  if (!supabase) {
    res.status(500).json({ success: false, message: 'Unable to verify user' });
    return;
  }

  let result;
  try {
    result = await supabase
      .from('users')
      .select('external_id,name,email,role,created_at,updated_at')
      .eq('external_id', decoded.id)
      .maybeSingle();
  } catch {
    res.status(500).json({ success: false, message: 'Unable to verify user' });
    return;
  }

  if (result.error) {
    res.status(500).json({ success: false, message: 'Unable to verify user' });
    return;
  }
  const user = result.data;
  if (!user) {
    res.status(401).json({ success: false, message: 'User not found' });
    return;
  }
  if (!['admin', 'user'].includes(user.role)) {
    res.status(401).json({ success: false, message: 'This account type is no longer available' });
    return;
  }

  req.user = {
    _id: user.external_id,
    name: user.name,
    email: user.email,
    role: user.role,
    ...(user.created_at ? { createdAt: user.created_at } : {}),
    ...(user.updated_at ? { updatedAt: user.updated_at } : {}),
  };
  next();
};

export const adminOnly = (req: AuthRequest, res: Response, next: NextFunction): void => {
  authorize('admin')(req, res, next);
};
