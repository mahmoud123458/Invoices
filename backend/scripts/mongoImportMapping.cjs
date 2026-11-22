const TABLES = [
  'users',
  'clients',
  'products',
  'shipping_companies',
  'invoices',
  'invoice_items',
  'invoice_payments',
  'purchase_orders',
  'purchase_order_items',
  'expenses',
];

const sourceCollections = {
  users: 'users',
  clients: 'clients',
  products: 'products',
  shipping_companies: 'shippingcompanies',
  invoices: 'invoices',
  purchase_orders: 'purchaseorders',
  expenses: 'expenses',
};

function mapId(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  if (typeof value.toHexString === 'function') return value.toHexString();
  if (typeof value === 'object' && value._id !== undefined) return mapId(value._id);
  if (typeof value === 'object' && value.id !== undefined) return mapId(value.id);
  if (typeof value.toString === 'function' && value.toString !== Object.prototype.toString) {
    return value.toString();
  }
  throw new TypeError('Mongo reference is not a supported identifier');
}

function requiredId(document) {
  const id = mapId(document && document._id);
  if (!id) throw new TypeError('Mongo document is missing _id');
  return id;
}

function optionalId(document, field) {
  return mapId(document && document[field]);
}

function nestedExternalId(document) {
  const id = optionalId(document, '_id');
  return id ? { external_id: id } : {};
}

function isoDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError('Mongo document contains an invalid date');
  return date.toISOString();
}

const mapUser = (document) => ({
  external_id: requiredId(document),
  name: document.name,
  email: document.email,
  password_hash: document.passwordHash || document.password,
  role: document.role || 'user',
  created_at: isoDate(document.createdAt) || new Date(0).toISOString(),
  updated_at: isoDate(document.updatedAt || document.createdAt) || new Date(0).toISOString(),
});

const mapClient = (document) => ({
  external_id: requiredId(document),
  name: document.name,
  email: document.email || null,
  phone: document.phone || null,
  company: document.company || null,
  address: document.address || null,
  notes: document.notes || null,
  created_at: isoDate(document.createdAt) || new Date(0).toISOString(),
  updated_at: isoDate(document.updatedAt || document.createdAt) || new Date(0).toISOString(),
});

const mapProduct = (document) => ({
  external_id: requiredId(document),
  name: document.name,
  sku: document.sku,
  description: document.description || null,
  quantity: document.quantity ?? 0,
  price: document.price ?? 0,
  low_stock_alert: document.lowStockAlert ?? 10,
  category: document.category || null,
  created_at: isoDate(document.createdAt) || new Date(0).toISOString(),
  updated_at: isoDate(document.updatedAt || document.createdAt) || new Date(0).toISOString(),
});

const mapShippingCompany = (document) => ({
  external_id: requiredId(document),
  name: document.name,
  phone: document.phone,
  email: document.email || null,
  address: document.address || null,
  avg_delivery_days: document.avgDeliveryDays ?? 3,
  price_per_kg: document.pricePerKg ?? 0,
  notes: document.notes || null,
  is_active: document.isActive ?? true,
  created_at: isoDate(document.createdAt) || new Date(0).toISOString(),
  updated_at: isoDate(document.updatedAt || document.createdAt) || new Date(0).toISOString(),
});

function mapInvoice(document) {
  const externalId = requiredId(document);
  return {
    record: {
      external_id: externalId,
      invoice_number: document.invoiceNumber,
      client_id: optionalId(document, 'client'),
      subtotal: document.subtotal ?? 0,
      tax: document.tax ?? 0,
      discount: document.discount ?? 0,
      total: document.total ?? 0,
      paid_amount: document.paidAmount ?? 0,
      status: document.status || 'draft',
      shipping_company_id: optionalId(document, 'shippingCompany'),
      shipping_status: document.shippingStatus || null,
      delivered_at: isoDate(document.deliveredAt),
      due_date: isoDate(document.dueDate),
      notes: document.notes || null,
      created_by: optionalId(document, 'createdBy'),
      created_at: isoDate(document.createdAt) || new Date(0).toISOString(),
      updated_at: isoDate(document.updatedAt || document.createdAt) || new Date(0).toISOString(),
    },
    items: (document.items || []).map((item) => ({
      ...nestedExternalId(item),
      invoice_id: externalId,
      product_id: optionalId(item, 'product'),
      product_name: item.productName,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      total: item.total,
    })),
    payments: (document.payments || []).map((payment) => ({
      ...nestedExternalId(payment),
      invoice_id: externalId,
      amount: payment.amount,
      payment_date: isoDate(payment.date),
      method: payment.method || 'other',
      reference: payment.reference || null,
      notes: payment.notes || null,
      recorded_by: optionalId(payment, 'recordedBy'),
      created_at: isoDate(payment.createdAt) || isoDate(payment.date),
    })),
  };
}

function mapPurchaseOrder(document) {
  const externalId = requiredId(document);
  return {
    record: {
      external_id: externalId,
      order_number: document.orderNumber,
      supplier: document.supplier,
      supplier_contact: document.supplierContact || null,
      subtotal: document.subtotal ?? 0,
      total: document.total ?? 0,
      status: document.status || 'pending',
      notes: document.notes || null,
      approved_by: optionalId(document, 'approvedBy'),
      approved_at: isoDate(document.approvedAt),
      created_by: optionalId(document, 'createdBy'),
      created_at: isoDate(document.createdAt) || new Date(0).toISOString(),
      updated_at: isoDate(document.updatedAt || document.createdAt) || new Date(0).toISOString(),
    },
    items: (document.items || []).map((item) => ({
      ...nestedExternalId(item),
      order_id: externalId,
      product_id: optionalId(item, 'product'),
      product_name: item.productName,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      total: item.total,
    })),
  };
}

const mapExpense = (document) => ({
  external_id: requiredId(document),
  description: document.description,
  category: document.category,
  amount: document.amount,
  expense_date: isoDate(document.date),
  payment_method: document.paymentMethod || 'other',
  reference: document.reference || null,
  notes: document.notes || null,
  created_by: optionalId(document, 'createdBy'),
  created_at: isoDate(document.createdAt) || new Date(0).toISOString(),
});

function mapSourceDocuments(collections = {}) {
  const mapped = Object.fromEntries(TABLES.map((table) => [table, []]));
  for (const document of collections[sourceCollections.users] || []) mapped.users.push(mapUser(document));
  for (const document of collections[sourceCollections.clients] || []) mapped.clients.push(mapClient(document));
  for (const document of collections[sourceCollections.products] || []) mapped.products.push(mapProduct(document));
  for (const document of collections[sourceCollections.shipping_companies] || []) {
    mapped.shipping_companies.push(mapShippingCompany(document));
  }
  for (const document of collections[sourceCollections.invoices] || []) {
    const invoice = mapInvoice(document);
    mapped.invoices.push(invoice.record);
    mapped.invoice_items.push(...invoice.items);
    mapped.invoice_payments.push(...invoice.payments);
  }
  for (const document of collections[sourceCollections.purchase_orders] || []) {
    const order = mapPurchaseOrder(document);
    mapped.purchase_orders.push(order.record);
    mapped.purchase_order_items.push(...order.items);
  }
  for (const document of collections[sourceCollections.expenses] || []) mapped.expenses.push(mapExpense(document));
  return mapped;
}

module.exports = {
  TABLES,
  mapId,
  mapUser,
  mapClient,
  mapProduct,
  mapShippingCompany,
  mapInvoice,
  mapPurchaseOrder,
  mapExpense,
  mapSourceDocuments,
};
