'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/layout/AppLayout';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge, { getPurchaseOrderStatusBadge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Input';
import { purchaseOrdersApi } from '@/lib/api';
import { PurchaseOrder } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { formatCurrency } from '@/lib/format';
import { Dialog } from '@/components/shadcn/dialog';

export default function PurchaseOrdersPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [error, setError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Selected Order Detail Modal
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = (await purchaseOrdersApi.getAll(statusFilter || undefined)) as {
        success: boolean;
        data: PurchaseOrder[];
      };
      setOrders(res.data || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load purchase orders');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  async function handleApprove(id: string) {
    if (!confirm('Are you sure you want to approve this order? Quantities will be added to the inventory immediately.')) {
      return;
    }

    setProcessingId(id);
    setActionSuccess('');
    setError('');

    try {
      await purchaseOrdersApi.approve(id);
      setActionSuccess('✅ Purchase order approved! Quantities added to inventory.');
      fetchOrders();
    } catch (err: any) {
      setError(err.message || 'Failed to approve purchase order');
    } finally {
      setProcessingId(null);
    }
  }

  async function handleReject(id: string) {
    if (!confirm('Are you sure you want to reject this purchase order?')) return;

    setProcessingId(id);
    setActionSuccess('');
    setError('');

    try {
      await purchaseOrdersApi.reject(id);
      setActionSuccess('Order marked as rejected.');
      fetchOrders();
    } catch (err: any) {
      setError(err.message || 'Failed to reject purchase order');
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <ProtectedRoute>
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Purchase Orders</h1>
            <p className="text-gray-500 text-sm mt-1">
              Procure products, track supplier requests, and auto-update inventory on approval
            </p>
          </div>
          <Link href="/purchase-orders/new">
            <Button>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Purchase Order
            </Button>
          </Link>
        </div>

        {/* Notifications */}
        {actionSuccess && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm flex justify-between items-center">
            <span>{actionSuccess}</span>
            <button onClick={() => setActionSuccess('')} className="text-green-700 font-bold ml-2">
              ✕
            </button>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm flex justify-between items-center">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-red-600 font-bold ml-2">
              ✕
            </button>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-4">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: 'pending', label: 'Pending Approval' },
              { value: 'approved', label: 'Approved (Added to Stock)' },
              { value: 'rejected', label: 'Rejected' },
              { value: 'received', label: 'Received' },
            ]}
            placeholder="All Order Statuses"
            className="w-56"
          />
        </div>

        {/* Orders Table */}
        <Card>
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-16">
              <span className="text-5xl">🛒</span>
              <p className="mt-3 text-gray-500">No purchase orders found</p>
              <Link href="/purchase-orders/new">
                <Button className="mt-4">Create First Purchase Order</Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-3 px-4 font-semibold text-gray-600">PO Number</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600">Supplier</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600">Items Count</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600">Total</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600">Status</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600">Date</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {orders.map((po) => {
                    const badge = getPurchaseOrderStatusBadge(po.status);
                    const isPending = po.status === 'pending';
                    const isProcessing = processingId === po._id;

                    return (
                      <tr key={po._id} className="hover:bg-gray-50 transition-colors">
                        <td className="py-3 px-4 font-semibold text-blue-600">
                          <button
                            onClick={() => setSelectedOrder(po)}
                            className="hover:underline text-left"
                          >
                            {po.orderNumber}
                          </button>
                        </td>
                        <td className="py-3 px-4 font-medium text-gray-900">{po.supplier}</td>
                        <td className="py-3 px-4 text-gray-600">
                          {po.items.reduce((s, it) => s + it.quantity, 0)} units ({po.items.length} items)
                        </td>
                        <td className="py-3 px-4 font-bold text-gray-900">{formatCurrency(po.total)}</td>
                        <td className="py-3 px-4">
                          <Badge label={badge.label} variant={badge.variant} />
                        </td>
                        <td className="py-3 px-4 text-gray-500">
                          {new Date(po.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setSelectedOrder(po)}
                            >
                              Details
                            </Button>

                            {isPending && user?.role === 'admin' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="success"
                                  disabled={isProcessing}
                                  onClick={() => handleApprove(po._id)}
                                >
                                  {isProcessing ? '...' : 'Approve'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="danger"
                                  disabled={isProcessing}
                                  onClick={() => handleReject(po._id)}
                                >
                                  Reject
                                </Button>
                              </>
                            )}

                            {isPending && user?.role !== 'admin' && (
                              <span className="text-xs text-yellow-600 font-medium px-2 py-1 bg-yellow-50 rounded">
                                Awaiting Admin
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Modal: Purchase Order Details */}
        <Dialog
          open={Boolean(selectedOrder)}
          onOpenChange={(open) => { if (!open) setSelectedOrder(null); }}
          title={selectedOrder?.orderNumber || 'Purchase order details'}
          description={selectedOrder ? `Supplier: ${selectedOrder.supplier}` : undefined}
          size="lg"
        >
          {selectedOrder && <div className="p-6">
              <div className="mb-4 flex justify-end">
                <Badge
                  label={getPurchaseOrderStatusBadge(selectedOrder.status).label}
                  variant={getPurchaseOrderStatusBadge(selectedOrder.status).variant}
                />
              </div>
              {selectedOrder.supplierContact && (
                <p className="text-xs text-gray-500 mb-4">Contact: {selectedOrder.supplierContact}</p>
              )}

              {/* Items Table */}
              <div className="mb-4 overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full min-w-[480px] text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left py-2 px-3">Item</th>
                      <th className="text-center py-2 px-3">Qty</th>
                      <th className="text-right py-2 px-3">Unit Price</th>
                      <th className="text-right py-2 px-3">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {selectedOrder.items.map((item, idx) => (
                      <tr key={idx}>
                        <td className="py-2 px-3 font-medium text-gray-800">{item.productName}</td>
                        <td className="py-2 px-3 text-center text-gray-600">{item.quantity}</td>
                        <td className="py-2 px-3 text-right text-gray-600">{formatCurrency(item.unitPrice)}</td>
                        <td className="py-2 px-3 text-right font-semibold text-gray-900">{formatCurrency(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 font-bold text-gray-900">
                      <td colSpan={3} className="py-2.5 px-3 text-right">Grand Total:</td>
                      <td className="py-2.5 px-3 text-right text-blue-600">{formatCurrency(selectedOrder.total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {selectedOrder.notes && (
                <div className="bg-gray-50 p-3 rounded-lg text-xs text-gray-600 mb-4">
                  <span className="font-semibold block mb-0.5">Notes:</span>
                  {selectedOrder.notes}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                {selectedOrder.status === 'pending' && user?.role === 'admin' && (
                  <Button
                    variant="success"
                    onClick={() => {
                      const id = selectedOrder._id;
                      setSelectedOrder(null);
                      handleApprove(id);
                    }}
                  >
                    Approve Order & Update Stock
                  </Button>
                )}
                <Button variant="secondary" onClick={() => setSelectedOrder(null)}>
                  Close
                </Button>
              </div>
          </div>}
        </Dialog>
      </div>
    </AppLayout>
    </ProtectedRoute>
  );
}
