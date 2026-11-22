import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { AuthRequest } from '../middleware/auth';

type ControllerError = Error & { status?: number; code?: string };

const invoiceBaseSelect = [
  '*',
  'client:clients!invoices_client_id_fkey(*)',
  'shippingCompany:shipping_companies!invoices_shipping_company_id_fkey(*)',
].join(',');

const invoiceListSelect = [
  '*',
  'client:clients!invoices_client_id_fkey(external_id,name,email,phone)',
  'shippingCompany:shipping_companies!invoices_shipping_company_id_fkey(external_id,name,avg_delivery_days)',
  'items:invoice_items(*)',
  'payments:invoice_payments(*)',
  'createdBy:users!invoices_created_by_fkey(external_id,name)',
].join(',');

const invoiceDetailSelect = [
  invoiceBaseSelect,
  'items:invoice_items(*,product:products!invoice_items_product_id_fkey(*))',
  'payments:invoice_payments(*)',
  'createdBy:users!invoices_created_by_fkey(external_id,name,email)',
].join(',');

const throwIfError = (error: { message?: string } | null): void => {
  if (error) throw error;
};

const requireSupabase = () => {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
};

const apiError = (message: string, status: number): ControllerError => {
  const error = new Error(message) as ControllerError;
  error.status = status;
  return error;
};

const referenceId = (value: any): string | null => {
  if (value && typeof value === 'object') {
    const id = value._id ?? value.external_id;
    return id == null ? null : String(id);
  }
  return value == null || value === '' ? null : String(value);
};

const toApiRecord = (record: any): any => {
  if (Array.isArray(record)) return record.map(toApiRecord);
  if (!record || typeof record !== 'object') return record;

  const mapped: Record<string, any> = {};
  for (const [key, value] of Object.entries(record)) {
    if (key === 'external_id') {
      mapped._id = value;
      continue;
    }
    if (key === 'id') {
      if (mapped._id === undefined) mapped._id = String(value);
      continue;
    }
    if (key === 'invoice_id') continue;
    if (key === 'client_id') {
      if (!record.client) mapped.client = value;
      continue;
    }
    if (key === 'shipping_company_id') {
      if (!record.shippingCompany) mapped.shippingCompany = value;
      continue;
    }
    if (key === 'created_by') {
      if (!record.createdBy) mapped.createdBy = value;
      continue;
    }
    if (key === 'product_id') {
      mapped.product = record.product ? toApiRecord(record.product) : value;
      continue;
    }
    if (key === 'recorded_by') {
      mapped.recordedBy = record.recordedBy ? toApiRecord(record.recordedBy) : value;
      continue;
    }
    if (key === 'payment_date') {
      mapped.date = value;
      continue;
    }

    const apiKey = key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
    mapped[apiKey] = toApiRecord(value);
  }
  return mapped;
};

const unwrapRpcRow = (data: any): any => {
  const row = Array.isArray(data) ? data[0] : data;
  if (typeof row === 'string') {
    try {
      return JSON.parse(row);
    } catch {
      return row;
    }
  }
  return row;
};

const getInvoiceRecord = async (id: string, select = invoiceDetailSelect): Promise<any | null> => {
  const result = await requireSupabase()
    .from('invoices')
    .select(select)
    .eq('external_id', id)
    .maybeSingle();
  throwIfError(result.error);
  return result.data;
};

const invoiceRpcError = (error: ControllerError, fallbackMessage: string): ControllerError => {
  if (error.code === 'P0002' && /invoice not found/i.test(error.message)) {
    return apiError('Invoice not found', 404);
  }
  if (error.code === 'P0001' && /invoice overpayment/i.test(error.message)) {
    return apiError('Invoice total cannot be lower than the amount already paid', 400);
  }
  if (error.code === 'P0001' && /insufficient stock/i.test(error.message)) {
    return apiError(fallbackMessage, 409);
  }
  return error;
};

const allowedInvoiceStatuses = ['draft', 'sent', 'paid', 'cancelled'];
const allowedShippingStatuses = ['pending', 'shipped', 'delivered', 'returned'];

// @desc   Get all invoices
// @route  GET /api/invoices
export const getInvoices = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let query = requireSupabase().from('invoices').select(invoiceListSelect);
    if (req.query.status) query = query.eq('status', req.query.status);
    if (req.query.client) query = query.eq('client_id', req.query.client);
    const result = await query.order('created_at', { ascending: false });
    throwIfError(result.error);
    const invoices = (result.data || []).map(toApiRecord);
    res.json({ success: true, count: invoices.length, data: invoices });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc   Get single invoice
// @route  GET /api/invoices/:id
export const getInvoice = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const invoice = await getInvoiceRecord(req.params.id);
    if (!invoice) {
      res.status(404).json({ success: false, message: 'Invoice not found' });
      return;
    }
    res.json({ success: true, data: toApiRecord(invoice) });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc   Create invoice
// @route  POST /api/invoices
export const createInvoice = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { items, tax = 0, discount = 0, ...rest } = req.body;
    if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
      res.status(400).json({ success: false, message: 'An invoice must contain between 1 and 50 items' });
      return;
    }
    if (!['draft', 'sent'].includes(rest.status || 'draft')) {
      res.status(400).json({ success: false, message: 'Record a payment after creating the invoice' });
      return;
    }
    if (!Number.isFinite(Number(tax)) || Number(tax) < 0 || !Number.isFinite(Number(discount)) || Number(discount) < 0) {
      res.status(400).json({ success: false, message: 'Tax and discount must be non-negative numbers' });
      return;
    }

    const processedItems = items.map((item: any) => {
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.unitPrice);
      if (!Number.isInteger(quantity) || quantity < 1 || !Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new Error('Invoice items require a positive quantity and non-negative price');
      }
      return {
        productId: referenceId(item.product),
        productName: item.productName,
        quantity,
        unitPrice,
        total: quantity * unitPrice,
      };
    });

    const subtotal = processedItems.reduce((sum: number, item: any) => sum + item.total, 0);
    const numericTax = Number(tax);
    const numericDiscount = Number(discount);
    const total = Math.round((subtotal + (subtotal * numericTax) / 100 - numericDiscount) * 100) / 100;
    if (total < 0) {
      res.status(400).json({ success: false, message: 'Discount cannot exceed the invoice total' });
      return;
    }

    const invoicePayload: Record<string, unknown> = {
      client_id: referenceId(rest.client),
      subtotal,
      tax: numericTax,
      discount: numericDiscount,
      total,
      paid_amount: 0,
      status: rest.status || 'draft',
      created_by: req.user?._id,
    };
    const optionalFields: Record<string, string> = {
      shippingCompany: 'shipping_company_id',
      shippingStatus: 'shipping_status',
      deliveredAt: 'delivered_at',
      dueDate: 'due_date',
      notes: 'notes',
    };
    for (const [apiField, databaseField] of Object.entries(optionalFields)) {
      if (Object.prototype.hasOwnProperty.call(rest, apiField)) {
        const value = apiField === 'shippingCompany' ? referenceId(rest[apiField]) : rest[apiField];
        invoicePayload[databaseField] = value;
      }
    }
    const databaseItems = processedItems.map((item: any) => ({
      product_id: item.productId,
      product_name: item.productName,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      total: item.total,
    }));

    const result = await requireSupabase().rpc('create_invoice_with_stock', {
      p_invoice: invoicePayload,
      p_items: databaseItems,
    });
    if (result.error) {
      const error = result.error as ControllerError;
      if (error.code === 'P0001' && /insufficient stock/i.test(error.message)) {
        const productId = error.message.match(/insufficient stock:\s*(\S+)/i)?.[1];
        const productResult = productId
          ? await requireSupabase().from('products').select('name,quantity').eq('external_id', productId).maybeSingle()
          : { data: null, error: null };
        throwIfError(productResult.error);
        const item = processedItems.find((processed: any) => processed.productId === productId);
        const productName = productResult.data?.name || item?.productName || 'Product';
        const message = productResult.data?.quantity == null
          ? `Insufficient stock for ${productName}`
          : `Insufficient stock for ${productName}. Available: ${productResult.data.quantity}`;
        throw apiError(message, 400);
      }
      if (error.code === 'P0002' && /product not found/i.test(error.message)) {
        const productId = error.message.match(/product not found:\s*(\S+)/i)?.[1];
        const item = processedItems.find((processed: any) => processed.productId === productId);
        throw apiError(`Product ${item?.productName || productId || ''} not found`, 404);
      }
      if (error.code === 'P0002' && /client not found/i.test(error.message)) {
        throw apiError('Client not found', 400);
      }
      throw error;
    }

    const created = unwrapRpcRow(result.data);
    if (!created?.external_id) throw new Error('Invoice could not be created');
    const invoice = await getInvoiceRecord(created.external_id, [
      '*',
      'client:clients!invoices_client_id_fkey(name,email,phone)',
      'shippingCompany:shipping_companies!invoices_shipping_company_id_fkey(name)',
      'items:invoice_items(*)',
      'payments:invoice_payments(*)',
    ].join(','));
    if (!invoice) throw new Error('Invoice could not be created');
    res.status(201).json({ success: true, data: toApiRecord(invoice) });
  } catch (error: any) {
    res.status(error.status || 400).json({ success: false, message: error.message });
  }
};

// @desc   Update invoice
// @route  PUT /api/invoices/:id
export const updateInvoice = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const client = requireSupabase();
    const existingResult = await client
      .from('invoices')
      .select('*, items:invoice_items(*)')
      .eq('external_id', req.params.id)
      .maybeSingle();
    throwIfError(existingResult.error);
    const existing = existingResult.data;
    if (!existing) {
      res.status(404).json({ success: false, message: 'Invoice not found' });
      return;
    }

    const submittedItems = req.body.items === undefined ? existing.items : req.body.items;
    if (!Array.isArray(submittedItems) || submittedItems.length === 0 || submittedItems.length > 50) {
      res.status(400).json({ success: false, message: 'An invoice must contain between 1 and 50 items' });
      return;
    }

    const normalizedItems = submittedItems.map((item: any) => {
      const productId = referenceId(item.product ?? item.product_id);
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.unitPrice ?? item.unit_price);
      if (!productId || !Number.isInteger(quantity) || quantity < 1 || !Number.isFinite(unitPrice) || unitPrice < 0) {
        throw apiError('Invoice items require a valid product, positive quantity, and non-negative price', 400);
      }
      return { productId, quantity, unitPrice };
    });
    const productIds = [...new Set(normalizedItems.map((item: any) => item.productId))];
    const productsResult = await client
      .from('products')
      .select('external_id,name')
      .in('external_id', productIds);
    throwIfError(productsResult.error);
    const products = new Map<string, any>((productsResult.data || []).map((product: any) => [product.external_id, product]));
    const items = normalizedItems.map((item: any) => {
      const product = products.get(item.productId);
      if (!product) throw apiError('One of the selected products no longer exists', 400);
      return {
        productId: item.productId,
        productName: product.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.quantity * item.unitPrice,
      };
    });

    const subtotal = items.reduce((sum: number, item: any) => sum + item.total, 0);
    const tax = Number(req.body.tax ?? existing.tax);
    const discount = Number(req.body.discount ?? existing.discount);
    if (!Number.isFinite(tax) || tax < 0 || !Number.isFinite(discount) || discount < 0) {
      res.status(400).json({ success: false, message: 'Tax and discount must be non-negative numbers' });
      return;
    }

    const allowedStatuses = allowedInvoiceStatuses;
    let status = req.body.status ?? existing.status;
    if (!allowedStatuses.includes(status)) {
      res.status(400).json({ success: false, message: 'Invalid invoice status' });
      return;
    }
    const shippingStatus = req.body.shippingStatus === null
      ? null
      : req.body.shippingStatus ?? existing.shipping_status;
    if (shippingStatus && !allowedShippingStatuses.includes(shippingStatus)) {
      res.status(400).json({ success: false, message: 'Invalid shipping status' });
      return;
    }

    const total = Math.round((subtotal + (subtotal * tax) / 100 - discount) * 100) / 100;
    const paidAmount = Number(existing.paid_amount)
      || (existing.status === 'paid' ? Number(existing.total) : 0);
    if (total < 0 || total < paidAmount) {
      res.status(400).json({
        success: false,
        message: total < 0
          ? 'Discount cannot exceed the invoice total'
          : 'Invoice total cannot be lower than the amount already paid',
      });
      return;
    }
    if (paidAmount > 0 && status === 'draft') {
      res.status(400).json({
        success: false,
        message: 'An invoice with recorded payments cannot be moved back to draft',
      });
      return;
    }
    if (paidAmount >= total && status !== 'cancelled') status = 'paid';
    else if (status === 'paid') status = 'sent';

    const invoicePayload: Record<string, unknown> = {
      client_id: referenceId(req.body.client) || existing.client_id,
      subtotal,
      tax,
      discount,
      total,
      paid_amount: paidAmount,
      status,
      shipping_company_id: req.body.shippingCompany === null
        ? existing.shipping_company_id
        : referenceId(req.body.shippingCompany) || existing.shipping_company_id,
      shipping_status: shippingStatus,
      delivered_at: req.body.deliveredAt === null
        ? null
        : req.body.deliveredAt ?? existing.delivered_at,
      due_date: req.body.dueDate === null ? existing.due_date : req.body.dueDate ?? existing.due_date,
      notes: req.body.notes ?? existing.notes,
    };
    const databaseItems = items.map((item: any) => ({
      product_id: item.productId,
      product_name: item.productName,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      total: item.total,
    }));

    const result = await client.rpc('update_invoice_with_stock', {
      p_invoice_id: req.params.id,
      p_invoice: invoicePayload,
      p_items: databaseItems,
    });
    if (result.error) {
      const error = invoiceRpcError(result.error as ControllerError, 'Insufficient stock for the updated invoice quantities');
      throw error;
    }
    const updated = unwrapRpcRow(result.data);
    if (!updated?.external_id) throw new Error('Invoice could not be updated');
    const invoice = await getInvoiceRecord(updated.external_id, [
      invoiceBaseSelect,
      'items:invoice_items(*)',
      'payments:invoice_payments(*)',
    ].join(','));
    if (!invoice) throw new Error('Invoice could not be updated');
    res.json({ success: true, data: toApiRecord(invoice) });
  } catch (error: any) {
    res.status(error.status || 400).json({ success: false, message: error.message });
  }
};

export const addInvoicePayment = async (req: AuthRequest, res: Response): Promise<void> => {
  const amountValue = Number(req.body.amount);
  const amount = Math.round(amountValue * 100) / 100;
  const method = req.body.method;
  const date = req.body.date ? new Date(req.body.date) : new Date();
  const allowedMethods = ['cash', 'bank_transfer', 'card', 'cheque', 'other'];

  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ success: false, message: 'Payment amount must be greater than zero' });
    return;
  }
  if (!allowedMethods.includes(method)) {
    res.status(400).json({ success: false, message: 'Select a valid payment method' });
    return;
  }
  if (Number.isNaN(date.getTime())) {
    res.status(400).json({ success: false, message: 'Enter a valid payment date' });
    return;
  }

  try {
    const client = requireSupabase();
    const currentResult = await client
      .from('invoices')
      .select('external_id,total,paid_amount,status')
      .eq('external_id', req.params.id)
      .maybeSingle();
    throwIfError(currentResult.error);
    const current = currentResult.data;
    if (!current) {
      res.status(404).json({ success: false, message: 'Invoice not found' });
      return;
    }
    if (current.status === 'draft' || current.status === 'cancelled') {
      res.status(400).json({ success: false, message: 'Payments can only be recorded for sent invoices' });
      return;
    }
    const paidAmount = Number(current.paid_amount)
      || (current.status === 'paid' ? Number(current.total) : 0);
    if (amount > Number(current.total) - paidAmount) {
      res.status(400).json({ success: false, message: 'Payment cannot exceed the remaining invoice balance' });
      return;
    }

    const paymentPayload = {
      amount,
      payment_date: date.toISOString(),
      method,
      reference: typeof req.body.reference === 'string' ? req.body.reference.trim() || null : null,
      notes: typeof req.body.notes === 'string' ? req.body.notes.trim() || null : null,
      recorded_by: req.user?._id || null,
    };
    const result = await client.rpc('record_invoice_payment', {
      p_invoice_id: req.params.id,
      p_payment: paymentPayload,
    });
    if (result.error) {
      const error = result.error as ControllerError;
      if (error.code === 'P0002' && /invoice not found/i.test(error.message)) {
        res.status(404).json({ success: false, message: 'Invoice not found' });
        return;
      }
      if (error.code === 'P0001' && /invoice overpayment/i.test(error.message)) {
        res.status(409).json({
          success: false,
          message: 'The invoice balance changed. Refresh and try again.',
        });
        return;
      }
      if (error.code === 'P0001' && /invalid invoice state/i.test(error.message)) {
        res.status(400).json({
          success: false,
          message: 'Payments can only be recorded for sent invoices',
        });
        return;
      }
      throw error;
    }
    const updated = unwrapRpcRow(result.data);
    if (!updated?.external_id) throw new Error('Unable to record payment');
    const invoice = await getInvoiceRecord(updated.external_id);
    if (!invoice) throw new Error('Unable to record payment');
    res.status(201).json({ success: true, data: toApiRecord(invoice) });
  } catch (error) {
    console.error('Unable to record invoice payment:', error);
    res.status(500).json({ success: false, message: 'Unable to record payment' });
  }
};

// @desc   Delete invoice
// @route  DELETE /api/invoices/:id
export const deleteInvoice = async (req: Request, res: Response): Promise<void> => {
  try {
    const client = requireSupabase();
    const existingResult = await client
      .from('invoices')
      .select('external_id,paid_amount,status')
      .eq('external_id', req.params.id)
      .maybeSingle();
    throwIfError(existingResult.error);
    const existing = existingResult.data;
    if (!existing) {
      res.status(404).json({ success: false, message: 'Invoice not found' });
      return;
    }
    if (Number(existing.paid_amount) > 0 || existing.status === 'paid') {
      res.status(400).json({
        success: false,
        message: 'Invoices with recorded payments cannot be deleted. Cancel the invoice to preserve its financial history.',
      });
      return;
    }
    const result = await client
      .from('invoices')
      .delete()
      .eq('external_id', req.params.id)
      .select('external_id')
      .maybeSingle();
    throwIfError(result.error);
    if (!result.data) {
      res.status(404).json({ success: false, message: 'Invoice not found' });
      return;
    }
    res.json({ success: true, message: 'Invoice deleted successfully' });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc   Get invoice stats
// @route  GET /api/invoices/stats
export const getInvoiceStats = async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await requireSupabase().from('invoices').select('status,total');
    throwIfError(result.error);

    const groups = new Map<string, { _id: string; count: number; total: number }>();
    let totalRevenue = 0;
    for (const invoice of result.data || []) {
      const status = invoice.status;
      const group = groups.get(status) || { _id: status, count: 0, total: 0 };
      group.count += 1;
      group.total += Number(invoice.total) || 0;
      groups.set(status, group);
      if (status === 'paid') totalRevenue += Number(invoice.total) || 0;
    }

    res.json({
      success: true,
      data: {
        byStatus: [...groups.values()],
        totalRevenue,
      },
    });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
