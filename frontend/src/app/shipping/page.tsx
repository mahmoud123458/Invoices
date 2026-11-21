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
import { shippingApi } from '@/lib/api';
import { ShippingCompany, ShippingStats } from '@/types';

interface CompanyFormData {
  name: string;
  phone: string;
  email: string;
  address: string;
  avgDeliveryDays: string;
  pricePerKg: string;
  notes: string;
}

const emptyForm: CompanyFormData = {
  name: '',
  phone: '',
  email: '',
  address: '',
  avgDeliveryDays: '3',
  pricePerKg: '',
  notes: '',
};

export default function ShippingPage() {
  const [companies, setCompanies] = useState<ShippingCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statsMap, setStatsMap] = useState<Record<string, ShippingStats['stats']>>({});
  const [statsLoading, setStatsLoading] = useState<Record<string, boolean>>({});

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingCompany, setEditingCompany] = useState<ShippingCompany | null>(null);
  const [form, setForm] = useState<CompanyFormData>(emptyForm);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Selected company detail modal
  const [selectedStats, setSelectedStats] = useState<ShippingStats | null>(null);

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = (await shippingApi.getAll()) as { success: boolean; data: ShippingCompany[] };
      const companyList = res.data || [];
      setCompanies(companyList);

      // Fetch stats for each company in parallel
      for (const comp of companyList) {
        setStatsLoading((prev) => ({ ...prev, [comp._id]: true }));
        shippingApi
          .getStats(comp._id)
          .then((sRes: any) => {
            if (sRes.success && sRes.data?.stats) {
              setStatsMap((prev) => ({ ...prev, [comp._id]: sRes.data.stats }));
            }
          })
          .catch((err) => console.error(err))
          .finally(() => {
            setStatsLoading((prev) => ({ ...prev, [comp._id]: false }));
          });
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load shipping companies');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  function openAddModal() {
    setEditingCompany(null);
    setForm(emptyForm);
    setFormError('');
    setShowModal(true);
  }

  function openEditModal(company: ShippingCompany) {
    setEditingCompany(company);
    setForm({
      name: company.name,
      phone: company.phone,
      email: company.email || '',
      address: company.address || '',
      avgDeliveryDays: String(company.avgDeliveryDays || 3),
      pricePerKg: company.pricePerKg ? String(company.pricePerKg) : '',
      notes: company.notes || '',
    });
    setFormError('');
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingCompany(null);
    setForm(emptyForm);
    setFormError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setFormError('Company name is required.');
      return;
    }
    if (!form.phone.trim()) {
      setFormError('Phone number is required.');
      return;
    }

    setSubmitting(true);
    setFormError('');

    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || undefined,
      address: form.address.trim() || undefined,
      avgDeliveryDays: Number(form.avgDeliveryDays) || 3,
      pricePerKg: form.pricePerKg ? Number(form.pricePerKg) : undefined,
      notes: form.notes.trim() || undefined,
    };

    try {
      if (editingCompany) {
        await shippingApi.update(editingCompany._id, payload);
      } else {
        await shippingApi.create(payload);
      }
      closeModal();
      fetchCompanies();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to save shipping company');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(company: ShippingCompany) {
    if (!confirm(`Are you sure you want to deactivate ${company.name}?`)) return;
    try {
      await shippingApi.delete(company._id);
      fetchCompanies();
    } catch (err: any) {
      alert(err.message || 'Failed to delete company');
    }
  }

  async function viewDetailedStats(company: ShippingCompany) {
    try {
      const res = (await shippingApi.getStats(company._id)) as any;
      if (res.success && res.data) {
        setSelectedStats(res.data);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to fetch details');
    }
  }

  return (
    <ProtectedRoute>
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Shipping & Delivery</h1>
            <p className="text-gray-500 text-sm mt-1">
              Manage courier partners, invoice assignments, and delivery performance metrics
            </p>
          </div>
          <Button onClick={openAddModal}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Shipping Partner
          </Button>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
            {error}
          </div>
        )}

        {/* Company Cards Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
                <div className="h-5 bg-gray-200 rounded w-1/2 mb-4" />
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                <div className="h-4 bg-gray-200 rounded w-1/3 mb-6" />
                <div className="grid grid-cols-3 gap-2 pt-4 border-t border-gray-100">
                  <div className="h-8 bg-gray-100 rounded" />
                  <div className="h-8 bg-gray-100 rounded" />
                  <div className="h-8 bg-gray-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : companies.length === 0 ? (
          <Card>
            <div className="text-center py-16">
              <span className="text-5xl">🚚</span>
              <p className="mt-3 text-gray-500">No shipping companies found</p>
              <Button className="mt-4" onClick={openAddModal}>
                Add Your First Shipping Partner
              </Button>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {companies.map((company) => {
              const stats = statsMap[company._id];
              const isFetchingStats = statsLoading[company._id];
              const deliveryRate = stats?.deliveryRate ?? 0;

              return (
                <div
                  key={company._id}
                  className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <h3 className="font-semibold text-lg text-gray-900">{company.name}</h3>
                        <p className="text-xs text-gray-500 mt-0.5">{company.phone}</p>
                      </div>
                      <Badge label="Active" variant="success" />
                    </div>

                    {company.email && (
                      <p className="text-xs text-gray-500 mb-1 flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        {company.email}
                      </p>
                    )}

                    {company.address && (
                      <p className="text-xs text-gray-500 mb-4 flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        {company.address}
                      </p>
                    )}

                    {/* Stats Box */}
                    <div className="bg-gray-50 rounded-lg p-3 grid grid-cols-3 gap-2 text-center my-4">
                      <div>
                        <span className="text-[11px] text-gray-500 block">Total Invoices</span>
                        <span className="text-base font-bold text-gray-800">
                          {isFetchingStats ? '...' : stats?.totalInvoices ?? 0}
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] text-gray-500 block">Delivery Rate</span>
                        <span
                          className={`text-base font-bold ${
                            deliveryRate >= 80
                              ? 'text-green-600'
                              : deliveryRate >= 50
                              ? 'text-yellow-600'
                              : 'text-gray-700'
                          }`}
                        >
                          {isFetchingStats ? '...' : `${deliveryRate}%`}
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] text-gray-500 block">Avg. Duration</span>
                        <span className="text-base font-bold text-blue-600">
                          {company.avgDeliveryDays}d
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-gray-100 mt-2">
                    <button
                      onClick={() => viewDetailedStats(company)}
                      className="text-xs font-medium text-blue-600 hover:text-blue-800"
                    >
                      View Report →
                    </button>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => openEditModal(company)}>
                        Edit
                      </Button>
                      <DeleteIconButton label={`Delete ${company.name}`} onClick={() => void handleDelete(company)} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal: Add/Edit Company */}
        <Dialog
          open={showModal}
          onOpenChange={(open) => { if (!open) closeModal(); }}
          title={editingCompany ? 'Edit Shipping Partner' : 'Add Shipping Partner'}
        >
              <form onSubmit={handleSubmit} className="space-y-4 p-6">
                {formError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                    {formError}
                  </div>
                )}

                <Input
                  label="Company Name"
                  required
                  placeholder="e.g. Aramex, DHL, Bosta"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Phone Number"
                    required
                    placeholder="+1234567890"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                  <Input
                    label="Email"
                    type="email"
                    placeholder="contact@shipping.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Avg. Delivery Duration (Days)"
                    type="number"
                    placeholder="3"
                    value={form.avgDeliveryDays}
                    onChange={(e) => setForm({ ...form, avgDeliveryDays: e.target.value })}
                  />
                  <Input
                    label="Price per KG (EGP)"
                    type="number"
                    placeholder="Optional"
                    value={form.pricePerKg}
                    onChange={(e) => setForm({ ...form, pricePerKg: e.target.value })}
                  />
                </div>

                <Input
                  label="Office Address"
                  placeholder="City, Branch, Country"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />

                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Notes</label>
                  <Textarea
                    rows={2}
                    placeholder="Service level agreements, terms, tracking portal link..."
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                  <Button type="button" variant="secondary" onClick={closeModal}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? 'Saving...' : editingCompany ? 'Update Partner' : 'Save Partner'}
                  </Button>
                </div>
              </form>
        </Dialog>

        {/* Modal: Detailed Stats Report */}
        <Dialog
          open={Boolean(selectedStats)}
          onOpenChange={(open) => { if (!open) setSelectedStats(null); }}
          title={selectedStats?.company.name || 'Shipping performance'}
          description="Performance & Delivery Analytics"
          size="sm"
        >
          {selectedStats && <div className="space-y-4 p-4 sm:p-6">
              <div className="my-4 space-y-4 sm:my-6">
                <div className="flex items-center justify-between gap-3 rounded-xl bg-blue-50 p-4">
                  <span className="min-w-0 text-sm font-medium text-blue-800">Assigned Invoices</span>
                  <span className="shrink-0 text-xl font-bold text-blue-900">{selectedStats.stats.totalInvoices}</span>
                </div>

                <div className="flex items-center justify-between gap-3 rounded-xl bg-green-50 p-4">
                  <span className="min-w-0 text-sm font-medium text-green-800">Delivered Invoices</span>
                  <span className="shrink-0 text-xl font-bold text-green-900">{selectedStats.stats.deliveredInvoices}</span>
                </div>

                <div className="flex items-center justify-between gap-3 rounded-xl bg-purple-50 p-4">
                  <span className="min-w-0 text-sm font-medium text-purple-800">Success Delivery Rate</span>
                  <span className="shrink-0 text-xl font-bold text-purple-900">{selectedStats.stats.deliveryRate}%</span>
                </div>

                <div className="flex items-center justify-between gap-3 rounded-xl bg-orange-50 p-4">
                  <span className="min-w-0 text-sm font-medium text-orange-800">Average Delivery Time</span>
                  <span className="shrink-0 text-xl font-bold text-orange-900">{selectedStats.stats.avgDeliveryDays} Days</span>
                </div>
              </div>

              <Button fullWidth variant="secondary" onClick={() => setSelectedStats(null)}>
                Close
              </Button>
          </div>}
        </Dialog>
      </div>
    </AppLayout>
    </ProtectedRoute>
  );
}
