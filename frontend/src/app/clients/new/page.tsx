'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Textarea } from '@/components/shadcn/textarea';
import { clientsApi } from '@/lib/api';

interface FormData {
  name: string;
  email: string;
  phone: string;
  address: string;
  company: string;
  notes: string;
}

export default function NewClientPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormData>({
    name: '',
    email: '',
    phone: '',
    address: '',
    company: '',
    notes: '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Name is required.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await clientsApi.create(form);
      router.push('/clients');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create client.');
      setSubmitting(false);
    }
  }

  return (
    <ProtectedRoute>
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
          <button
            onClick={() => router.back()}
            className="text-gray-500 hover:text-gray-700 text-sm flex items-center gap-1 transition-colors"
          >
            ← Back
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">New Client</h1>
            <p className="text-sm text-gray-500 mt-1">Add a new client to your directory</p>
          </div>
        </div>

        <Card title="Client Details">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}
            <Input
              label="Full Name"
              name="name"
              value={form.name}
              onChange={handleChange}
              required
              placeholder="e.g. John Doe"
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Email"
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                placeholder="john@example.com"
              />
              <Input
                label="Phone"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                placeholder="+1 234 567 890"
              />
            </div>
            <Input
              label="Company"
              name="company"
              value={form.company}
              onChange={handleChange}
              placeholder="Company or organization name"
            />
            <Input
              label="Address"
              name="address"
              value={form.address}
              onChange={handleChange}
              placeholder="Street, City, Country"
            />
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Notes</label>
              <Textarea
                name="notes"
                value={form.notes}
                onChange={handleChange}
                rows={4}
                placeholder="Any additional notes about this client..."
              />
            </div>
            <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
              <Button type="button" variant="secondary" onClick={() => router.back()} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={submitting}>
                {submitting ? 'Creating...' : 'Create Client'}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </AppLayout>
    </ProtectedRoute>
  );
}
