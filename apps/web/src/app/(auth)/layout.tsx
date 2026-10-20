import Link from 'next/link';
import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/40 p-6">
      <Link href="/" className="text-lg font-semibold tracking-tight">
        Evidence AI
      </Link>
      {children}
    </main>
  );
}
