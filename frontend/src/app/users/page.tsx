'use client';

import { FormEvent, useEffect, useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import AdminRoute from '@/components/auth/AdminRoute';
import Button from '@/components/ui/Button';
import DeleteIconButton from '@/components/ui/DeleteIconButton';
import Card from '@/components/ui/Card';
import Input, { Select } from '@/components/ui/Input';
import { useAuth } from '@/context/AuthContext';
import { authApi } from '@/lib/api';
import { ApiResponse, User } from '@/types';

type ManagedUser = Omit<User, 'token'> & { createdAt?: string };
type AccountForm = {
  name: string;
  email: string;
  password: string;
  role: 'admin' | 'user';
};

const emptyForm: AccountForm = {
  name: '',
  email: '',
  password: '',
  role: 'user',
};

export default function UsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [form, setForm] = useState<AccountForm>(emptyForm);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function loadUsers() {
    setLoading(true);
    try {
      const result = await authApi.getUsers() as ApiResponse<ManagedUser[]>;
      setUsers(result.data || []);
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load user accounts');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void Promise.resolve().then(loadUsers);
  }, []);

  function resetForm() {
    setEditingUser(null);
    setForm(emptyForm);
    setError('');
    setMessage('');
  }

  function editUser(account: ManagedUser) {
    setEditingUser(account);
    setForm({ name: account.name, email: account.email, password: '', role: account.role });
    setError('');
    setMessage('');
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const payload = {
        name: form.name,
        email: form.email,
        role: form.role,
        ...(form.password ? { password: form.password } : {}),
      };
      if (editingUser) {
        await authApi.updateUser(editingUser._id, payload);
      } else {
        await authApi.createUser({ ...payload, password: form.password });
      }
      const wasEditing = Boolean(editingUser);
      resetForm();
      setMessage(wasEditing ? 'Account updated successfully.' : 'Account created successfully.');
      await loadUsers();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to save account');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(account: ManagedUser) {
    if (!confirm(`Delete the account for ${account.name}? This cannot be undone.`)) return;
    setDeletingId(account._id);
    setError('');
    setMessage('');
    try {
      await authApi.deleteUser(account._id);
      if (editingUser?._id === account._id) resetForm();
      setMessage('Account deleted successfully.');
      await loadUsers();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete account');
    } finally {
      setDeletingId('');
    }
  }

  return (
    <AdminRoute>
    <AppLayout>
      <div className="mx-auto max-w-5xl space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-gray-900">User accounts</h1>
          <p className="mt-1 text-sm text-gray-500">Manage administrator and staff access. Clients are managed separately in your directory.</p>
        </header>

        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {message && <div role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{message}</div>}

        {user?.role === 'admin' && (
          <Card title={editingUser ? 'Edit account' : 'Create account'}>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Select
                  label="Role"
                  value={form.role}
                  onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as AccountForm['role'] }))}
                  options={[
                    { value: 'user', label: 'User' },
                    { value: 'admin', label: 'Admin' },
                  ]}
                />
                <div />
                <Input label="Name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
                <Input label="Email" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} required />
                <Input
                  label={editingUser ? 'New password (optional)' : 'Temporary password'}
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                  required={!editingUser}
                />
              </div>
              <p className="text-xs text-gray-500">Passwords must contain at least 8 characters. Leave the password blank to keep it unchanged.</p>
              <div className="flex justify-end gap-2">
                {editingUser && <Button type="button" variant="secondary" onClick={resetForm} disabled={submitting}>Cancel</Button>}
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Saving...' : editingUser ? 'Save changes' : 'Create account'}
                </Button>
              </div>
            </form>
          </Card>
        )}

        <Card title="Accounts">
          {loading ? <p className="text-sm text-gray-500">Loading accounts...</p> : users.length === 0 ? (
            <p className="text-sm text-gray-500">No accounts found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-gray-500">
                    <th className="py-3 pr-4">Name</th>
                    <th className="py-3 pr-4">Email</th>
                    <th className="py-3 pr-4">Role</th>
                    {user?.role === 'admin' && <th className="py-3 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map((account) => (
                    <tr key={account._id}>
                      <td className="py-3 pr-4 font-medium text-gray-900">{account.name}</td>
                      <td className="py-3 pr-4 text-gray-600">{account.email}</td>
                      <td className="py-3 pr-4 capitalize text-gray-600">{account.role}</td>
                      {user?.role === 'admin' && (
                        <td className="py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="ghost" onClick={() => editUser(account)}>Edit</Button>
                            <DeleteIconButton
                              label={deletingId === account._id ? 'Deleting account' : `Delete ${account.name}`}
                              disabled={deletingId === account._id || account._id === user?._id}
                              onClick={() => void handleDelete(account)}
                            />
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </AppLayout>
    </AdminRoute>
  );
}
