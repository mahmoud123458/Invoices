import { ApiResponse } from '@/types';
import { isInvalidSessionResponse } from '@/lib/sessionAuth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';
const inFlightGetRequests = new Map<string, Promise<ApiResponse<unknown>>>();

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  const user = localStorage.getItem('user');
  if (!user) return null;
  try {
    return JSON.parse(user).token || null;
  } catch {
    localStorage.removeItem('user');
    return null;
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const apiUrl = API_URL;
  if (!apiUrl) {
    throw new Error('Backend API URL is not configured. Set NEXT_PUBLIC_API_URL for this deployment.');
  }

  const token = getToken();
  const method = (options.method || 'GET').toUpperCase();
  const requestKey = method === 'GET'
    ? `${token || 'anonymous'}:${endpoint}`
    : null;
  const inFlight = requestKey ? inFlightGetRequests.get(requestKey) : undefined;
  if (inFlight) return inFlight as Promise<ApiResponse<T>>;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const requestPromise = (async (): Promise<ApiResponse<T>> => {
    const response = await fetch(`${apiUrl}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await response.json();
    if (!response.ok) {
      if (
        isInvalidSessionResponse(response.status, endpoint, data.message)
        && typeof window !== 'undefined'
      ) {
        window.dispatchEvent(new CustomEvent('invoiceapp:unauthorized'));
      }
      throw new Error(data.message || 'Something went wrong');
    }
    return data;
  })();

  if (requestKey) inFlightGetRequests.set(requestKey, requestPromise as Promise<ApiResponse<unknown>>);
  try {
    return await requestPromise;
  } finally {
    if (requestKey && inFlightGetRequests.get(requestKey) === requestPromise) {
      inFlightGetRequests.delete(requestKey);
    }
  }
}

// Auth
export const authApi = {
  login: (email: string, password: string) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => request('/auth/me'),
  getUsers: () => request('/auth/users'),
  createUser: (data: object) =>
    request('/auth/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id: string, data: object) =>
    request(`/auth/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteUser: (id: string) => request(`/auth/users/${id}`, { method: 'DELETE' }),
};

// Clients
export const clientsApi = {
  getAll: (search?: string) => request(`/clients${search ? `?search=${search}` : ''}`),
  getOne: (id: string) => request(`/clients/${id}`),
  create: (data: object) => request('/clients', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: object) => request(`/clients/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/clients/${id}`, { method: 'DELETE' }),
};

// Products
export const productsApi = {
  getAll: (search?: string, lowStock?: boolean) =>
    request(`/products${search ? `?search=${search}` : ''}${lowStock ? '?lowStock=true' : ''}`),
  getOne: (id: string) => request(`/products/${id}`),
  create: (data: object) => request('/products', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: object) => request(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/products/${id}`, { method: 'DELETE' }),
};

// Invoices
export const invoicesApi = {
  getAll: (params?: { status?: string; client?: string }) => {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
    return request(`/invoices${qs}`);
  },
  getOne: (id: string) => request(`/invoices/${id}`),
  create: (data: object) => request('/invoices', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: object) => request(`/invoices/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/invoices/${id}`, { method: 'DELETE' }),
  getStats: () => request('/invoices/stats'),
  addPayment: (id: string, data: object) =>
    request(`/invoices/${id}/payments`, { method: 'POST', body: JSON.stringify(data) }),
};

// Financial management
export const expensesApi = {
  getAll: (params?: { from?: string; to?: string; category?: string }) => {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
    return request(`/expenses${qs}`);
  },
  create: (data: object) => request('/expenses', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: object) =>
    request(`/expenses/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/expenses/${id}`, { method: 'DELETE' }),
};

export const financeApi = {
  getSummary: (params?: { from?: string; to?: string }) => {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
    return request(`/finance/summary${qs}`);
  },
};

// Shipping
export const shippingApi = {
  getAll: () => request('/shipping'),
  getStats: (id: string) => request(`/shipping/${id}/stats`),
  create: (data: object) => request('/shipping', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: object) => request(`/shipping/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/shipping/${id}`, { method: 'DELETE' }),
};

// Purchase Orders
export const purchaseOrdersApi = {
  getAll: (status?: string) => request(`/purchase-orders${status ? `?status=${status}` : ''}`),
  getOne: (id: string) => request(`/purchase-orders/${id}`),
  create: (data: object) => request('/purchase-orders', { method: 'POST', body: JSON.stringify(data) }),
  approve: (id: string) => request(`/purchase-orders/${id}/approve`, { method: 'PUT' }),
  reject: (id: string) => request(`/purchase-orders/${id}/reject`, { method: 'PUT' }),
};
