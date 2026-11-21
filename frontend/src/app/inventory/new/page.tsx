'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Textarea } from '@/components/shadcn/textarea';
import { productsApi } from '@/lib/api';

export default function NewProductPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('0');
  const [quantity, setQuantity] = useState('0');
  const [lowStockAlert, setLowStockAlert] = useState('10');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !sku.trim()) {
      setError('Product Name and SKU are required');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await productsApi.create({
        name: name.trim(),
        sku: sku.trim().toUpperCase(),
        category: category.trim() || undefined,
        price: Number(price) || 0,
        quantity: Number(quantity) || 0,
        lowStockAlert: Number(lowStockAlert) || 10,
        description: description.trim() || undefined,
      });
      router.push('/inventory');
    } catch (err: any) {
      setError(err.message || 'Failed to create product');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ProtectedRoute>
    <AppLayout>
      <div className="max-w-3xl mx-auto">
        <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Add New Product</h1>
            <p className="text-gray-500 text-sm mt-1">Add a new item to your product catalog</p>
          </div>
          <Button variant="secondary" onClick={() => router.push('/inventory')}>
            Back to Inventory
          </Button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <Card title="Product Information">
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Product Name"
                  required
                  placeholder="e.g. Wireless Mouse"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <Input
                  label="SKU / Barcode"
                  required
                  placeholder="e.g. WM-1001"
                  value={sku}
                  onChange={(e) => setSku(e.target.value.toUpperCase())}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input
                  label="Unit Price (EGP)"
                  type="number"
                  required
                  placeholder="0.00"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
                <Input
                  label="Initial Stock Quantity"
                  type="number"
                  required
                  placeholder="0"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
                <Input
                  label="Low Stock Alert Threshold"
                  type="number"
                  placeholder="10"
                  value={lowStockAlert}
                  onChange={(e) => setLowStockAlert(e.target.value)}
                />
              </div>

              <Input
                label="Category"
                placeholder="e.g. Electronics, Office, Accessories"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />

              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">
                  Description
                </label>
                <Textarea
                  rows={3}

                  placeholder="Product description and details..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <Button type="button" variant="secondary" onClick={() => router.push('/inventory')}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Creating...' : 'Create Product'}
                </Button>
              </div>
            </div>
          </Card>
        </form>
      </div>
    </AppLayout>
    </ProtectedRoute>
  );
}
