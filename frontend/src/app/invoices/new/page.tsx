'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input, { Select } from '@/components/ui/Input';
import { invoicesApi, clientsApi, productsApi, shippingApi } from '@/lib/api';
import { Client, Product, ShippingCompany } from '@/types';
import { formatCurrency } from '@/lib/format';
import { Textarea } from '@/components/shadcn/textarea';

interface InvoiceItemForm {
  product: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export default function NewInvoicePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Dropdown data
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [shippingCompanies, setShippingCompanies] = useState<ShippingCompany[]>([]);

  // Form state
  const [clientId, setClientId] = useState('');
  const [status, setStatus] = useState('draft');
  const [shippingCompanyId, setShippingCompanyId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [tax, setTax] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [items, setItems] = useState<InvoiceItemForm[]>([
    { product: '', productName: '', quantity: 1, unitPrice: 0, total: 0 },
  ]);

  // New client modal
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClient, setNewClient] = useState({ name: '', email: '', phone: '', address: '' });
  const [creatingClient, setCreatingClient] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [cRes, pRes, sRes] = await Promise.all([
          clientsApi.getAll() as any,
          productsApi.getAll() as any,
          shippingApi.getAll() as any,
        ]);
        setClients(cRes.data || []);
        setProducts(pRes.data || []);
        setShippingCompanies(sRes.data || []);
      } catch (err) {
        console.error(err);
      }
    };
    load();
  }, []);

  const handleCreateClient = async () => {
    if (!newClient.name) return;
    setCreatingClient(true);
    try {
      const res = await clientsApi.create(newClient) as any;
      const created = res.data;
      setClients((prev) => [...prev, created]);
      setClientId(created._id);
      setShowNewClient(false);
      setNewClient({ name: '', email: '', phone: '', address: '' });
    } catch (err: any) {
      alert(err.message);
    } finally {
      setCreatingClient(false);
    }
  };

  const handleItemChange = (index: number, field: string, value: string | number) => {
    setItems((prev) => {
      const updated = [...prev];
      const item = { ...updated[index], [field]: value };

      if (field === 'product') {
        const product = products.find((p) => p._id === value);
        if (product) {
          item.productName = product.name;
          item.unitPrice = product.price;
          item.total = item.quantity * product.price;
        }
      }
      if (field === 'quantity' || field === 'unitPrice') {
        item.total = Number(item.quantity) * Number(item.unitPrice);
      }
      updated[index] = item;
      return updated;
    });
  };

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      { product: '', productName: '', quantity: 1, unitPrice: 0, total: 0 },
    ]);
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const subtotal = items.reduce((s, item) => s + item.total, 0);
  const total = subtotal + (subtotal * tax) / 100 - discount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId) { setError('Please select a client'); return; }
    if (items.some((item) => !item.product)) { setError('Please select a product for all items'); return; }

    setLoading(true);
    setError('');
    try {
      await invoicesApi.create({
        client: clientId,
        items,
        status,
        shippingCompany: shippingCompanyId || undefined,
        dueDate: dueDate || undefined,
        notes,
        tax,
        discount,
      });
      router.push('/invoices');
    } catch (err: any) {
      setError(err.message || 'Failed to create invoice');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProtectedRoute>
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">New Invoice</h1>
        <p className="text-gray-500 text-sm mt-1">Create a new invoice for a client</p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Client Selection */}
        <Card title="Client Information">
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-end">
            <Select
              label="Select Client"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              options={clients.map((c) => ({ value: c._id, label: `${c.name}${c.company ? ` (${c.company})` : ''}` }))}
              placeholder="Choose a client..."
              required
              className="flex-1"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowNewClient(true)}
              className="w-full sm:w-auto"
            >
              + New Client
            </Button>
          </div>

          {/* New Client Inline Form */}
          {showNewClient && (
            <div className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-200">
              <h4 className="font-medium text-blue-800 mb-3">Create New Client</h4>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input label="Name *" value={newClient.name} onChange={(e) => setNewClient((p) => ({ ...p, name: e.target.value }))} placeholder="Client name" />
                <Input label="Email" type="email" value={newClient.email} onChange={(e) => setNewClient((p) => ({ ...p, email: e.target.value }))} placeholder="email@example.com" />
                <Input label="Phone" value={newClient.phone} onChange={(e) => setNewClient((p) => ({ ...p, phone: e.target.value }))} placeholder="+1234567890" />
                <Input label="Address" value={newClient.address} onChange={(e) => setNewClient((p) => ({ ...p, address: e.target.value }))} placeholder="Address" />
              </div>
              <div className="flex gap-2 mt-3">
                <Button type="button" onClick={handleCreateClient} disabled={creatingClient} size="sm">
                  {creatingClient ? 'Creating...' : 'Create & Select'}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setShowNewClient(false)} size="sm">
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* Invoice Items */}
        <Card title="Invoice Items">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left pb-3 font-semibold text-gray-600 w-2/5">Product</th>
                  <th className="text-left pb-3 px-2 font-semibold text-gray-600">Qty</th>
                  <th className="text-left pb-3 px-2 font-semibold text-gray-600">Unit Price</th>
                  <th className="text-left pb-3 px-2 font-semibold text-gray-600">Total</th>
                  <th className="pb-3 w-10" />
                </tr>
              </thead>
              <tbody className="space-y-2">
                {items.map((item, index) => (
                  <tr key={index}>
                    <td className="pb-3 pr-2">
                      <Select
                        value={item.product}
                        onChange={(e) => handleItemChange(index, 'product', e.target.value)}
                        options={products.map((p) => ({ value: p._id, label: `${p.name} (${p.sku}) - Stock: ${p.quantity}` }))}
                        placeholder="Select product..."
                      />
                    </td>
                    <td className="pb-3 px-2">
                      <Input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(index, 'quantity', Number(e.target.value))}
                      />
                    </td>
                    <td className="pb-3 px-2">
                      <Input
                        type="number"
                        value={item.unitPrice}
                        onChange={(e) => handleItemChange(index, 'unitPrice', Number(e.target.value))}
                      />
                    </td>
                    <td className="pb-3 px-2 font-semibold text-gray-800">
                      {formatCurrency(item.total)}
                    </td>
                    <td className="pb-3 pl-2">
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="text-red-400 hover:text-red-600 p-1"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button type="button" variant="secondary" onClick={addItem} size="sm" className="mt-2">
            + Add Item
          </Button>

          {/* Totals */}
          <div className="mt-6 flex justify-end">
            <div className="w-full max-w-72 space-y-2 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-gray-600 w-20">Tax (%)</span>
                <Input type="number" value={tax} onChange={(e) => setTax(Number(e.target.value))} className="flex-1" />
                <span className="text-gray-600">{formatCurrency((subtotal * tax) / 100)}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-gray-600 w-20">Discount</span>
                <Input type="number" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} className="flex-1" />
                <span className="text-gray-600">-{formatCurrency(discount)}</span>
              </div>
              <div className="flex justify-between font-bold text-gray-900 border-t pt-2 text-base">
                <span>Total</span>
                <span>{formatCurrency(total)}</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Invoice Details */}
        <Card title="Invoice Details">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              options={[
                { value: 'draft', label: 'Draft' },
                { value: 'sent', label: 'Sent' },
              ]}
            />
            <Select
              label="Shipping Company"
              value={shippingCompanyId}
              onChange={(e) => setShippingCompanyId(e.target.value)}
              options={shippingCompanies.map((c) => ({ value: c._id, label: c.name }))}
              placeholder="None"
            />
            <Input
              label="Due Date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
            <div className="sm:col-span-2">
              <label className="text-sm font-medium text-gray-700 block mb-1">Notes</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Additional notes..."
              />
            </div>
          </div>
        </Card>

        {/* Actions */}
        <div className="flex flex-col-reverse justify-end gap-3 sm:flex-row">
          <Button className="w-full sm:w-auto" type="button" variant="secondary" onClick={() => router.push('/invoices')}>
            Cancel
          </Button>
          <Button className="w-full sm:w-auto" type="submit" disabled={loading}>
            {loading ? 'Creating...' : 'Create Invoice'}
          </Button>
        </div>
      </form>
    </AppLayout>
    </ProtectedRoute>
  );
}
