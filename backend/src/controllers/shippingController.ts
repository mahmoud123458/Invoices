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
    phone: 'phone',
    email: 'email',
    address: 'address',
    avgDeliveryDays: 'avg_delivery_days',
    pricePerKg: 'price_per_kg',
    notes: 'notes',
    isActive: 'is_active',
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

const validateCompany = (record: Record<string, unknown>, creating: boolean): string | null => {
  for (const field of ['name', 'phone']) {
    if (creating && (typeof record[field] !== 'string' || !record[field])) {
      return `ShippingCompany validation failed: ${field}: Path \`${field}\` is required.`;
    }
    if (!creating && Object.prototype.hasOwnProperty.call(record, field) && !record[field]) {
      return `Validation failed: ${field}: Path \`${field}\` is required.`;
    }
  }
  return null;
};

// @desc   Get all shipping companies
// @route  GET /api/shipping
export const getShippingCompanies = async (_req: Request, res: Response): Promise<void> => {
  try {
    if (!supabase) throw new Error('Supabase is not configured');
    const result = await supabase
      .from('shipping_companies')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });
    throwIfError(result.error);
    const companies = (result.data || []).map(toApiRecord);
    res.json({ success: true, count: companies.length, data: companies });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc   Get shipping company stats
// @route  GET /api/shipping/:id/stats
export const getShippingStats = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!supabase) throw new Error('Supabase is not configured');
    const companyResult = await supabase
      .from('shipping_companies')
      .select('*')
      .eq('external_id', req.params.id)
      .maybeSingle();
    throwIfError(companyResult.error);
    if (!companyResult.data) {
      res.status(404).json({ success: false, message: 'Shipping company not found' });
      return;
    }
    const company = toApiRecord(companyResult.data);

    const totalResult = await supabase
      .from('invoices')
      .select('external_id', { count: 'exact', head: true })
      .eq('shipping_company_id', req.params.id);
    throwIfError(totalResult.error);
    const deliveredResult = await supabase
      .from('invoices')
      .select('external_id', { count: 'exact', head: true })
      .eq('shipping_company_id', req.params.id)
      .eq('shipping_status', 'delivered');
    throwIfError(deliveredResult.error);
    const totalInvoices = totalResult.count || 0;
    const deliveredInvoices = deliveredResult.count || 0;

    const deliveryRate = totalInvoices > 0 ? (deliveredInvoices / totalInvoices) * 100 : 0;

    res.json({
      success: true,
      data: {
        company,
        stats: {
          totalInvoices,
          deliveredInvoices,
          deliveryRate: Math.round(deliveryRate * 100) / 100,
          avgDeliveryDays: company.avgDeliveryDays,
        },
      },
    });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc   Create shipping company
// @route  POST /api/shipping
export const createShippingCompany = async (req: Request, res: Response): Promise<void> => {
  try {
    const record = toDatabaseRecord(req.body || {});
    if (!Object.prototype.hasOwnProperty.call(record, 'avg_delivery_days')) record.avg_delivery_days = 3;
    if (!Object.prototype.hasOwnProperty.call(record, 'is_active')) record.is_active = true;
    const validationError = validateCompany(record, true);
    if (validationError) {
      res.status(400).json({ success: false, message: validationError });
      return;
    }
    if (!supabase) throw new Error('Supabase is not configured');
    const result = await supabase.from('shipping_companies').insert(record).select('*').single();
    throwIfError(result.error);
    res.status(201).json({ success: true, data: toApiRecord(result.data) });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc   Update shipping company
// @route  PUT /api/shipping/:id
export const updateShippingCompany = async (req: Request, res: Response): Promise<void> => {
  try {
    const record = toDatabaseRecord(req.body || {});
    const validationError = validateCompany(record, false);
    if (validationError) {
      res.status(400).json({ success: false, message: validationError });
      return;
    }
    if (!supabase) throw new Error('Supabase is not configured');
    const result = await supabase
      .from('shipping_companies')
      .update(record)
      .eq('external_id', req.params.id)
      .select('*')
      .maybeSingle();
    throwIfError(result.error);
    if (!result.data) {
      res.status(404).json({ success: false, message: 'Shipping company not found' });
      return;
    }
    res.json({ success: true, data: toApiRecord(result.data) });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc   Delete shipping company
// @route  DELETE /api/shipping/:id
export const deleteShippingCompany = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!supabase) throw new Error('Supabase is not configured');
    const result = await supabase
      .from('shipping_companies')
      .update({ is_active: false })
      .eq('external_id', req.params.id)
      .select('*')
      .maybeSingle();
    throwIfError(result.error);
    if (!result.data) {
      res.status(404).json({ success: false, message: 'Shipping company not found' });
      return;
    }
    res.json({ success: true, message: 'Shipping company deactivated' });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
