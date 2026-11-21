'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/layout/AppLayout';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Input, { Select } from '@/components/ui/Input';
import DeleteIconButton from '@/components/ui/DeleteIconButton';
import { expensesApi, financeApi } from '@/lib/api';
import { ApiResponse, Expense, FinancialSummary } from '@/types';
import { formatCurrency } from '@/lib/format';

interface ExpenseForm {
  description: string;
  category: string;
  amount: string;
  date: string;
  paymentMethod: Expense['paymentMethod'];
  reference: string;
  notes: string;
}

function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function initialRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  return { from: localDate(from), to: localDate(now) };
}

const emptyForm = (): ExpenseForm => ({
  description: '',
  category: '',
  amount: '',
  date: localDate(),
  paymentMethod: 'cash',
  reference: '',
  notes: '',
});

const methodOptions = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'card', label: 'Card' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'other', label: 'Other' },
];

export default function FinancePage() {
  const [defaultRange] = useState(() => initialRange());
  const [range, setRange] = useState(defaultRange);
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [form, setForm] = useState<ExpenseForm>(emptyForm);
  const [editingId, setEditingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadFinance = useCallback(async (start: string, end: string) => {
    setLoading(true);
    setError('');
    try {
      const [summaryResponse, expenseResponse] = await Promise.all([
        financeApi.getSummary({ from: start, to: end }) as Promise<ApiResponse<FinancialSummary>>,
        expensesApi.getAll({ from: start, to: end }) as Promise<ApiResponse<Expense[]>>,
      ]);
      setSummary(summaryResponse.data);
      setExpenses(expenseResponse.data || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load financial data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => loadFinance(range.from, range.to));
  }, [range, loadFinance]);

  function applyDateRange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!from || !to || from > to) {
      setError('Start date must be on or before end date.');
      return;
    }
    setError('');
    setRange({ from, to });
  }

  const updateForm = (field: keyof ExpenseForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  async function handleSubmitExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const payload = { ...form, amount: Number(form.amount) };
      if (editingId) {
        await expensesApi.update(editingId, payload);
        setNotice('Expense updated.');
      } else {
        await expensesApi.create(payload);
        setNotice('Expense recorded.');
      }
      setForm(emptyForm());
      setEditingId('');
      await loadFinance(from, to);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save expense');
    } finally {
      setSaving(false);
    }
  }

  function startEditing(expense: Expense) {
    setEditingId(expense._id);
    setForm({
      description: expense.description,
      category: expense.category,
      amount: String(expense.amount),
      date: localDate(new Date(expense.date)),
      paymentMethod: expense.paymentMethod,
      reference: expense.reference || '',
      notes: expense.notes || '',
    });
    setNotice('');
  }

  async function removeExpense(expense: Expense) {
    if (!window.confirm(`Delete "${expense.description}"?`)) return;
    setError('');
    setNotice('');
    try {
      await expensesApi.delete(expense._id);
      setNotice('Expense deleted.');
      if (editingId === expense._id) {
        setEditingId('');
        setForm(emptyForm());
      }
      await loadFinance(from, to);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete expense');
    }
  }

  const maxFlow = Math.max(1, ...(summary?.cashFlow || []).flatMap((month) => [month.income, month.expenses]));

  return (
    <ProtectedRoute>
    <AppLayout>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-sm font-medium text-blue-600">Money in, money out</p>
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Financial management</h1>
          <p className="mt-1 text-sm text-gray-500">Track collections, expenses, outstanding balances, and cash flow in EGP.</p>
        </div>
        <form className="flex flex-wrap items-end gap-3" onSubmit={applyDateRange}>
          <Input label="From" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          <Input label="To" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          <Button type="submit">Apply</Button>
        </form>
      </div>

      {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {notice && <div role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-5">
        {[
          { label: 'Collected', value: summary?.collected, detail: 'Payments received in period', accent: 'text-emerald-700 bg-emerald-50' },
          { label: 'Outstanding', value: summary?.outstanding, detail: 'Open invoice balances', accent: 'text-amber-700 bg-amber-50' },
          { label: 'Expenses', value: summary?.expenses, detail: 'Recorded operating costs', accent: 'text-rose-700 bg-rose-50' },
          { label: 'Net cash flow', value: summary?.netCashFlow, detail: 'Collected minus expenses', accent: 'text-blue-700 bg-blue-50' },
          { label: 'Total invoiced', value: summary?.totalInvoiced, detail: 'Issued in selected period', accent: 'text-violet-700 bg-violet-50' },
        ].map((metric) => (
          <div key={metric.label} className="rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm">
            <p className="text-sm font-medium text-gray-500">{metric.label}</p>
            <p className={`mt-3 text-xl font-bold tracking-tight sm:text-2xl ${metric.accent.split(' ')[0]}`}>
              {loading ? '—' : formatCurrency(metric.value || 0)}
            </p>
            <p className="mt-2 text-xs text-gray-400">{metric.detail}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card title="Cash flow" className="xl:col-span-2">
          <div className="mb-5 flex flex-wrap gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-blue-500" />Income</span>
            <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-rose-400" />Expenses</span>
          </div>
          {loading ? <div className="h-52 animate-pulse rounded-xl bg-gray-50" /> : (
            <div className="flex h-56 items-end gap-2 overflow-x-auto border-b border-gray-100 pb-2 sm:gap-3">
              {(summary?.cashFlow || []).map((month) => (
                <div key={month.month} className="flex h-full min-w-8 flex-1 flex-col items-center justify-end gap-2 sm:min-w-10">
                  <div className="flex h-[82%] w-full items-end justify-center gap-1">
                    <div
                      title={`Income: ${formatCurrency(month.income)}`}
                      className="w-2/5 rounded-t-md bg-blue-500 transition-all"
                      style={{ height: `${Math.max(month.income > 0 ? 3 : 0, (month.income / maxFlow) * 100)}%` }}
                    />
                    <div
                      title={`Expenses: ${formatCurrency(month.expenses)}`}
                      className="w-2/5 rounded-t-md bg-rose-400 transition-all"
                      style={{ height: `${Math.max(month.expenses > 0 ? 3 : 0, (month.expenses / maxFlow) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-400">{new Date(`${month.month}-01T00:00:00`).toLocaleDateString('en', { month: 'short' })}</span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-5 text-xs text-gray-500">
            {summary?.cashFlow.slice(-3).map((month) => (
              <span key={month.month}>{month.month}: <b className={month.net >= 0 ? 'text-emerald-700' : 'text-rose-700'}>{formatCurrency(month.net)}</b></span>
            ))}
          </div>
        </Card>

        <Card title="Expenses by category">
          {loading ? <div className="space-y-4">{[1, 2, 3].map((item) => <div key={item} className="h-8 animate-pulse rounded bg-gray-50" />)}</div>
            : !summary?.expenseCategories.length ? <p className="py-8 text-center text-sm text-gray-500">No expenses in this period.</p>
              : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {summary.expenseCategories.slice(0, 6).map((category, index) => {
                  const total = summary.expenseCategories.reduce((sum, item) => sum + item.amount, 0);
                  const percentage = total ? (category.amount / total) * 100 : 0;
                  const strokeColors = ['stroke-blue-500', 'stroke-violet-500', 'stroke-amber-500', 'stroke-emerald-500', 'stroke-rose-500', 'stroke-cyan-500'];
                  return (
                    <div key={category.category} className="flex items-center gap-3 rounded-xl border border-gray-100 p-3">
                      <div className="relative h-12 w-12 shrink-0" role="img" aria-label={`${category.category}: ${percentage.toFixed(0)}% of expenses`}>
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
                            className={strokeColors[index]}
                          />
                        </svg>
                        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold tabular-nums text-gray-700">{percentage.toFixed(0)}%</span>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm text-gray-600">{category.category}</p>
                        <p className="mt-1 text-sm font-semibold text-gray-800">{formatCurrency(category.amount)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>}
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card title={editingId ? 'Edit expense' : 'Record an expense'}>
          <form onSubmit={handleSubmitExpense} className="space-y-3">
            <Input label="Description" required maxLength={160} value={form.description} onChange={(event) => updateForm('description', event.target.value)} placeholder="Office rent, utilities..." />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input label="Category" required maxLength={80} value={form.category} onChange={(event) => updateForm('category', event.target.value)} placeholder="Rent, payroll..." />
              <Input label="Amount (EGP)" type="number" min={0.01} step="0.01" required value={form.amount} onChange={(event) => updateForm('amount', event.target.value)} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input label="Date" type="date" required value={form.date} onChange={(event) => updateForm('date', event.target.value)} />
              <Select label="Payment method" value={form.paymentMethod} onChange={(event) => updateForm('paymentMethod', event.target.value)} options={methodOptions} />
            </div>
            <Input label="Reference (optional)" value={form.reference} onChange={(event) => updateForm('reference', event.target.value)} />
            <Input label="Notes (optional)" value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} />
            <div className="flex gap-2 pt-1">
              <Button type="submit" disabled={saving}>{saving ? 'Saving...' : editingId ? 'Update expense' : 'Save expense'}</Button>
              {editingId && <Button variant="secondary" onClick={() => { setEditingId(''); setForm(emptyForm()); }}>Cancel</Button>}
            </div>
          </form>
          <p className="mt-4 text-xs leading-5 text-gray-400">Purchase orders are tracked separately and are not counted as cash expenses until they are actually paid and recorded here.</p>
        </Card>

        <div className="space-y-5 xl:col-span-2">
          <Card title="Expense ledger">
            {loading ? <p className="py-10 text-center text-sm text-gray-500">Loading expenses...</p>
              : expenses.length === 0 ? <p className="py-10 text-center text-sm text-gray-500">No expenses recorded in this period.</p>
                : <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-left text-sm">
                    <thead><tr className="border-b border-gray-100 text-xs font-semibold uppercase tracking-wide text-gray-400">
                      <th className="px-3 py-3">Expense</th><th className="px-3 py-3">Category</th><th className="px-3 py-3">Date</th><th className="px-3 py-3">Method</th><th className="px-3 py-3 text-right">Amount</th><th className="px-3 py-3" />
                    </tr></thead>
                    <tbody className="divide-y divide-gray-50">
                      {expenses.map((expense) => (
                        <tr key={expense._id} className="hover:bg-gray-50/70">
                          <td className="px-3 py-3"><p className="font-medium text-gray-800">{expense.description}</p>{expense.reference && <p className="text-xs text-gray-400">{expense.reference}</p>}</td>
                          <td className="px-3 py-3 text-gray-600">{expense.category}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-gray-500">{new Date(expense.date).toLocaleDateString()}</td>
                          <td className="whitespace-nowrap px-3 py-3 capitalize text-gray-500">{expense.paymentMethod.replace('_', ' ')}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-right font-semibold text-rose-700">{formatCurrency(expense.amount)}</td>
                          <td className="px-3 py-3"><div className="flex gap-1">
                            <Button size="sm" variant="ghost" onClick={() => startEditing(expense)}>Edit</Button>
                            <DeleteIconButton label={`Delete ${expense.description}`} onClick={() => void removeExpense(expense)} />
                          </div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>}
          </Card>

          <Card title="Outstanding invoices" action={<Link href="/invoices" className="text-xs font-medium text-blue-600 hover:text-blue-700">All invoices</Link>}>
            {!summary?.outstandingInvoices.length ? <p className="py-6 text-center text-sm text-gray-500">No outstanding invoice balances.</p>
              : <div className="divide-y divide-gray-50">
                {summary.outstandingInvoices.slice(0, 6).map((invoice) => (
                  <Link key={invoice._id} href={`/invoices/${invoice._id}`} className="flex flex-wrap items-center justify-between gap-2 py-3 hover:bg-gray-50/70">
                    <div><p className="text-sm font-medium text-blue-700">{invoice.invoiceNumber} <span className="font-normal text-gray-500">· {invoice.clientName}</span></p>
                      <p className="mt-1 text-xs text-gray-400">{invoice.dueDate ? `Due ${new Date(invoice.dueDate).toLocaleDateString()}` : 'No due date'}</p></div>
                    <span className="text-sm font-semibold text-amber-700">{formatCurrency(invoice.amountDue)}</span>
                  </Link>
                ))}
              </div>}
          </Card>
        </div>
      </div>

      <div className="mt-6">
        <Card title="Recent cash transactions">
          {!summary?.recentTransactions.length ? <p className="py-6 text-center text-sm text-gray-500">No transactions in this period.</p>
            : <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead><tr className="border-b border-gray-100 text-xs font-semibold uppercase tracking-wide text-gray-400"><th className="px-3 py-3">Transaction</th><th className="px-3 py-3">Category</th><th className="px-3 py-3">Date</th><th className="px-3 py-3">Method</th><th className="px-3 py-3 text-right">Amount</th></tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {summary.recentTransactions.map((transaction) => (
                    <tr key={transaction.id}>
                      <td className="px-3 py-3 font-medium text-gray-800">{transaction.description}</td><td className="px-3 py-3 text-gray-500">{transaction.category}</td><td className="px-3 py-3 text-gray-500">{new Date(transaction.date).toLocaleDateString()}</td><td className="px-3 py-3 capitalize text-gray-500">{transaction.method.replace('_', ' ')}</td>
                      <td className={`px-3 py-3 text-right font-semibold ${transaction.type === 'income' ? 'text-emerald-700' : 'text-rose-700'}`}>{transaction.type === 'income' ? '+' : '−'}{formatCurrency(transaction.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>}
        </Card>
      </div>
    </AppLayout>
    </ProtectedRoute>
  );
}
