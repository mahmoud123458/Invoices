'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChartNoAxesColumn,
  FileText,
  LayoutDashboard,
  LogOut,
  Package,
  ShoppingCart,
  Truck,
  Users,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import ThemeToggle from '@/components/ui/ThemeToggle';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/invoices', label: 'Invoices', icon: FileText },
  { href: '/finance', label: 'Finance', icon: ChartNoAxesColumn },
  { href: '/clients', label: 'Clients', icon: Users },
  { href: '/inventory', label: 'Inventory', icon: Package },
  { href: '/shipping', label: 'Shipping', icon: Truck },
  { href: '/purchase-orders', label: 'Purchase Orders', icon: ShoppingCart },
  { href: '/users', label: 'Users', icon: Users },
];

export default function Sidebar({
  mobileOpen,
  onClose,
}: {
  mobileOpen: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const visibleItems = user?.role === 'admin'
    ? navItems
    : user?.role === 'user'
      ? navItems.filter((item) => !['/users', '/inventory', '/shipping'].includes(item.href))
      : [];

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onClose}
        />
      )}
      <aside
        id="app-navigation"
        className={`fixed inset-y-0 left-0 z-50 flex h-dvh w-72 max-w-[85vw] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-200 md:w-64 ${
          mobileOpen ? 'visible translate-x-0' : 'invisible -translate-x-full md:visible md:translate-x-0'
        }`}
      >
        {/* Brand mark */}
        <div className="border-b border-sidebar-border px-5 py-5">
          <Link href="/" aria-label="InvoiceApp home" className="flex items-center gap-3">
            <span className="relative flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
              {/* Document + checkmark composite icon */}
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                fill="none"
                className="size-5"
              >
                <rect x="3" y="2" width="11" height="14" rx="1.5" fill="white" fillOpacity="0.25" />
                <rect x="3" y="2" width="11" height="14" rx="1.5" stroke="white" strokeWidth="1.5" />
                <line x1="6" y1="6.5" x2="11" y2="6.5" stroke="white" strokeWidth="1.25" strokeLinecap="round" />
                <line x1="6" y1="9.5" x2="9" y2="9.5" stroke="white" strokeWidth="1.25" strokeLinecap="round" />
                <circle cx="14.5" cy="13.5" r="4" fill="#2563EB" />
                <polyline points="12.5,13.5 13.9,14.9 16.5,12.3" stroke="white" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
            </span>
            <div className="min-w-0">
              <span className="block whitespace-nowrap text-base font-semibold tracking-tight">InvoiceApp</span>
              <span className="block text-[11px] text-muted-foreground">Financial Operations</span>
            </div>
          </Link>
        </div>

        <nav aria-label="Main navigation" className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-0.5">
            {visibleItems.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-label={label}
                    aria-current={isActive ? 'page' : undefined}
                    title={label}
                    onClick={onClose}
                    className={`relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                        : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                    }`}
                  >
                    {/* Active left border accent */}
                    {isActive && (
                      <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-blue-600" aria-hidden="true" />
                    )}
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    <span className="whitespace-nowrap">{label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="space-y-3 border-t border-sidebar-border px-3 py-4">
          <ThemeToggle />
          <div className="flex items-center gap-3 px-2">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
              {user?.name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user?.name || 'User'}</p>
              <p className="text-xs capitalize text-muted-foreground">{user?.role || 'Member'}</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Logout"
            title="Logout"
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            onClick={() => { onClose(); logout(); }}
          >
            <LogOut className="size-4 shrink-0" aria-hidden="true" />
            <span>Logout</span>
          </button>
          {/* Version */}
          <p className="px-2 text-[11px] text-muted-foreground/60">v1.0</p>
        </div>
      </aside>
    </>
  );
}
