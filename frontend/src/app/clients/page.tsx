'use client';

import { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import DeleteIconButton from '@/components/ui/DeleteIconButton';
import Input from '@/components/ui/Input';
import { Dialog } from '@/components/shadcn/dialog';
import { Textarea } from '@/components/shadcn/textarea';
import { clientsApi } from '@/lib/api';
import { Client } from '@/types';

interface ClientFormData {
  name: string;
  email: string;
  phone: string;
  address: string;
  company: string;
  notes: string;
}

const emptyForm: ClientFormData = {
  name: '',
  email: '',
  phone: '',
  address: '',
  company: '',
  notes: '',
};

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [form, setForm] = useState<ClientFormData>(emptyForm);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Client | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [notification, setNotification] = useState('');

  const fetchClients = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await clientsApi.getAll(search || undefined) as { success: boolean; data: Client[] };
      setClients(res.data || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load clients');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => fetchClients(), 300);
    return () => clearTimeout(timer);
  }, [fetchClients]);

  function openAddModal() {
    setEditingClient(null);
    setForm(emptyForm);
    setFormError('');
    setShowModal(true);
  }

  function openEditModal(client: Client) {
    setEditingClient(client);
    setForm({
      name: client.name,
      email: client.email || '',
      phone: client.phone || '',
      address: client.address || '',
      company: client.company || '',
      notes: client.notes || '',
    });
    setFormError('');
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingClient(null);
    setForm(emptyForm);
    setFormError('');
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setFormError('Name is required.');
      return;
    }
    setSubmitting(true);
    setFormError('');
    try {
      if (editingClient) {
        await clientsApi.update(editingClient._id, form);
        showNotification('Client updated successfully.');
      } else {
        await clientsApi.create(form);
        showNotification('Client created successfully.');
      }
      closeModal();
      fetchClients();
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
      await clientsApi.delete(deleteConfirm._id);
      showNotification('Client deleted.');
      setDeleteConfirm(null);
      fetchClients();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete client.');
    } finally {
      setDeleting(false);
    }
  }

  function showNotification(msg: string) {
    setNotification(msg);
    setTimeout(() => setNotification(''), 3000);
  }

  return (
    <ProtectedRoute>
    <AppLayout>
      {/* Notification */}
      {notification && (
        <div className="fixed left-4 right-4 top-4 z-50 max-w-md rounded-lg bg-green-600 px-5 py-3 text-sm font-medium text-white shadow-lg sm:left-auto sm:right-4">
          {notification}
        </div>
      )}

      {/* Modal */}
      <Dialog
        open={showModal}
        onOpenChange={(open) => { if (!open) closeModal(); }}
        title={editingClient ? 'Edit Client' : 'Add Client'}
      >
            <form onSubmit={handleSubmit} className="space-y-4 p-6">
              {formError && (
                <div className="bg-red-50 text-red-700 px-4 py-2 rounded-lg text-sm">{formError}</div>
              )}
              <Input label="Name" name="name" value={form.name} onChange={handleChange} required placeholder="Client name" />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input label="Email" name="email" type="email" value={form.email} onChange={handleChange} placeholder="email@example.com" />
                <Input label="Phone" name="phone" value={form.phone} onChange={handleChange} placeholder="+1 234 567 890" />
              </div>
              <Input label="Company" name="company" value={form.company} onChange={handleChange} placeholder="Company name" />
              <Input label="Address" name="address" value={form.address} onChange={handleChange} placeholder="Street, City, Country" />
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">Notes</label>
                <Textarea
                  name="notes"
                  value={form.notes}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Optional notes..."
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="secondary" onClick={closeModal} disabled={submitting}>Cancel</Button>
                <Button type="submit" variant="primary" disabled={submitting}>
                  {submitting ? 'Saving...' : editingClient ? 'Update' : 'Create'}
                </Button>
              </div>
            </form>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog
        open={Boolean(deleteConfirm)}
        onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}
        title="Delete Client"
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

      {/* Page */}
      <div className="space-y-6">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
            <p className="text-sm text-gray-500 mt-1">Manage your client directory</p>
          </div>
          <Button onClick={openAddModal} variant="primary">
            <span>+</span> Add Client
          </Button>
        </div>

        <Card>
          <div className="mb-4">
            <Input
              placeholder="Search clients by name, email, or company..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-10">
              <p className="text-red-500 text-sm mb-3">{error}</p>
              <Button variant="secondary" onClick={fetchClients} size="sm">Retry</Button>
            </div>
          ) : clients.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-4xl mb-3">👥</div>
              <p className="text-gray-500 text-sm">{search ? 'No clients match your search.' : 'No clients yet. Add your first client!'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide pb-3">Name</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide pb-3">Email</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide pb-3">Phone</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide pb-3">Company</th>
                    <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide pb-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {clients.map((client) => (
                    <tr key={client._id} className="hover:bg-gray-50 transition-colors">
                      <td className="py-3 pr-4">
                        <div className="font-medium text-gray-900 text-sm">{client.name}</div>
                        {client.address && <div className="text-xs text-gray-400 mt-0.5 truncate max-w-[200px]">{client.address}</div>}
                      </td>
                      <td className="py-3 pr-4 text-sm text-gray-600">{client.email || '—'}</td>
                      <td className="py-3 pr-4 text-sm text-gray-600">{client.phone || '—'}</td>
                      <td className="py-3 pr-4 text-sm text-gray-600">{client.company || '—'}</td>
                      <td className="py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="ghost" onClick={() => openEditModal(client)}>Edit</Button>
                          <DeleteIconButton label={`Delete ${client.name}`} onClick={() => setDeleteConfirm(client)} />
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
