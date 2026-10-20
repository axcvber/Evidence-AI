'use client';

import { useState } from 'react';
import { ApiErrorAlert } from '@/components/api-error-alert';
import { MockNotice, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useMockSearch } from '@/features/dev-mocks/queries';

export function SearchPage() {
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const results = useMockSearch(q);

  return (
    <>
      <PageHeader title="Search" description="Find passages across your documents." />
      <MockNotice phase="Phase 3 (search and chat)" />
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setQ(draft);
        }}
      >
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="vacation" />
        <Button type="submit">Search</Button>
      </form>
      {results.error && <ApiErrorAlert error={results.error} capability="search" />}
      <ul className="space-y-2">
        {(results.data?.items ?? []).map((item) => (
          <li key={item.number} className="rounded-md border p-3 text-sm">
            <div className="font-medium">
              {item.documentTitle}, page {item.page}
            </div>
            <div className="text-muted-foreground">{item.snippet}</div>
          </li>
        ))}
      </ul>
    </>
  );
}
