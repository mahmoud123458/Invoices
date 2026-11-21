'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/layout/AppLayout';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import Card from '@/components/ui/Card';
import InvoiceActivityChart from '@/components/dashboard/InvoiceActivityChart';
import { getInvoiceStatusBadge } from '@/components/ui/Badge';
import { useAuth } from '@/context/AuthContext';
import {
  clientsApi,
  invoicesApi,
  productsApi,
  purchaseOrdersApi,
  shippingApi,
} from '@/lib/api';
import {
  ApiResponse,
  Client,
  Invoice,
  Product,
  PurchaseOrder,
  ShippingCompany,
} from '@/types';

interface DashboardData {
  invoices: Invoice[];
  clientsCount: number;
  products: Product[];
  purchaseOrders: PurchaseOrder[];
  shippingCompanies: ShippingCompany[];
}

const initialData: DashboardData = {
  invoices: [],
  clientsCount: 0,
  products: [],
  purchaseOrders: [],
  shippingCompanies: [],
};

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'EGP',
  maximumFractionDigits: 2,
});

function money(value: number): string {
  return currency.format(value || 0);
}

function invoiceClientName(client: Invoice['client']): string {
  return typeof client === 'object' && client !== null ? client.name : 'Client';
}

function SectionTitle({ title, href, linkLabel }: { title: string; href: string; linkLabel?: string }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-base font-semibold tracking-tight text-gray-800">{title}</h2>
      <Link href={href} className="text-xs font-medium text-blue-600 hover:text-blue-700">
        {linkLabel ?? `View ${title.toLowerCase()}`}
      </Link>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  accent,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  accent: string;
  icon: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">{value}</p>
        </div>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${accent}`}>
          {icon}
        </span>
      </div>
      <p className="mt-3 text-xs text-gray-500">{detail}</p>
    </div>
  );
}

function ProgressRow({
  label,
  value,
  total,
  color,
  formattedValue,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
  formattedValue?: string;
}) {
  const percentage = total > 0 ? Math.min((value / total) * 100, 100) : 0;
  const strokeColor: Record<string, string> = {
    'bg-emerald-500': 'stroke-emerald-500',
    'bg-blue-500': 'stroke-blue-500',
    'bg-amber-400': 'stroke-amber-400',
    'bg-gray-300': 'stroke-gray-300',
  };

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-sm text-gray-600">{label}</p>
        <p className="mt-1 text-xs font-medium tabular-nums text-gray-800">{formattedValue ?? value}</p>
      </div>
      <div className="relative h-12 w-12 shrink-0" role="img" aria-label={`${label}: ${percentage.toFixed(0)}%`}>
        <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
          <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3.5" className="stroke-gray-100" />
          <circle
            cx="18"
            cy="18"
            r="15.5"
            fill="none"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray={`${percentage} 100`}
            className={strokeColor[color] || 'stroke-blue-500'}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold tabular-nums text-gray-700">
          {percentage.toFixed(0)}%
        </span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      try {
        const [invoicesRes, clientsRes, productsRes, purchaseOrdersRes, shippingRes] = await Promise.all([
            invoicesApi.getAll() as Promise<ApiResponse<Invoice[]>>,
            clientsApi.getAll() as Promise<ApiResponse<Client[]>>,
            productsApi.getAll() as Promise<ApiResponse<Product[]>>,
            purchaseOrdersApi.getAll() as Promise<ApiResponse<PurchaseOrder[]>>,
            shippingApi.getAll() as Promise<ApiResponse<ShippingCompany[]>>,
          ]);

        if (!active) return;
        setData({
          invoices: invoicesRes.data || [],
          clientsCount: clientsRes.count ?? clientsRes.data?.length ?? 0,
          products: productsRes.data || [],
          purchaseOrders: purchaseOrdersRes.data || [],
          shippingCompanies: shippingRes.data || [],
        });
        setError('');
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load dashboard data.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadDashboard();
    return () => {
      active = false;
    };
  }, []);

  const metrics = useMemo(() => {
    const activeInvoices = data.invoices.filter((invoice) => invoice.status !== 'cancelled');
    const paidAmount = (invoice: Invoice) =>
      invoice.paidAmount ?? (invoice.status === 'paid' ? invoice.total : 0);
    const overdueInvoices = data.invoices.filter((invoice) =>
      invoice.status === 'sent' && invoice.dueDate && new Date(invoice.dueDate) < new Date()
      && invoice.total > paidAmount(invoice)
    );
    const statusCounts = {
      paid: data.invoices.filter((invoice) => invoice.status === 'paid').length,
      sent: data.invoices.filter((invoice) => invoice.status === 'sent').length,
      draft: data.invoices.filter((invoice) => invoice.status === 'draft').length,
      cancelled: data.invoices.filter((invoice) => invoice.status === 'cancelled').length,
    };
    const totalInvoiced = activeInvoices.reduce((sum, invoice) => sum + invoice.total, 0);
    const collected = activeInvoices.reduce((sum, invoice) => sum + paidAmount(invoice), 0);
    const outstanding = activeInvoices.reduce((sum, invoice) => sum + Math.max(0, invoice.total - paidAmount(invoice)), 0);
    const overdueAmount = overdueInvoices.reduce((sum, invoice) => sum + Math.max(0, invoice.total - paidAmount(invoice)), 0);
    const lowStock = data.products.filter((product) => product.isLowStock || product.quantity <= product.lowStockAlert);
    const outOfStock = data.products.filter((product) => product.quantity === 0);
    const inventoryUnits = data.products.reduce((sum, product) => sum + product.quantity, 0);
    const inventoryRetailValue = data.products.reduce((sum, product) => sum + product.quantity * product.price, 0);
    const pendingPurchaseOrders = data.purchaseOrders.filter((order) => order.status === 'pending');
    const shippedInvoices = data.invoices.filter((invoice) => invoice.shippingStatus);
    const deliveredShipments = shippedInvoices.filter((invoice) => invoice.shippingStatus === 'delivered').length;
    const clientsByTotal = new Map<string, { name: string; count: number; total: number }>();

    activeInvoices.forEach((invoice) => {
      const key = typeof invoice.client === 'object' && invoice.client !== null
        ? invoice.client._id
        : invoice.client;
      const current = clientsByTotal.get(key) || { name: invoiceClientName(invoice.client), count: 0, total: 0 };
      current.count += 1;
      current.total += invoice.total;
      clientsByTotal.set(key, current);
    });

    return {
      activeInvoices,
      collected,
      totalInvoiced,
      outstanding,
      overdueInvoices,
      overdueAmount,
      statusCounts,
      averageInvoice: activeInvoices.length ? totalInvoiced / activeInvoices.length : 0,
      collectionRate: totalInvoiced ? (collected / totalInvoiced) * 100 : 0,
      lowStock,
      outOfStock,
      inventoryUnits,
      inventoryRetailValue,
      pendingPurchaseOrders,
      shippedInvoices,
      deliveredShipments,
      topClients: [...clientsByTotal.values()].sort((a, b) => b.total - a.total).slice(0, 5),
    };
  }, [data]);

  const statusRows = [
    { label: 'Paid', value: metrics.statusCounts.paid, color: 'bg-emerald-500' },
    { label: 'Sent', value: metrics.statusCounts.sent, color: 'bg-blue-500' },
    { label: 'Draft', value: metrics.statusCounts.draft, color: 'bg-amber-400' },
    { label: 'Cancelled', value: metrics.statusCounts.cancelled, color: 'bg-gray-300' },
  ];

  const recentInvoices = [...data.invoices]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6);

  const quickActions = [
    { href: '/invoices/new', label: 'Create invoice', visible: true },
    { href: '/clients/new', label: 'Add client', visible: true },
    { href: '/inventory/new', label: 'Add product', visible: user?.role === 'admin' },
    { href: '/purchase-orders/new', label: 'New purchase order', visible: true },
  ].filter((action) => action.visible);

  return (
    <ProtectedRoute>
    <AppLayout>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-sm font-medium text-blue-600">Good to see you, {user?.name?.split(' ')[0] || 'there'}</p>
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Business overview</h1>
          <p className="mt-1 text-sm text-gray-500">A live snapshot of your invoicing and operations.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className={`rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
                action.href === '/invoices/new'
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/15 hover:bg-blue-700'
                  : 'border border-gray-200 bg-white text-gray-700 hover:border-blue-200 hover:text-blue-700'
              }`}
            >
              {action.label}
            </Link>
          ))}
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>Dashboard data could not be refreshed: {error}</span>
          <button type="button" className="font-semibold underline" onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        <MetricCard
          label="Total invoiced"
          value={loading ? '—' : money(metrics.totalInvoiced)}
          detail={`${metrics.activeInvoices.length} active invoices`}
          accent="bg-blue-50 text-blue-600"
          icon="INV"
        />
        <MetricCard
          label="Collected"
          value={loading ? '—' : money(metrics.collected)}
          detail={`${metrics.collectionRate.toFixed(0)}% collection rate`}
          accent="bg-emerald-50 text-emerald-600"
          icon="IN"
        />
        <MetricCard
          label="Outstanding"
          value={loading ? '—' : money(metrics.outstanding)}
          detail={`${data.invoices.filter((invoice) => invoice.status === 'sent' || invoice.status === 'draft').length} awaiting payment`}
          accent="bg-amber-50 text-amber-600"
          icon="DUE"
        />
        <MetricCard
          label="Overdue"
          value={loading ? '—' : money(metrics.overdueAmount)}
          detail={`${metrics.overdueInvoices.length} sent invoices past due`}
          accent="bg-rose-50 text-rose-600"
          icon="LATE"
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Clients', value: data.clientsCount, href: '/clients' },
          { label: 'Average invoice', value: money(metrics.averageInvoice), href: '/invoices' },
          { label: 'Products', value: data.products.length, href: '/inventory' },
          { label: 'Shipping partners', value: data.shippingCompanies.length, href: '/shipping' },
        ].map((item) => (
          <Link key={item.label} href={item.href} className="rounded-xl border border-gray-100 bg-white px-4 py-3 transition-colors hover:border-blue-200">
            <p className="text-xs text-gray-600">{item.label}</p>
            <p className="mt-1 text-lg font-semibold text-gray-800">{loading ? '—' : item.value}</p>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 2xl:grid-cols-3">
        <div className="2xl:col-span-2">
          <InvoiceActivityChart invoices={data.invoices} loading={loading} />
        </div>
        <Card className="mt-6" title="Invoice status">
          <div className="space-y-5">
            {statusRows.map((row) => (
              <ProgressRow
                key={row.label}
                label={row.label}
                value={row.value}
                total={data.invoices.length}
                color={row.color}
              />
            ))}
            <div className="border-t border-gray-100 pt-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Average invoice value</span>
                <span className="font-semibold text-gray-800">{loading ? '—' : money(metrics.averageInvoice)}</span>
              </div>
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-gray-500">Collection rate</span>
                <span className="font-semibold text-gray-800">{loading ? '—' : `${metrics.collectionRate.toFixed(1)}%`}</span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <section className="xl:col-span-2">
          <SectionTitle title="Recent invoices" href="/invoices" />
          <div className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm">
            {loading ? (
              <div className="space-y-3 p-5">{[1, 2, 3].map((item) => <div key={item} className="h-10 animate-pulse rounded-lg bg-gray-50" />)}</div>
            ) : recentInvoices.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-gray-500">No invoices to show yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead>
                    <tr>
                      <th className="px-5 py-3">Invoice</th>
                      <th className="px-5 py-3">Client</th>
                      <th className="px-5 py-3">Date</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentInvoices.map((invoice) => {
                      const badge = getInvoiceStatusBadge(invoice.status);
                      return (
                        <tr key={invoice._id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/70">
                          <td className="px-5 py-3.5">
                            <Link href={`/invoices/${invoice._id}`} className="font-medium text-blue-700 hover:text-blue-800">
                              {invoice.invoiceNumber}
                            </Link>
                          </td>
                          <td className="max-w-40 truncate px-5 py-3.5 text-gray-600">{invoiceClientName(invoice.client)}</td>
                          <td className="whitespace-nowrap px-5 py-3.5 text-gray-500">
                            {new Date(invoice.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                              badge.variant === 'success' ? 'bg-emerald-50 text-emerald-700' :
                              badge.variant === 'info' ? 'bg-blue-50 text-blue-700' :
                              badge.variant === 'danger' ? 'bg-rose-50 text-rose-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {badge.label}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-5 py-3.5 text-right font-semibold text-gray-800">{money(invoice.total)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <section>
          <SectionTitle title="Top clients" href="/clients" />
          <div className="rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm">
            {loading ? (
              <div className="space-y-4">{[1, 2, 3].map((item) => <div key={item} className="h-9 animate-pulse rounded-lg bg-gray-50" />)}</div>
            ) : metrics.topClients.length === 0 ? (
              <p className="py-5 text-center text-sm text-gray-500">Client totals will appear after invoices are created.</p>
            ) : (
              <div className="space-y-4">
                {                metrics.topClients.map((client, index) => {
                  return (
                    <div key={`${client.name}-${index}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-800">{client.name}</p>
                          <p className="text-xs text-gray-500">{client.count} invoice{client.count === 1 ? '' : 's'}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <span className="whitespace-nowrap text-sm font-semibold text-gray-700">{money(client.total)}</span>
                          <div className="relative h-10 w-10" role="img" aria-label={`${client.name}: ${metrics.totalInvoiced ? ((client.total / metrics.totalInvoiced) * 100).toFixed(0) : 0}% of invoiced revenue`}>
                            <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                              <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3.5" className="stroke-gray-100" />
                              <circle
                                cx="18"
                                cy="18"
                                r="15.5"
                                fill="none"
                                strokeWidth="3.5"
                                strokeLinecap="round"
                                strokeDasharray={`${metrics.totalInvoiced ? Math.min((client.total / metrics.totalInvoiced) * 100, 100) : 0} 100`}
                                className="stroke-blue-500"
                              />
                            </svg>
                            <span className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold tabular-nums text-gray-600">
                              {metrics.totalInvoiced ? ((client.total / metrics.totalInvoiced) * 100).toFixed(0) : 0}%
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2 2xl:grid-cols-3">
        <Card title="Inventory health" action={<Link href="/inventory" className="text-xs font-medium text-blue-600">Inventory</Link>}>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Products</p>
              <p className="mt-1 text-xl font-semibold text-gray-800">{loading ? '—' : data.products.length}</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Units in stock</p>
              <p className="mt-1 text-xl font-semibold text-gray-800">{loading ? '—' : metrics.inventoryUnits.toLocaleString()}</p>
            </div>
            <div className="rounded-xl bg-amber-50 p-3">
              <p className="text-xs text-amber-700">Low stock</p>
              <p className="mt-1 text-xl font-semibold text-amber-800">{loading ? '—' : metrics.lowStock.length}</p>
            </div>
            <div className="rounded-xl bg-rose-50 p-3">
              <p className="text-xs text-rose-700">Out of stock</p>
              <p className="mt-1 text-xl font-semibold text-rose-800">{loading ? '—' : metrics.outOfStock.length}</p>
            </div>
          </div>
          <p className="mt-4 text-xs text-gray-500">
            Estimated stock value at selling prices: <span className="font-semibold text-gray-600">{loading ? '—' : money(metrics.inventoryRetailValue)}</span>
          </p>
          {metrics.lowStock.length > 0 && !loading && (
            <div className="mt-4 border-t border-gray-100 pt-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">Needs attention</p>
              <div className="space-y-2">
                {metrics.lowStock.slice(0, 4).map((product) => (
                  <div key={product._id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate text-gray-600">{product.name}</span>
                    <span className={`whitespace-nowrap font-medium ${product.quantity === 0 ? 'text-rose-600' : 'text-amber-600'}`}>
                      {product.quantity} left
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card title="Orders overview" action={<Link href="/purchase-orders" className="text-xs font-medium text-blue-600">Purchase orders</Link>}>
          <div className="space-y-4">
            <ProgressRow
              label="Pending purchase orders"
              value={metrics.pendingPurchaseOrders.length}
              total={data.purchaseOrders.length}
              color="bg-amber-400"
              formattedValue={`${metrics.pendingPurchaseOrders.length} / ${data.purchaseOrders.length}`}
            />
            <ProgressRow
              label="Approved purchase orders"
              value={data.purchaseOrders.filter((order) => order.status === 'approved').length}
              total={data.purchaseOrders.length}
              color="bg-emerald-500"
            />
            <ProgressRow
              label="Received purchase orders"
              value={data.purchaseOrders.filter((order) => order.status === 'received').length}
              total={data.purchaseOrders.length}
              color="bg-blue-500"
            />
          </div>
        </Card>

        <Card title="Shipping performance" action={<Link href="/shipping" className="text-xs font-medium text-blue-600">Shipping</Link>}>
          <div className="space-y-5">
            <ProgressRow
              label="Delivered"
              value={metrics.deliveredShipments}
              total={metrics.shippedInvoices.length}
              color="bg-emerald-500"
              formattedValue={`${metrics.deliveredShipments} / ${metrics.shippedInvoices.length}`}
            />
            <ProgressRow
              label="In transit"
              value={data.invoices.filter((invoice) => invoice.shippingStatus === 'shipped').length}
              total={metrics.shippedInvoices.length}
              color="bg-blue-500"
            />
            <ProgressRow
              label="Awaiting dispatch"
              value={data.invoices.filter((invoice) => invoice.shippingStatus === 'pending').length}
              total={metrics.shippedInvoices.length}
              color="bg-amber-400"
            />
            <p className="border-t border-gray-100 pt-3 text-xs text-gray-500">
              {loading ? '—' : data.shippingCompanies.length} active shipping partner{data.shippingCompanies.length === 1 ? '' : 's'}
            </p>
          </div>
        </Card>
      </div>
    </AppLayout>
    </ProtectedRoute>
  );
}
