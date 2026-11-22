'use client';

export const runtime = 'edge';

import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Input, { Select } from '@/components/ui/Input';
import { clientsApi, invoicesApi, productsApi, shippingApi } from '@/lib/api';
import { ApiResponse, Client, Invoice, Product, ShippingCompany } from '@/types';
import { formatCurrency } from '@/lib/format';
import { Textarea } from '@/components/shadcn/textarea';

interface EditableItem {
  product: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

function referenceId(reference: string | { _id: string } | undefined): string {
  if (!reference) return '';
  return typeof reference === 'string' ? reference : reference._id;
}

export default function EditInvoicePage() {
  const params = useParams();
  const router = useRouter();
  const invoiceId = params.id as string;
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [shippingCompanies, setShippingCompanies] = useState<ShippingCompany[]>([]);
  const [clientId, setClientId] = useState('');
  const [shippingCompanyId, setShippingCompanyId] = useState('');
  const [shippingStatus, setShippingStatus] = useState<Invoice['shippingStatus'] | ''>('');
  const [deliveredAt, setDeliveredAt] = useState('');
  const [status, setStatus] = useState('draft');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [tax, setTax] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [items, setItems] = useState<EditableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      try {
        const [invoiceResult, clientResult, productResult, shippingResult] = await Promise.all([
          invoicesApi.getOne(invoiceId) as Promise<ApiResponse<Invoice>>,
          clientsApi.getAll() as Promise<ApiResponse<Client[]>>,
          productsApi.getAll() as Promise<ApiResponse<Product[]>>,
          shippingApi.getAll() as Promise<ApiResponse<ShippingCompany[]>>,
        ]);
        if (!active) return;

        const invoice = invoiceResult.data;
        setClients(clientResult.data || []);
        setProducts(productResult.data || []);
        setShippingCompanies(shippingResult.data || []);
        setClientId(referenceId(invoice.client));
        setShippingCompanyId(referenceId(invoice.shippingCompany));
        setShippingStatus(invoice.shippingStatus || '');
        setDeliveredAt(invoice.deliveredAt ? new Date(invoice.deliveredAt).toISOString().slice(0, 10) : '');
        setStatus(invoice.status);
        setDueDate(invoice.dueDate ? new Date(invoice.dueDate).toISOString().slice(0, 10) : '');
        setNotes(invoice.notes || '');
        setTax(invoice.tax || 0);
        setDiscount(invoice.discount || 0);
        setItems(invoice.items.map((item) => ({
          product: referenceId(item.product),
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })));
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load this invoice');
      } finally {
        if (active) setLoading(false);
      }
    });
    return () => { active = false; };
  }, [invoiceId]);

  function updateItem(index: number, field: keyof EditableItem, value: string | number) {
    setItems((current) => current.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      if (field === 'product') {
        const product = products.find((candidate) => candidate._id === value);
        return product
          ? { ...item, product: product._id, productName: product.name, unitPrice: product.price }
          : { ...item, product: '', productName: '' };
      }
      return { ...item, [field]: value };
    }));
  }

  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const total = subtotal + (subtotal * tax) / 100 - discount;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!clientId) {
      setError('Select a client.');
      return;
    }
    if (items.length === 0 || items.some((item) => !item.product || item.quantity < 1 || item.unitPrice < 0)) {
      setError('Add at least one valid product with a positive quantity.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const processedItems = items.map((item) => ({ ...item, total: item.quantity * item.unitPrice }));
      const nextSubtotal = processedItems.reduce((sum, item) => sum + item.total, 0);
      await invoicesApi.update(invoiceId, {
        client: clientId,
        items: processedItems,
        subtotal: nextSubtotal,
        tax,
        discount,
        total: nextSubtotal + (nextSubtotal * tax) / 100 - discount,
        status,
        shippingCompany: shippingCompanyId || null,
        shippingStatus: shippingStatus || null,
        deliveredAt: deliveredAt || null,
        dueDate: dueDate || null,
        notes,
      });
      router.push(`/invoices/${invoiceId}`);
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not update this invoice');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedRoute>
    <AppLayout>
      <div className="mx-auto max-w-4xl space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-gray-900">Edit Invoice</h1>
          <p className="mt-1 text-sm text-gray-500">Update invoice details, line items, and status.</p>
        </header>

        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {loading ? <p className="py-12 text-center text-sm text-gray-500">Loading invoice...</p> : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <Card title="Client and status">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Select
                  label="Client"
                  value={clientId}
                  onChange={(event) => setClientId(event.target.value)}
                  options={clients.map((client) => ({ value: client._id, label: client.company ? `${client.name} (${client.company})` : client.name }))}
                  placeholder="Select a client"
                  required
                />
                <Select
                  label="Status"
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  options={[
                    { value: 'draft', label: 'Draft' },
                    { value: 'sent', label: 'Sent' },
                    ...(status === 'paid' ? [{ value: 'paid', label: 'Paid' }] : []),
                    { value: 'cancelled', label: 'Cancelled' },
                  ]}
                />
              </div>
            </Card>

            <Card title="Invoice items">
              <div className="space-y-3">
                {items.map((item, index) => (
                  <div key={`${item.product}-${index}`} className="grid grid-cols-1 items-end gap-3 border-b border-gray-100 pb-4 sm:grid-cols-[minmax(0,1fr)_6rem_8rem_auto]">
                    <Select
                      label="Product"
                      value={item.product}
                      onChange={(event) => updateItem(index, 'product', event.target.value)}
                      options={products.map((product) => ({ value: product._id, label: `${product.name} (${product.sku})` }))}
                      placeholder="Select product"
                      required
                    />
                    <Input label="Quantity" type="number" min={1} value={item.quantity} onChange={(event) => updateItem(index, 'quantity', Number(event.target.value))} required />
                    <Input label="Unit price" type="number" min={0} step="0.01" value={item.unitPrice} onChange={(event) => updateItem(index, 'unitPrice', Number(event.target.value))} required />
                    <Button type="button" variant="danger" size="sm" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
              <Button type="button" variant="secondary" size="sm" className="mt-4" onClick={() => setItems((current) => [...current, { product: '', productName: '', quantity: 1, unitPrice: 0 }])}>
                Add item
              </Button>
            </Card>

            <Card title="Totals and delivery">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input label="Tax (%)" type="number" min={0} step="0.01" value={tax} onChange={(event) => setTax(Number(event.target.value))} />
                <Input label="Discount" type="number" min={0} step="0.01" value={discount} onChange={(event) => setDiscount(Number(event.target.value))} />
                <Select
                  label="Shipping company"
                  value={shippingCompanyId}
                  onChange={(event) => setShippingCompanyId(event.target.value)}
                  options={shippingCompanies.map((company) => ({ value: company._id, label: company.name }))}
                  placeholder="None"
                />
                <Select
                  label="Shipping status"
                  value={shippingStatus}
                  onChange={(event) => setShippingStatus(event.target.value as Invoice['shippingStatus'] | '')}
                  options={[
                    { value: 'pending', label: 'Pending' },
                    { value: 'shipped', label: 'Shipped' },
                    { value: 'delivered', label: 'Delivered' },
                    { value: 'returned', label: 'Returned' },
                  ]}
                  placeholder="Not set"
                />
                <Input label="Delivered at" type="date" value={deliveredAt} onChange={(event) => setDeliveredAt(event.target.value)} />
                <Input label="Due date" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
                <div className="sm:col-span-2">
                  <label htmlFor="invoice-notes" className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
                  <Textarea id="invoice-notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
                </div>
              </div>
              <div className="mt-5 flex justify-end border-t border-gray-100 pt-4 text-right">
                <p className="text-lg font-semibold text-gray-900">Total: {formatCurrency(total)}</p>
              </div>
            </Card>

            <div className="flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => router.back()} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</Button>
            </div>
          </form>
        )}
      </div>
    </AppLayout>
    </ProtectedRoute>
  );
}