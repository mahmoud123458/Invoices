'use client';

import { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import DeleteIconButton from '@/components/ui/DeleteIconButton';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import { Dialog } from '@/components/shadcn/dialog';
import { Textarea } from '@/components/shadcn/textarea';
import { productsApi } from '@/lib/api';
import { Product } from '@/types';
import { formatCurrency } from '@/lib/format';

interface ProductFormData {
  name: string;
  sku: string;
  description: string;
  quantity: string;
  price: string;
  lowStockAlert: string;
  category: string;
}

const emptyForm: ProductFormData = {
  name: '',
  sku: '',
  description: '',
  quantity: '0',
  price: '0',
  lowStockAlert: '5',
  category: '',
};

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showLowStock, setShowLowStock] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductFormData>(emptyForm);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [notification, setNotification] = useState('');

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await productsApi.getAll(search || undefined, showLowStock || undefined) as { success: boolean; data: Product[] };
      setProducts(res.data || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load products');
    } finally {
      setLoading(false);
    }
  }, [search, showLowStock]);

  useEffect(() => {
    const timer = setTimeout(() => fetchProducts(), 300);
    return () => clearTimeout(timer);
  }, [fetchProducts]);

  function openAddModal() {
    setEditingProduct(null);
    setForm(emptyForm);
    setFormError('');
    setShowModal(true);
  }

  function openEditModal(product: Product) {
    setEditingProduct(product);
    setForm({
      name: product.name,
      sku: product.sku,
      description: product.description || '',
      quantity: String(product.quantity),
      price: String(product.price),
      lowStockAlert: String(product.lowStockAlert),
      category: product.category || '',
    });
    setFormError('');
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingProduct(null);
    setForm(emptyForm);
    setFormError('');
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setFormError('Name is required.'); return; }
    if (!form.sku.trim()) { setFormError('SKU is required.'); return; }
    setSubmitting(true);
    setFormError('');
    const payload = {
      name: form.name,
      sku: form.sku,
      description: form.description,
      quantity: Number(form.quantity),
      price: Number(form.price),
      lowStockAlert: Number(form.lowStockAlert),
      category: form.category,
    };
    try {
      if (editingProduct) {
        await productsApi.update(editingProduct._id, payload);
        showNotification('Product updated successfully.');
      } else {
        await productsApi.create(payload);
        showNotification('Product created successfully.');
      }
      closeModal();
      fetchProducts();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'An error occurred.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await productsApi.delete(deleteConfirm._id);
      showNotification('Product deleted.');
      setDeleteConfirm(null);
      fetchProducts();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete product.');
    } finally {
      setDeleting(false);
    }
  }

  function showNotification(msg: string) {
    setNotification(msg);
    setTimeout(() => setNotification(''), 3000);
  }

  const lowStockCount = products.filter((p) => p.isLowStock).length;

  return (
    <ProtectedRoute>
    <AppLayout>
      {notification && (
        <div className="fixed left-4 right-4 top-4 z-50 max-w-md rounded-lg bg-green-600 px-5 py-3 text-sm font-medium text-white shadow-lg sm:left-auto sm:right-4">
          {notification}
        </div>
      )}

      {/* Modal */}
      <Dialog
        open={showModal}
        onOpenChange={(open) => { if (!open) closeModal(); }}
        title={editingProduct ? 'Edit Product' : 'Add Product'}
      >
            <form onSubmit={handleSubmit} className="space-y-4 p-6">
              {formError && (
                <div className="bg-red-50 text-red-700 px-4 py-2 rounded-lg text-sm">{formError}</div>
              )}
              <Input label="Product Name" name="name" value={form.name} onChange={handleChange} required placeholder="e.g. Wireless Mouse" />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input label="SKU" name="sku" value={form.sku} onChange={handleChange} required placeholder="e.g. WM-001" />
                <Input label="Category" name="category" value={form.category} onChange={handleChange} placeholder="e.g. Electronics" />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Input label="Quantity" name="quantity" type="number" value={form.quantity} onChange={handleChange} />
                <Input label="Price (EGP)" name="price" type="number" value={form.price} onChange={handleChange} />
                <Input label="Low Stock Alert" name="lowStockAlert" type="number" value={form.lowStockAlert} onChange={handleChange} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">Description</label>
                <Textarea
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Optional product description..."
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="secondary" onClick={closeModal} disabled={submitting}>Cancel</Button>
                <Button type="submit" variant="primary" disabled={submitting}>
                  {submitting ? 'Saving...' : editingProduct ? 'Update' : 'Create'}
                </Button>
              </div>
            </form>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog
        open={Boolean(deleteConfirm)}
        onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}
        title="Delete Product"
        size="sm"
      >
          <div className="space-y-4 p-6">
            <p className="text-sm text-gray-600 mb-6">
              Are you sure you want to delete <span className="font-semibold">{deleteConfirm?.name}</span>? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setDeleteConfirm(null)} disabled={deleting}>Cancel</Button>
              <Button variant="danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          </div>
      </Dialog>

      <div className="space-y-6">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
            <p className="text-sm text-gray-500 mt-1">Track and manage your product stock</p>
          </div>
          <Button onClick={openAddModal} variant="primary">
            <span>+</span> Add Product
          </Button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Products</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{products.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Low Stock Items</p>
            <p className={`text-3xl font-bold mt-1 ${lowStockCount > 0 ? 'text-red-600' : 'text-gray-900'}`}>{lowStockCount}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Stock Value</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">
              {formatCurrency(products.reduce((s, p) => s + p.price * p.quantity, 0))}
            </p>
          </div>
        </div>

        <Card>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="flex-1">
              <Input
                placeholder="Search products by name, SKU, or category..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <div
                onClick={() => setShowLowStock((v) => !v)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${showLowStock ? 'bg-red-500' : 'bg-gray-200'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${showLowStock ? 'translate-x-6' : 'translate-x-1'}`} />
              </div>
              <span className="text-sm text-gray-700 font-medium">Low Stock Only</span>
            </label>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />)}
            </div>
          ) : error ? (
            <div className="text-center py-10">
              <p className="text-red-500 text-sm mb-3">{error}</p>
              <Button variant="secondary" onClick={fetchProducts} size="sm">Retry</Button>
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-4xl mb-3">📦</div>
              <p className="text-gray-500 text-sm">
                {search || showLowStock ? 'No products match your filters.' : 'No products yet. Add your first product!'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide pb-3">Name</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide pb-3">SKU</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide pb-3">Category</th>
                    <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide pb-3">Qty</th>
                    <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide pb-3">Price</th>
                    <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide pb-3">Alert</th>
                    <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wide pb-3">Status</th>
                    <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide pb-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {products.map((product) => (
                    <tr key={product._id} className={`hover:bg-gray-50 transition-colors ${product.isLowStock ? 'bg-red-50/30' : ''}`}>
                      <td className="py-3 pr-4">
                        <div className="font-medium text-gray-900 text-sm">{product.name}</div>
                        {product.description && (
                          <div className="text-xs text-gray-400 mt-0.5 truncate max-w-[200px]">{product.description}</div>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-sm font-mono text-gray-600">{product.sku}</td>
                      <td className="py-3 pr-4 text-sm text-gray-600">{product.category || '—'}</td>
                      <td className={`py-3 pr-4 text-sm text-right font-semibold ${product.isLowStock ? 'text-red-600' : 'text-gray-900'}`}>
                        {product.quantity}
                      </td>
                      <td className="py-3 pr-4 text-sm text-right text-gray-900">{formatCurrency(product.price)}</td>
                      <td className="py-3 pr-4 text-sm text-right text-gray-500">{product.lowStockAlert}</td>
                      <td className="py-3 pr-4 text-center">
                        {product.isLowStock ? (
                          <Badge label="Low Stock" variant="danger" />
                        ) : (
                          <Badge label="In Stock" variant="success" />
                        )}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="ghost" onClick={() => openEditModal(product)}>Edit</Button>
                          <DeleteIconButton label={`Delete ${product.name}`} onClick={() => setDeleteConfirm(product)} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </AppLayout>
    </ProtectedRoute>
  );
}
