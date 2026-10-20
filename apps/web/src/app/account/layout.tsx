import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AccountNav } from '@/features/account/account-nav';
import { getCurrentUser } from '@/lib/session';

export default async function AccountLayout({ children }: { children: ReactNode }) {
  const me = await getCurrentUser();
  if (!me) redirect('/login?next=/account/profile');
  const back = me.activeWorkspace
    ? { href: `/w/${me.activeWorkspace.slug}/ask`, label: `Back to ${me.activeWorkspace.name}` }
    : { href: '/onboarding', label: 'Create a workspace' };

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="flex h-12 items-center justify-between border-b bg-background px-4">
        <Link href="/" className="font-semibold tracking-tight">
          Evidence AI
        </Link>
        <Link href={back.href} className="text-sm text-muted-foreground hover:text-foreground">
          {back.label}
        </Link>
      </header>
      <div className="mx-auto grid w-full max-w-4xl gap-6 p-6 md:grid-cols-[180px_1fr]">
        <AccountNav />
        <main className="min-w-0 space-y-6">{children}</main>
      </div>
    </div>
  );
}
