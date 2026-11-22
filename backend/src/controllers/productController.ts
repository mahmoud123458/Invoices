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

const toDatabaseRecord = (body: Record<string, any>): Record<string, unknown> => {
  const fields: Record<string, string> = {
    name: 'name',
    sku: 'sku',
    description: 'description',
    quantity: 'quantity',
    price: 'price',
    lowStockAlert: 'low_stock_alert',
    category: 'category',
  };
  const record: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(fields)) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      let value = body[key];
      if (typeof value === 'string' && (key === 'name' || key === 'sku' || key === 'category')) {
        value = key === 'sku' ? value.trim().toUpperCase() : value.trim();
      }
      record[column] = value;
    }
  }
  return record;
};

const validateProduct = (record: Record<string, unknown>, creating: boolean): string | null => {
  for (const field of ['name', 'sku']) {
    if (creating && (typeof record[field] !== 'string' || !record[field])) {
      return `Product validation failed: ${field}: Path \`${field}\` is required.`;
    }
    if (!creating && Object.prototype.hasOwnProperty.call(record, field) && !record[field]) {
      return `Validation failed: ${field}: Path \`${field}\` is required.`;
    }
  }
  if (creating && !Object.prototype.hasOwnProperty.call(record, 'price')) {
    return 'Product validation failed: price: Path `price` is required.';
  }
  return null;
};

const escapeSearchTerm = (term: string): string => term.replace(/[\\,().]/g, '\\$&');

// @desc   Get all products
// @route  GET /api/products
export const getProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!supabase) throw new Error('Supabase is not configured');
    let query = supabase.from('products').select('*').order('created_at', { ascending: false });
    const search = typeof req.query.search === 'string' ? req.query.search : '';
    if (search) {
      const term = escapeSearchTerm(search);
      query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%`);
    }
    const result = await query;
    throwIfError(result.error);

    const products = (result.data || []).map((product: any) => {
      const mapped = toApiRecord(product);
      return {
        ...mapped,
        isLowStock: product.quantity <= product.low_stock_alert,
      };
    });

    if (req.query.lowStock === 'true') {
      const lowStockProducts = products.filter((product) => product.isLowStock);
      res.json({ success: true, count: lowStockProducts.length, data: lowStockProducts });
      return;
    }

    res.json({ success: true, count: products.length, data: products });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc   Get single product
// @route  GET /api/products/:id
export const getProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!supabase) throw new Error('Supabase is not configured');
    const result = await supabase.from('products').select('*').eq('external_id', req.params.id).maybeSingle();
    throwIfError(result.error);
    if (!result.data) {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }
    res.json({ success: true, data: toApiRecord(result.data) });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc   Create product
// @route  POST /api/products
export const createProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const record = toDatabaseRecord(req.body || {});
    if (!Object.prototype.hasOwnProperty.call(record, 'quantity')) record.quantity = 0;
    if (!Object.prototype.hasOwnProperty.call(record, 'low_stock_alert')) record.low_stock_alert = 10;
    const validationError = validateProduct(record, true);
    if (validationError) {
      res.status(400).json({ success: false, message: validationError });
      return;
    }
    if (!supabase) throw new Error('Supabase is not configured');
    const result = await supabase.from('products').insert(record).select('*').single();
    throwIfError(result.error);
    res.status(201).json({ success: true, data: toApiRecord(result.data) });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc   Update product
// @route  PUT /api/products/:id
export const updateProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const record = toDatabaseRecord(req.body || {});
    const validationError = validateProduct(record, false);
    if (validationError) {
      res.status(400).json({ success: false, message: validationError });
      return;
    }
    if (!supabase) throw new Error('Supabase is not configured');
    const result = await supabase
      .from('products')
      .update(record)
      .eq('external_id', req.params.id)
      .select('*')
      .maybeSingle();
    throwIfError(result.error);
    if (!result.data) {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }
    res.json({ success: true, data: toApiRecord(result.data) });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc   Delete product
// @route  DELETE /api/products/:id
export const deleteProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!supabase) throw new Error('Supabase is not configured');
    const result = await supabase
      .from('products')
      .delete()
      .eq('external_id', req.params.id)
      .select('external_id')
      .maybeSingle();
    throwIfError(result.error);
    if (!result.data) {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }
    res.json({ success: true, message: 'Product deleted successfully' });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
