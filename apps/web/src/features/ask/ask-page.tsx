'use client';

import { useState } from 'react';
import { ApiErrorAlert } from '@/components/api-error-alert';
import { MockNotice, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useMockAsk } from '@/features/dev-mocks/queries';

export function AskPage() {
  const [question, setQuestion] = useState('');
  const ask = useMockAsk();

  return (
    <>
      <PageHeader title="Ask" description="Answers from your documents, with citations." />
      <MockNotice phase="Phase 3 (search and chat)" />
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          ask.mutate(question);
        }}
      >
        <Textarea
          placeholder="How many vacation days do new employees get?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <Button type="submit" disabled={!question.trim() || ask.isPending}>
          Ask
        </Button>
      </form>
      {ask.error && <ApiErrorAlert error={ask.error} capability="ask" />}
      {ask.data && (
        <Card>
          <CardHeader>
            <CardTitle>Answer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>{ask.data.answer}</p>
            <ol className="space-y-2 text-sm">
              {ask.data.citations.map((citation) => (
                <li key={citation.number} className="rounded-md border p-3">
                  <div className="font-medium">
                    [{citation.number}] {citation.documentTitle}, page {citation.page}
                  </div>
                  <div className="text-muted-foreground">{citation.snippet}</div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
    </>
  );
}
