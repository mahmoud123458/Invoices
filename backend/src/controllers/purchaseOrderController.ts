import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { AuthRequest } from '../middleware/auth';

type ControllerError = Error & { code?: string };

const purchaseOrderListSelect = [
  '*',
  'createdBy:users!purchase_orders_created_by_fkey(external_id,name)',
  'approvedBy:users!purchase_orders_approved_by_fkey(external_id,name)',
  'items:purchase_order_items(*)',
].join(',');

const purchaseOrderDetailSelect = [
  '*',
  'createdBy:users!purchase_orders_created_by_fkey(external_id,name,email)',
  'approvedBy:users!purchase_orders_approved_by_fkey(external_id,name,email)',
  'items:purchase_order_items(*,product:products!purchase_order_items_product_id_fkey(*))',
].join(',');

const requireSupabase = () => {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
};

const throwIfError = (error: { message?: string } | null): void => {
  if (error) throw error;
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
    if (key === 'order_id') continue;
    if (key === 'product_id') {
      mapped.product = record.product ? toApiRecord(record.product) : value;
      continue;
    }
    if (key === 'created_by') {
      mapped.createdBy = record.createdBy ? toApiRecord(record.createdBy) : value;
      continue;
    }
    if (key === 'approved_by') {
      mapped.approvedBy = record.approvedBy ? toApiRecord(record.approvedBy) : value;
      continue;
    }
    const apiKey = key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
    mapped[apiKey] = toApiRecord(value);
  }
  return mapped;
};

const getPurchaseOrderRecord = async (
  id: string,
  select = purchaseOrderDetailSelect
): Promise<any | null> => {
  const result = await requireSupabase()
    .from('purchase_orders')
    .select(select)
    .eq('external_id', id)
    .maybeSingle();
  throwIfError(result.error);
  return result.data;
};

const referenceId = (value: any): string | null => {
  if (value && typeof value === 'object') {
    const id = value._id ?? value.external_id;
    return id == null ? null : String(id);
  }
  return value == null || value === '' ? null : String(value);
};

const allowedStatuses = ['pending', 'approved', 'rejected', 'received'];

// @desc   Get all purchase orders
// @route  GET /api/purchase-orders
export const getPurchaseOrders = async (req: Request, res: Response): Promise<void> => {
  try {
    let query = requireSupabase()
      .from('purchase_orders')
      .select(purchaseOrderListSelect)
      .order('created_at', { ascending: false });
    if (typeof req.query.status === 'string') query = query.eq('status', req.query.status);

    const result = await query;
    throwIfError(result.error);
    const orders = (result.data || []).map(toApiRecord);
    res.json({ success: true, count: orders.length, data: orders });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc   Get single purchase order
// @route  GET /api/purchase-orders/:id
export const getPurchaseOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const order = await getPurchaseOrderRecord(req.params.id);
    if (!order) {
      res.status(404).json({ success: false, message: 'Purchase order not found' });
      return;
    }
    res.json({ success: true, data: toApiRecord(order) });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc   Create purchase order
// @route  POST /api/purchase-orders
export const createPurchaseOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  const supplier = typeof req.body?.supplier === 'string' ? req.body.supplier.trim() : '';
  const { items } = req.body || {};
  if (!supplier) {
    res.status(400).json({ success: false, message: 'Supplier is required' });
    return;
  }
  if (!Array.isArray(items) || items.length < 1 || items.length > 50) {
    res.status(400).json({ success: false, message: 'A purchase order must contain between 1 and 50 items' });
    return;
  }

  const processedItems = [];
  for (const item of items) {
    const productId = referenceId(item?.product);
    const productName = typeof item?.productName === 'string' ? item.productName.trim() : '';
    const quantity = Number(item?.quantity);
    const unitPrice = Number(item?.unitPrice);
    if (
      !productId
      || !productName
      || !Number.isInteger(quantity)
      || quantity < 1
      || !Number.isFinite(unitPrice)
      || unitPrice < 0
    ) {
      res.status(400).json({
        success: false,
        message: 'Purchase order items require a product, name, positive quantity, and non-negative price',
      });
      return;
    }
    const roundedUnitPrice = Math.round(unitPrice * 100) / 100;
    processedItems.push({
      product_id: productId,
      product_name: productName,
      quantity,
      unit_price: roundedUnitPrice,
      total: Math.round(quantity * roundedUnitPrice * 100) / 100,
    });
  }

  const subtotal = processedItems.reduce((sum, item) => sum + item.total, 0);
  const body = req.body || {};
  const purchaseOrder = {
    supplier,
    supplier_contact: typeof body.supplierContact === 'string' ? body.supplierContact.trim() : null,
    status: typeof body.status === 'string' ? body.status : 'pending',
    notes: typeof body.notes === 'string' ? body.notes : null,
    created_by: req.user?._id || null,
    subtotal,
    total: subtotal,
  };
  if (!allowedStatuses.includes(purchaseOrder.status)) {
    res.status(400).json({ success: false, message: 'Invalid purchase order status' });
    return;
  }

  try {
    const result = await requireSupabase().rpc('create_purchase_order_with_items', {
      p_order: purchaseOrder,
      p_items: processedItems,
    });
    if (result.error) {
      const error = result.error as ControllerError;
      if (error.code === 'P0002' && /product not found/i.test(error.message)) {
        res.status(400).json({ success: false, message: error.message });
        return;
      }
      throw error;
    }

    const created = Array.isArray(result.data) ? result.data[0] : result.data;
    if (!created?.external_id) throw new Error('Purchase order could not be created');
    const order = await getPurchaseOrderRecord(created.external_id);
    if (!order) throw new Error('Purchase order could not be created');
    res.status(201).json({ success: true, data: toApiRecord(order) });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message || 'Unable to create purchase order' });
  }
};

// @desc   Approve purchase order → updates inventory
// @route  PUT /api/purchase-orders/:id/approve
export const approvePurchaseOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await requireSupabase().rpc('approve_purchase_order', {
      p_order_id: req.params.id,
      p_approved_by: req.user?._id || null,
    });
    if (result.error) {
      const error = result.error as ControllerError;
      if (error.code === 'P0002' && /purchase order not found/i.test(error.message)) {
        res.status(404).json({ success: false, message: 'Purchase order not found' });
        return;
      }
      if (error.code === 'P0001' && /invalid purchase order state/i.test(error.message)) {
        res.status(400).json({ success: false, message: 'Order is not in pending status' });
        return;
      }
      throw error;
    }

    const updated = Array.isArray(result.data) ? result.data[0] : result.data;
    if (!updated?.external_id) throw new Error('Purchase order could not be approved');
    const order = await getPurchaseOrderRecord(updated.external_id);
    if (!order) throw new Error('Purchase order could not be approved');
    res.json({
      success: true,
      message: 'Purchase order approved and inventory updated',
      data: toApiRecord(order),
    });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc   Reject purchase order
// @route  PUT /api/purchase-orders/:id/reject
export const rejectPurchaseOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await requireSupabase()
      .from('purchase_orders')
      .update({ status: 'rejected' })
      .eq('external_id', req.params.id)
      .eq('status', 'pending')
      .select(purchaseOrderDetailSelect)
      .maybeSingle();
    throwIfError(result.error);

    if (!result.data) {
      const existing = await requireSupabase()
        .from('purchase_orders')
        .select('external_id')
        .eq('external_id', req.params.id)
        .maybeSingle();
      throwIfError(existing.error);
      if (!existing.data) {
        res.status(404).json({ success: false, message: 'Purchase order not found' });
        return;
      }
      res.status(400).json({ success: false, message: 'Order is not in pending status' });
      return;
    }

    res.json({
      success: true,
      message: 'Purchase order rejected',
      data: toApiRecord(result.data),
    });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
