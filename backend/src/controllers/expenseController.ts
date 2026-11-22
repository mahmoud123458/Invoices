import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { AuthRequest } from '../middleware/auth';

type ExpenseRecord = Record<string, any>;

const paymentMethods = ['cash', 'bank_transfer', 'card', 'cheque', 'other'];
const expenseSelect = '*,createdBy:users!expenses_created_by_fkey(external_id,name)';

function validDate(value: unknown): Date | null {
  if (typeof value !== 'string' && !(value instanceof Date)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function validateExpense(body: any): string | null {
  if (typeof body.description !== 'string' || !body.description.trim() || body.description.trim().length > 160) {
    return 'Description is required and must be 160 characters or fewer';
  }
  if (typeof body.category !== 'string' || !body.category.trim() || body.category.trim().length > 80) {
    return 'Category is required and must be 80 characters or fewer';
  }
  if (!Number.isFinite(Number(body.amount)) || Number(body.amount) <= 0) {
    return 'Amount must be greater than zero';
  }
  if (!validDate(body.date)) return 'A valid expense date is required';
  if (!paymentMethods.includes(body.paymentMethod)) return 'Select a valid payment method';
  return null;
}

function toApiRecord(record: ExpenseRecord): ExpenseRecord {
  const mapped: ExpenseRecord = {};
  for (const [key, value] of Object.entries(record)) {
    if (key === 'external_id') {
      mapped._id = value;
      continue;
    }
    if (key === 'id') {
      if (mapped._id === undefined) mapped._id = String(value);
      continue;
    }
    if (key === 'expense_date') {
      mapped.date = value;
      continue;
    }
    if (key === 'created_by') {
      mapped.createdBy = record.createdBy ? toApiRecord(record.createdBy) : value;
      continue;
    }
    const apiKey = key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
    mapped[apiKey] = value && typeof value === 'object' && !Array.isArray(value)
      ? toApiRecord(value as ExpenseRecord)
      : value;
  }
  return mapped;
}

function requireSupabase() {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
}

function throwIfError(error: { message?: string } | null): void {
  if (error) throw error;
}

export const getExpenses = async (req: Request, res: Response): Promise<void> => {
  const from = req.query.from ? validDate(req.query.from) : null;
  if (req.query.from && !from) {
    res.status(400).json({ success: false, message: 'Invalid start date' });
    return;
  }
  const to = req.query.to ? validDate(req.query.to) : null;
  if (req.query.to && !to) {
    res.status(400).json({ success: false, message: 'Invalid end date' });
    return;
  }
  to?.setHours(23, 59, 59, 999);

  try {
    let query = requireSupabase()
      .from('expenses')
      .select(expenseSelect)
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (typeof req.query.category === 'string') query = query.eq('category', req.query.category);
    if (from) {
      query = query.gte('expense_date', from.toISOString());
    }
    if (to) {
      query = query.lte('expense_date', to.toISOString());
    }

    const result = await query;
    throwIfError(result.error);
    const expenses = (result.data || []).map(toApiRecord);
    res.json({ success: true, count: expenses.length, data: expenses });
  } catch (error) {
    console.error('Unable to load expenses:', error);
    res.status(500).json({ success: false, message: 'Unable to load expenses' });
  }
};

export const createExpense = async (req: AuthRequest, res: Response): Promise<void> => {
  const validationError = validateExpense(req.body);
  if (validationError) {
    res.status(400).json({ success: false, message: validationError });
    return;
  }

  try {
    const result = await requireSupabase()
      .from('expenses')
      .insert({
        description: req.body.description.trim(),
        category: req.body.category.trim(),
        amount: Number(req.body.amount),
        expense_date: validDate(req.body.date)?.toISOString(),
        payment_method: req.body.paymentMethod,
        reference: typeof req.body.reference === 'string' ? req.body.reference.trim() || null : null,
        notes: typeof req.body.notes === 'string' ? req.body.notes.trim() || null : null,
        created_by: req.user?._id || null,
      })
      .select(expenseSelect)
      .single();
    throwIfError(result.error);
    res.status(201).json({ success: true, data: toApiRecord(result.data) });
  } catch (error) {
    console.error('Unable to create expense:', error);
    res.status(400).json({ success: false, message: 'Unable to create expense' });
  }
};

export const updateExpense = async (req: AuthRequest, res: Response): Promise<void> => {
  const validationError = validateExpense(req.body);
  if (validationError) {
    res.status(400).json({ success: false, message: validationError });
    return;
  }

  try {
    const result = await requireSupabase()
      .from('expenses')
      .update({
        description: req.body.description.trim(),
        category: req.body.category.trim(),
        amount: Number(req.body.amount),
        expense_date: validDate(req.body.date)?.toISOString(),
        payment_method: req.body.paymentMethod,
        reference: typeof req.body.reference === 'string' ? req.body.reference.trim() || null : null,
        notes: typeof req.body.notes === 'string' ? req.body.notes.trim() || null : null,
      })
      .eq('external_id', req.params.id)
      .select(expenseSelect)
      .maybeSingle();
    throwIfError(result.error);
    if (!result.data) {
      res.status(404).json({ success: false, message: 'Expense not found' });
      return;
    }
    res.json({ success: true, data: toApiRecord(result.data) });
  } catch (error) {
    console.error('Unable to update expense:', error);
    res.status(400).json({ success: false, message: 'Unable to update expense' });
  }
};

export const deleteExpense = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await requireSupabase()
      .from('expenses')
      .delete()
      .eq('external_id', req.params.id)
      .select('external_id')
      .maybeSingle();
    throwIfError(result.error);
    if (!result.data) {
      res.status(404).json({ success: false, message: 'Expense not found' });
      return;
    }
    res.json({ success: true, message: 'Expense deleted successfully' });
  } catch (error) {
    console.error('Unable to delete expense:', error);
    res.status(500).json({ success: false, message: 'Unable to delete expense' });
  }
};
