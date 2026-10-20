'use client';

import { Play } from 'lucide-react';
import { toast } from 'sonner';
import { ApiErrorAlert, RoleRequired } from '@/components/api-error-alert';
import { MockNotice, PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useMockEvalRuns, useStartMockEvalRun } from '@/features/dev-mocks/queries';
import { useCan } from '@/features/workspace/workspace-context';

export function EvalsPage() {
  const allowed = useCan('evals.run');
  const runs = useMockEvalRuns(allowed);
  const start = useStartMockEvalRun();

  if (!allowed) return <RoleRequired capability="evals.run" />;
  return (
    <>
      <PageHeader
        title="Evals"
        description="Measure retrieval and answer quality."
        actions={
          <Button
            onClick={() => {
              start.mutate(undefined, {
                onSuccess: (run) => toast.success(`Started "${run.name}" (mock)`),
                onError: (error) => toast.error(error.message),
              });
            }}
          >
            <Play /> Run eval
          </Button>
        }
      />
      <MockNotice phase="Phase 4 (evals)" />
      {runs.error && <ApiErrorAlert error={runs.error} capability="evals.run" />}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Run</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Recall@10</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(runs.data?.items ?? []).map((run) => (
            <TableRow key={run.id}>
              <TableCell className="font-medium">{run.name}</TableCell>
              <TableCell>
                <Badge variant="secondary">{run.status}</Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {run.recallAt10 === null ? '–' : run.recallAt10.toFixed(2)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
