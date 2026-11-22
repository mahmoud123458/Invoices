import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { supabase } from '../config/supabase';
import { AuthRequest } from '../middleware/auth';

const generateToken = (id: string): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be configured in production');
  }
  return jwt.sign({ id }, secret || 'secret', {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  } as jwt.SignOptions);
};

const throwIfError = (error: { message?: string } | null): void => {
  if (error) throw error;
};

const toApiUser = (user: any): Record<string, unknown> => ({
  _id: user.external_id,
  name: user.name,
  email: user.email,
  role: user.role,
  ...(user.created_at ? { createdAt: user.created_at } : {}),
  ...(user.updated_at ? { updatedAt: user.updated_at } : {}),
});

const findUserByEmail = async (email: string): Promise<any | null> => {
  if (!supabase) throw new Error('Supabase is not configured');
  const result = await supabase
    .from('users')
    .select('external_id,name,email,password_hash,role,created_at,updated_at')
    .eq('email', email)
    .maybeSingle();
  throwIfError(result.error);
  return result.data;
};

const countAdministrators = async (): Promise<number> => {
  if (!supabase) throw new Error('Supabase is not configured');
  const result = await supabase
    .from('users')
    .select('external_id', { count: 'exact', head: true })
    .eq('role', 'admin');
  throwIfError(result.error);
  return result.count || 0;
};

// @desc   Login user
// @route  POST /api/auth/login
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!email || !password) {
      res.status(400).json({ success: false, message: 'Email and password are required' });
      return;
    }

    const user = await findUserByEmail(email);
    if (!user || !['admin', 'user'].includes(user.role) || !(await bcrypt.compare(password, user.password_hash))) {
      res.status(401).json({ success: false, message: 'Invalid email or password' });
      return;
    }

    const token = generateToken(user.external_id);

    res.json({
      success: true,
      data: {
        _id: user.external_id,
        name: user.name,
        email: user.email,
        role: user.role,
        token,
      },
    });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const getUsers = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!supabase) throw new Error('Supabase is not configured');
    const result = await supabase
      .from('users')
      .select('external_id,name,email,role,created_at,updated_at')
      .order('created_at', { ascending: false });
    throwIfError(result.error);
    const users = (result.data || []).map(toApiUser);
    res.json({ success: true, count: users.length, data: users });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const createUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, password, role } = req.body;
    const normalizedName = typeof name === 'string' ? name.trim() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';

    if (!normalizedName || !email || typeof password !== 'string' || password.length < 8) {
      res.status(400).json({ success: false, message: 'Name, a valid email, and a password of at least 8 characters are required' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ success: false, message: 'Please provide a valid email address' });
      return;
    }
    if (!['admin', 'user'].includes(role)) {
      res.status(400).json({ success: false, message: 'Role must be admin or user' });
      return;
    }
    if (await findUserByEmail(email)) {
      res.status(409).json({ success: false, message: 'Email already has an account' });
      return;
    }
    if (!supabase) throw new Error('Supabase is not configured');

    const passwordHash = await bcrypt.hash(password, await bcrypt.genSalt(10));
    const result = await supabase
      .from('users')
      .insert({ name: normalizedName, email, password_hash: passwordHash, role })
      .select('external_id,name,email,role,created_at,updated_at')
      .single();
    throwIfError(result.error);
    res.status(201).json({ success: true, data: toApiUser(result.data) });
  } catch (error: any) {
    if (error?.code === '23505') {
      res.status(409).json({ success: false, message: 'Email already has an account' });
      return;
    }
    res.status(400).json({ success: false, message: error.message || 'Unable to create account' });
  }
};

export const updateUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!supabase) throw new Error('Supabase is not configured');
    const currentResult = await supabase
      .from('users')
      .select('external_id,name,email,role')
      .eq('external_id', req.params.id)
      .maybeSingle();
    throwIfError(currentResult.error);
    const user = currentResult.data;
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    const name = typeof req.body.name === 'string' ? req.body.name.trim() : user.name;
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : user.email;
    const role = req.body.role ?? user.role;
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ success: false, message: 'A name and valid email are required' });
      return;
    }
    if (!['admin', 'user'].includes(role)) {
      res.status(400).json({ success: false, message: 'Role must be admin or user' });
      return;
    }
    const emailOwnerResult = await supabase
      .from('users')
      .select('external_id')
      .eq('email', email)
      .maybeSingle();
    throwIfError(emailOwnerResult.error);
    if (emailOwnerResult.data && emailOwnerResult.data.external_id !== user.external_id) {
      res.status(409).json({ success: false, message: 'Email already has an account' });
      return;
    }

    if (user.role === 'admin' && role !== 'admin' && await countAdministrators() <= 1) {
      res.status(400).json({ success: false, message: 'The last administrator cannot be demoted' });
      return;
    }

    const updates: Record<string, unknown> = { name, email, role };
    if (req.body.password !== undefined && req.body.password !== '') {
      if (typeof req.body.password !== 'string' || req.body.password.length < 8) {
        res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
        return;
      }
      updates.password_hash = await bcrypt.hash(req.body.password, await bcrypt.genSalt(10));
    }

    const result = await supabase
      .from('users')
      .update(updates)
      .eq('external_id', req.params.id)
      .select('external_id,name,email,role,created_at,updated_at')
      .maybeSingle();
    throwIfError(result.error);
    if (!result.data) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }
    res.json({ success: true, data: toApiUser(result.data) });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message || 'Unable to update user' });
  }
};

export const deleteUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!supabase) throw new Error('Supabase is not configured');
    const userResult = await supabase
      .from('users')
      .select('external_id,role')
      .eq('external_id', req.params.id)
      .maybeSingle();
    throwIfError(userResult.error);
    const user = userResult.data;
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }
    if (String(user.external_id) === String(req.user?._id)) {
      res.status(400).json({ success: false, message: 'You cannot delete your own account' });
      return;
    }
    if (user.role === 'admin' && await countAdministrators() <= 1) {
      res.status(400).json({ success: false, message: 'The last administrator cannot be deleted' });
      return;
    }

    const result = await supabase
      .from('users')
      .delete()
      .eq('external_id', req.params.id)
      .select('external_id')
      .maybeSingle();
    throwIfError(result.error);
    res.json({ success: true, message: 'User deleted successfully' });
  } catch {
    res.status(500).json({ success: false, message: 'Unable to delete user' });
  }
};

// @desc   Get current user profile
// @route  GET /api/auth/me
export const getMe = async (req: AuthRequest, res: Response): Promise<void> => {
  res.json({ success: true, data: req.user });
};
