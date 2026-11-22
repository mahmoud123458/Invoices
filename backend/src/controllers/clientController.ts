import { Request, Response } from 'express';
import { supabase } from '../config/supabase';

const throwIfError = (error: { message?: string } | null): void => {
  if (error) throw error;
};

const toApiRecord = (record: any): Record<string, unknown> => {
  const mapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (key === 'id' || key === 'external_id') continue;
    mapped[key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase())] = value;
  }
  return { _id: record.external_id, ...mapped };
};

const toDatabaseRecord = (body: Record<string, unknown>): Record<string, unknown> => {
  const fields: Record<string, string> = {
    name: 'name',
    email: 'email',
    phone: 'phone',
    address: 'address',
    company: 'company',
    notes: 'notes',
  };
  const record: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(fields)) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      const value = body[key];
      record[column] = typeof value === 'string' && key !== 'notes'
        ? (key === 'email' ? value.trim().toLowerCase() : value.trim())
        : value;
    }
  }
  return record;
};

const escapeSearchTerm = (term: string): string => term.replace(/[\\,().]/g, '\\$&');

// @desc   Get all clients
// @route  GET /api/clients
export const getClients = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!supabase) throw new Error('Supabase is not configured');
    let query = supabase.from('clients').select('*').order('created_at', { ascending: false });
    const search = typeof req.query.search === 'string' ? req.query.search : '';
    if (search) {
      const term = escapeSearchTerm(search);
      query = query.or(`name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
    }
    const result = await query;
    throwIfError(result.error);
    const clients = (result.data || []).map(toApiRecord);
    res.json({ success: true, count: clients.length, data: clients });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc   Get single client
// @route  GET /api/clients/:id
export const getClient = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!supabase) throw new Error('Supabase is not configured');
    const result = await supabase.from('clients').select('*').eq('external_id', req.params.id).maybeSingle();
    throwIfError(result.error);
    if (!result.data) {
      res.status(404).json({ success: false, message: 'Client not found' });
      return;
    }
    res.json({ success: true, data: toApiRecord(result.data) });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc   Create client
// @route  POST /api/clients
export const createClient = async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body || {};
    const record = toDatabaseRecord(body);
    if (typeof record.name !== 'string' || !record.name) {
      res.status(400).json({ success: false, message: 'Client validation failed: name: Path `name` is required.' });
      return;
    }
    if (!supabase) throw new Error('Supabase is not configured');
    const result = await supabase.from('clients').insert(record).select('*').single();
    throwIfError(result.error);
    res.status(201).json({ success: true, data: toApiRecord(result.data) });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc   Update client
// @route  PUT /api/clients/:id
export const updateClient = async (req: Request, res: Response): Promise<void> => {
  try {
    const record = toDatabaseRecord(req.body || {});
    if (Object.prototype.hasOwnProperty.call(record, 'name') && !record.name) {
      res.status(400).json({ success: false, message: 'Validation failed: name: Path `name` is required.' });
      return;
    }
    if (!supabase) throw new Error('Supabase is not configured');
    const result = await supabase
      .from('clients')
      .update(record)
      .eq('external_id', req.params.id)
      .select('*')
      .maybeSingle();
    throwIfError(result.error);
    if (!result.data) {
      res.status(404).json({ success: false, message: 'Client not found' });
      return;
    }
    res.json({ success: true, data: toApiRecord(result.data) });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc   Delete client
// @route  DELETE /api/clients/:id
export const deleteClient = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!supabase) throw new Error('Supabase is not configured');
    const result = await supabase
      .from('clients')
      .delete()
      .eq('external_id', req.params.id)
      .select('external_id')
      .maybeSingle();
    throwIfError(result.error);
    if (!result.data) {
      res.status(404).json({ success: false, message: 'Client not found' });
      return;
    }
    res.json({ success: true, message: 'Client deleted successfully' });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
