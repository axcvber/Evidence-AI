// Minimal form primitives for the step 1.5 auth pages; step 1.7 replaces them with shadcn/ui.
import type { ComponentProps, ReactNode } from 'react';

export function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {children}
    </main>
  );
}

export function Field({ label, ...props }: { label: string } & ComponentProps<'input'>) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {label}
      <input
        className="rounded-md border border-zinc-300 px-3 py-2 font-normal focus:border-zinc-900 focus:outline-none"
        {...props}
      />
    </label>
  );
}

export function Button(props: ComponentProps<'button'>) {
  return (
    <button
      className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      {...props}
    />
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return children ? (
    <p role="alert" className="text-sm text-red-600">
      {children}
    </p>
  ) : null;
}
