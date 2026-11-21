import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-6 py-12 text-center">
      {/* Background soft glow gradient */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-30 dark:opacity-20">
        <div className="h-[30rem] w-[30rem] rounded-full bg-blue-600/30 blur-[120px]" />
      </div>

      <div className="relative z-10 flex max-w-lg flex-col items-center">
        {/* Modern 404 Badge */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 shadow-sm">
          <span className="flex h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Error 404</span>
        </div>

        {/* Big Stylized 404 Display */}
        <h1 className="text-7xl font-extrabold tracking-tight text-foreground sm:text-8xl md:text-9xl">
          <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-400 bg-clip-text text-transparent">
            404
          </span>
        </h1>

        <h2 className="mt-4 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Page not found
        </h2>

        <p className="mt-3 text-base text-muted-foreground">
          Sorry, the invoice, client, or section you are looking for does not exist or has been moved to another location.
        </p>

        {/* Action Buttons */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-blue-600/20 transition-all hover:bg-blue-700 hover:shadow-md"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            Back to Dashboard
          </Link>

          <Link
            href="/invoices"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground transition-all hover:bg-muted"
          >
            <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            View Invoices
          </Link>
        </div>

        {/* Quick Links Footer */}
        <div className="mt-12 border-t border-border/60 pt-6">
          <p className="text-xs text-muted-foreground">Quick destinations:</p>
          <div className="mt-2 flex flex-wrap justify-center gap-4 text-xs font-medium text-blue-600 dark:text-blue-400">
            <Link href="/clients" className="hover:underline">Clients</Link>
            <span>•</span>
            <Link href="/inventory" className="hover:underline">Inventory</Link>
            <span>•</span>
            <Link href="/shipping" className="hover:underline">Shipping</Link>
            <span>•</span>
            <Link href="/purchase-orders" className="hover:underline">Purchase Orders</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
