'use client';

export const runtime = 'edge';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge, { getInvoiceStatusBadge, getShippingStatusBadge } from '@/components/ui/Badge';
import { invoicesApi } from '@/lib/api';
import { Invoice, Client, ShippingCompany, ApiResponse } from '@/types';
import { formatCurrency } from '@/lib/format';
import { Input as ShadcnInput } from '@/components/shadcn/input';
import { Select as ShadcnSelect } from '@/components/shadcn/select';

export default function InvoiceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');

  useEffect(() => {
    async function loadInvoice() {
      try {
        const res = (await invoicesApi.getOne(id)) as { success: boolean; data: Invoice };
        setInvoice(res.data);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load invoice');
      } finally {
        setLoading(false);
      }
    }
    loadInvoice();
  }, [id]);

  const client = invoice?.client as Client | undefined;
  const shippingCompany = invoice?.shippingCompany as ShippingCompany | undefined;

  function handlePrint() {
    window.print();
  }

  async function handleRecordPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!invoice) return;
    setRecordingPayment(true);
    setError('');
    try {
      const response = await invoicesApi.addPayment(invoice._id, {
        amount: Number(paymentAmount),
        date: paymentDate,
        method: paymentMethod,
        reference: paymentReference,
        notes: paymentNotes,
      }) as ApiResponse<Invoice>;
      setInvoice(response.data);
      setPaymentAmount('');
      setPaymentReference('');
      setPaymentNotes('');
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : 'Unable to record payment');
    } finally {
      setRecordingPayment(false);
    }
  }

  return (
    <ProtectedRoute>
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Actions bar (hidden during print) */}
        <div className="print:hidden flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button className="w-full sm:w-auto" variant="secondary" onClick={() => router.push('/invoices')}>
            ← Back to Invoices
          </Button>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="w-full sm:w-auto" variant="secondary" onClick={handlePrint}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print / Save PDF
            </Button>
            <Link href="/invoices/new" className="block w-full sm:inline-block sm:w-auto">
              <Button className="w-full sm:w-auto">New Invoice</Button>
            </Link>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <Card>
            <div className="space-y-4 animate-pulse p-6">
              <div className="h-8 bg-gray-200 rounded w-1/3 mb-6" />
              <div className="h-4 bg-gray-100 rounded w-1/2" />
              <div className="h-4 bg-gray-100 rounded w-1/4" />
              <div className="h-32 bg-gray-100 rounded mt-8" />
            </div>
          </Card>
        ) : !invoice ? (
          <Card>
            <div className="text-center py-12 text-gray-500">Invoice not found.</div>
          </Card>
        ) : (
          <div className="rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm sm:p-8 print:border-none print:shadow-none print:p-0">
            {/* Invoice Header */}
            <div className="flex flex-col items-start justify-between gap-4 border-b border-gray-100 pb-8 sm:flex-row">
              <div>
                <span className="text-xs uppercase font-bold tracking-wider text-blue-600 block mb-1">
                  Tax Invoice
                </span>
                <h1 className="text-3xl font-extrabold text-gray-900">{invoice.invoiceNumber}</h1>
                <p className="text-xs text-gray-400 mt-1">
                  Issued on: {new Date(invoice.createdAt).toLocaleDateString()}
                </p>
                {invoice.dueDate && (
                  <p className="text-xs text-red-500 mt-0.5">
                    Due date: {new Date(invoice.dueDate).toLocaleDateString()}
                  </p>
                )}
              </div>

              <div className="text-right flex flex-col items-end gap-2">
                <Badge
                  label={getInvoiceStatusBadge(invoice.status).label}
                  variant={getInvoiceStatusBadge(invoice.status).variant}
                />
                {invoice.shippingStatus && (
                  <Badge
                    label={`Shipping: ${getShippingStatusBadge(invoice.shippingStatus).label}`}
                    variant={getShippingStatusBadge(invoice.shippingStatus).variant}
                  />
                )}
              </div>
            </div>

            {/* Client & Shipping Details */}
            <div className="grid grid-cols-1 gap-6 border-b border-gray-100 py-8 text-sm sm:grid-cols-2 sm:gap-8">
              <div>
                <h3 className="text-xs uppercase tracking-wider font-semibold text-gray-400 mb-2">
                  Billed To
                </h3>
                <p className="font-bold text-gray-900 text-base">{client?.name || 'Walk-in Client'}</p>
                {client?.company && <p className="text-gray-600">{client.company}</p>}
                {client?.phone && <p className="text-gray-600">Phone: {client.phone}</p>}
                {client?.email && <p className="text-gray-600">Email: {client.email}</p>}
                {client?.address && <p className="text-gray-600 mt-1">{client.address}</p>}
              </div>

              <div className="text-left sm:text-right">
                <h3 className="text-xs uppercase tracking-wider font-semibold text-gray-400 mb-2">
                  Delivery Partner
                </h3>
                {shippingCompany ? (
                  <>
                    <p className="font-bold text-gray-900 text-base">{shippingCompany.name}</p>
                    <p className="text-gray-600">Contact: {shippingCompany.phone}</p>
                    <p className="text-gray-500 text-xs mt-1">
                      Estimated Duration: ~{shippingCompany.avgDeliveryDays} Days
                    </p>
                  </>
                ) : (
                  <p className="text-gray-500 italic">Self pickup / Not assigned</p>
                )}
                {invoice.deliveredAt && (
                  <p className="mt-2 text-gray-600">Delivered: {new Date(invoice.deliveredAt).toLocaleDateString()}</p>
                )}
              </div>
            </div>

            {/* Line Items */}
            <div className="overflow-x-auto py-6">
              <table className="w-full min-w-[520px] text-sm">
                <thead >
                  <tr className="border-b  border-gray-200  text-gray-600 text-xs uppercase tracking-wider">
                    <th className="text-left p-2">Item Description</th>
                    <th className="text-center p-2">Qty</th>
                    <th className="text-right p-2">Unit Price</th>
                    <th className="text-right p-2">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {invoice.items.map((item, idx) => (
                    <tr key={idx}>
                      <td className="py-3.5 font-medium text-gray-900">{item.productName}</td>
                      <td className="py-3.5 text-center text-gray-600">{item.quantity}</td>
                      <td className="py-3.5 text-right text-gray-600">{formatCurrency(item.unitPrice)}</td>
                      <td className="py-3.5 text-right font-semibold text-gray-900">
                        {formatCurrency(item.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Calculations Breakdown */}
            <div className="flex justify-end pt-4 border-t border-gray-100">
              <div className="w-full max-w-72 space-y-2 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span>{formatCurrency(invoice.subtotal)}</span>
                </div>
                {invoice.tax > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>Tax ({invoice.tax}%)</span>
                    <span>{formatCurrency((invoice.subtotal * invoice.tax) / 100)}</span>
                  </div>
                )}
                {invoice.discount > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>Discount</span>
                    <span>-{formatCurrency(invoice.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-gray-900 text-lg border-t pt-3">
                  <span>Total Amount</span>
                  <span className="text-blue-600">{formatCurrency(invoice.total)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Paid</span>
                  <span>{formatCurrency(invoice.paidAmount ?? (invoice.status === 'paid' ? invoice.total : 0))}</span>
                </div>
                <div className="flex justify-between font-semibold text-gray-800">
                  <span>Balance due</span>
                  <span>{formatCurrency(Math.max(0, invoice.total - (invoice.paidAmount ?? (invoice.status === 'paid' ? invoice.total : 0))))}</span>
                </div>
              </div>
            </div>

            <section className="mt-8 border-t border-gray-100 pt-6">
              <h2 className="mb-4 text-sm font-semibold text-gray-800">Payment history</h2>
              {(invoice.payments || []).length === 0 ? (
                <p className="text-sm text-gray-500">
                  {invoice.status === 'paid'
                    ? 'This invoice was marked paid before payment tracking was enabled.'
                    : 'No payments have been recorded.'}
                </p>
              ) : (
                <div className="mb-5 divide-y divide-gray-100">
                  {invoice.payments.map((payment) => (
                    <div key={payment._id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                      <div>
                        <p className="font-medium text-gray-800">{formatCurrency(payment.amount)} · {payment.method.replace('_', ' ')}</p>
                        <p className="text-xs text-gray-500">{new Date(payment.date).toLocaleDateString()} {payment.reference ? `· ${payment.reference}` : ''}</p>
                        {payment.notes && <p className="mt-1 text-xs text-gray-500">{payment.notes}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {invoice.status !== 'draft' && invoice.status !== 'cancelled'
                && (invoice.paidAmount ?? 0) < invoice.total && (
                <form onSubmit={handleRecordPayment} className="print:hidden rounded-xl bg-gray-50 p-4">
                  <h3 className="mb-3 text-sm font-semibold text-gray-800">Record a payment</h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
                      Amount
                      <ShadcnInput
                        type="number"
                        min="0.01"
                        max={Math.max(0, invoice.total - (invoice.paidAmount ?? 0))}
                        step="0.01"
                        required
                        value={paymentAmount}
                        onChange={(event) => setPaymentAmount(event.target.value)}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
                      Payment date
                      <ShadcnInput type="date" required value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
                      Method
                      <ShadcnSelect value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
                        <option value="cash">Cash</option>
                        <option value="bank_transfer">Bank transfer</option>
                        <option value="card">Card</option>
                        <option value="cheque">Cheque</option>
                        <option value="other">Other</option>
                      </ShadcnSelect>
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
                      Reference (optional)
                      <ShadcnInput value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} />
                    </label>
                  </div>
                  <label className="mt-3 flex flex-col gap-1 text-xs font-medium text-gray-600">
                    Notes (optional)
                    <ShadcnInput value={paymentNotes} onChange={(event) => setPaymentNotes(event.target.value)} />
                  </label>
                  <Button type="submit" disabled={recordingPayment || !paymentAmount} className="mt-3">
                    {recordingPayment ? 'Saving payment...' : 'Save payment'}
                  </Button>
                </form>
              )}
            </section>

            {/* Notes */}
            {invoice.notes && (
              <div className="mt-8 pt-6 border-t border-gray-100 text-xs text-gray-500">
                <span className="font-semibold block mb-1 text-gray-700">Notes & Terms:</span>
                <p>{invoice.notes}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
    </ProtectedRoute>
  );
}
