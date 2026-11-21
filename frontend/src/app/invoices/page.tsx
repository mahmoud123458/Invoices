'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/layout/AppLayout';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import DeleteIconButton from '@/components/ui/DeleteIconButton';
import Badge, { getInvoiceStatusBadge, getShippingStatusBadge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Input';
import { invoicesApi } from '@/lib/api';
import { ApiResponse, Invoice, Client } from '@/types';
import { formatCurrency } from '@/lib/format';

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      setLoading(true);
      try {
        const res = await invoicesApi.getAll(statusFilter ? { status: statusFilter } : {}) as ApiResponse<Invoice[]>;
        if (active) setInvoices(res.data || []);
      } catch (err) {
        console.error(err);
      } finally {
        if (active) setLoading(false);
      }
    });
    return () => { active = false; };
  }, [statusFilter]);

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this invoice?')) return;
    try {
      await invoicesApi.delete(id);
      setInvoices((prev) => prev.filter((inv) => inv._id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  const getClientName = (client: string | Client) =>
    typeof client === 'object' ? client.name : client;

  return (
    <ProtectedRoute>
    <AppLayout>
      <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
          <p className="text-gray-500 text-sm mt-1">Manage and track all your invoices</p>
        </div>
        <Link href="/invoices/new" className="block w-full sm:inline-block sm:w-auto">
          <Button className="w-full sm:w-auto">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Invoice
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5">
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: 'draft', label: 'Draft' },
            { value: 'sent', label: 'Sent' },
            { value: 'paid', label: 'Paid' },
            { value: 'cancelled', label: 'Cancelled' },
          ]}
          placeholder="All Statuses"
          className="w-48"
        />
      </div>

      <Card>
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : invoices.length === 0 ? (
          <div className="text-center py-16">
            <span className="text-5xl">🧾</span>
            <p className="mt-3 text-gray-500">No invoices found</p>
            <Link href="/invoices/new">
              <Button className="mt-4">Create First Invoice</Button>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-3 px-4 font-semibold text-gray-600">Invoice #</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600">Client</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600">Total</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600">Status</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600">Shipping</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600">Date</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {invoices.map((invoice) => {
                  const statusBadge = getInvoiceStatusBadge(invoice.status);
                  const shippingBadge = invoice.shippingStatus
                    ? getShippingStatusBadge(invoice.shippingStatus)
                    : null;
                  return (
                    <tr key={invoice._id} className="hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-4 font-medium text-blue-600">
                        {invoice.invoiceNumber}
                      </td>
                      <td className="py-3 px-4 text-gray-800">{getClientName(invoice.client)}</td>
                      <td className="py-3 px-4 font-semibold text-gray-900">
                        {formatCurrency(invoice.total)}
                      </td>
                      <td className="py-3 px-4">
                        <Badge label={statusBadge.label} variant={statusBadge.variant} />
                      </td>
                      <td className="py-3 px-4">
                        {shippingBadge ? (
                          <Badge label={shippingBadge.label} variant={shippingBadge.variant} />
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-gray-500">
                        {new Date(invoice.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <Link href={`/invoices/${invoice._id}`}>
                            <Button variant="ghost" size="sm">View</Button>
                          </Link>
                          <Link href={`/invoices/${invoice._id}/edit`}>
                            <Button variant="secondary" size="sm">Edit</Button>
                          </Link>
                          <DeleteIconButton
                            label={`Delete invoice ${invoice.invoiceNumber}`}
                            onClick={() => void handleDelete(invoice._id)}
                          />
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
    </AppLayout>
    </ProtectedRoute>
  );
}
