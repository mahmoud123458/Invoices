'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input, { Select } from '@/components/ui/Input';
import { purchaseOrdersApi, productsApi } from '@/lib/api';
import { Product } from '@/types';
import { formatCurrency } from '@/lib/format';
import { Textarea } from '@/components/shadcn/textarea';

interface OrderItemRow {
  product: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export default function NewPurchaseOrderPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [supplier, setSupplier] = useState('');
  const [supplierContact, setSupplierContact] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<OrderItemRow[]>([
    { product: '', productName: '', quantity: 1, unitPrice: 0, total: 0 },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadProducts() {
      try {
        const res = (await productsApi.getAll()) as { success: boolean; data: Product[] };
        setProducts(res.data || []);
      } catch (err: any) {
        console.error(err);
      }
    }
    loadProducts();
  }, []);

  function handleItemChange(index: number, field: string, value: string | number) {
    setItems((prev) => {
      const updated = [...prev];
      const item = { ...updated[index], [field]: value };

      if (field === 'product') {
        const prod = products.find((p) => p._id === value);
        if (prod) {
          item.productName = prod.name;
          item.unitPrice = prod.price;
          item.total = item.quantity * prod.price;
        }
      }
      if (field === 'quantity' || field === 'unitPrice') {
        item.total = Number(item.quantity) * Number(item.unitPrice);
      }
      updated[index] = item;
      return updated;
    });
  }

  function addItem() {
    setItems((prev) => [
      ...prev,
      { product: '', productName: '', quantity: 1, unitPrice: 0, total: 0 },
    ]);
  }

  function removeItem(index: number) {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  const subtotal = items.reduce((sum, it) => sum + it.total, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supplier.trim()) {
      setError('Supplier name is required');
      return;
    }
    if (items.some((it) => !it.product || it.quantity <= 0)) {
      setError('Please select valid products and positive quantities for all items');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await purchaseOrdersApi.create({
        supplier: supplier.trim(),
        supplierContact: supplierContact.trim() || undefined,
        notes: notes.trim() || undefined,
        items,
      });
      router.push('/purchase-orders');
    } catch (err: any) {
      setError(err.message || 'Failed to create purchase order');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ProtectedRoute>
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">New Purchase Order</h1>
            <p className="text-gray-500 text-sm mt-1">
              Issue an order to your supplier. Once approved, items will be added to your stock.
            </p>
          </div>
          <Button className="w-full sm:w-auto" variant="secondary" onClick={() => router.push('/purchase-orders')}>
            Back to Orders
          </Button>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Supplier Info */}
          <Card title="Supplier Information">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Supplier Name"
                required
                placeholder="e.g. Al-Nour Distribution Co."
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
              />
              <Input
                label="Supplier Contact / Phone"
                placeholder="+20 100 123 4567 or supplier@mail.com"
                value={supplierContact}
                onChange={(e) => setSupplierContact(e.target.value)}
              />
            </div>
          </Card>

          {/* Items Section */}
          <Card title="Order Items">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left pb-3 font-semibold text-gray-600 w-2/5">Product</th>
                    <th className="text-left pb-3 px-2 font-semibold text-gray-600">Qty</th>
                    <th className="text-left pb-3 px-2 font-semibold text-gray-600">Cost per Unit (EGP)</th>
                    <th className="text-left pb-3 px-2 font-semibold text-gray-600">Total (EGP)</th>
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
                          options={products.map((p) => ({
                            value: p._id,
                            label: `${p.name} (Current Stock: ${p.quantity})`,
                          }))}
                          placeholder="Select product from inventory..."
                          required
                        />
                      </td>
                      <td className="pb-3 px-2">
                        <Input
                          type="number"
                          value={item.quantity}
                          onChange={(e) =>
                            handleItemChange(index, 'quantity', Math.max(1, Number(e.target.value)))
                          }
                          required
                        />
                      </td>
                      <td className="pb-3 px-2">
                        <Input
                          type="number"
                          value={item.unitPrice}
                          onChange={(e) =>
                            handleItemChange(index, 'unitPrice', Math.max(0, Number(e.target.value)))
                          }
                          required
                        />
                      </td>
                      <td className="pb-3 px-2 font-semibold text-gray-900">
                        {formatCurrency(item.total)}
                      </td>
                      <td className="pb-3 pl-2">
                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeItem(index)}
                            className="text-red-400 hover:text-red-600 p-1"
                          >
                            ✕
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Button type="button" variant="secondary" onClick={addItem} size="sm" className="mt-3">
              + Add Another Item
            </Button>

            <div className="mt-6 flex justify-end pt-4 border-t border-gray-100">
              <div className="w-full max-w-64 text-right">
                <span className="text-sm text-gray-500 block">Total Order Cost</span>
                <span className="text-2xl font-bold text-gray-900">{formatCurrency(subtotal)}</span>
              </div>
            </div>
          </Card>

          {/* Notes */}
          <Card title="Additional Information">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">
                Order Notes / Delivery Instructions
              </label>
              <Textarea
                rows={3}
                placeholder="Include shipping terms, expected delivery window, batch numbers..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </Card>

          {/* Submit */}
          <div className="flex flex-col-reverse justify-end gap-3 sm:flex-row">
            <Button
              type="button"
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={() => router.push('/purchase-orders')}
            >
              Cancel
            </Button>
            <Button className="w-full sm:w-auto" type="submit" disabled={loading}>
              {loading ? 'Submitting Order...' : 'Submit Purchase Order'}
            </Button>
          </div>
        </form>
      </div>
    </AppLayout>
    </ProtectedRoute>
  );
}
