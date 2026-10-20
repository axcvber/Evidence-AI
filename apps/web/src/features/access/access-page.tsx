'use client';

import type { Capability, DevMockName, EndpointDefinition } from '@evidence/shared';
import { can, capabilities, devMockCapabilities, devMocks } from '@evidence/shared';
import { Check, X } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useWorkspace } from '@/features/workspace/workspace-context';
import { isApiError } from '@/lib/api/api-error';
import { callEndpoint } from '@/lib/api/call-endpoint';

/**
 * A valid sample request per capability, sent to its dev-mock endpoint by "Try it". Capabilities
 * that are real features already (member management, renaming) are tried on their own pages.
 */
const samples: Partial<Record<Capability, { mock: DevMockName; input: object }>> = {
  'documents.read': { mock: 'listDocuments', input: { query: {} } },
  ask: { mock: 'ask', input: { body: { question: 'What is our leave policy?' } } },
  search: { mock: 'search', input: { query: { q: 'leave' } } },
  'documents.upload': { mock: 'uploadDocument', input: { body: { title: 'Q3 report' } } },
  'documents.delete': {
    mock: 'deleteDocument',
    input: { params: { documentId: '00000000-0000-4000-8000-00000000d0c0' } },
  },
  'members.invite': { mock: 'inviteMember', input: { body: { email: 'someone@example.test' } } },
  'groups.manage': { mock: 'createGroup', input: { body: { name: 'HR' } } },
  'evals.run': { mock: 'startEvalRun', input: {} },
  'usage.view': { mock: 'usage', input: {} },
  'workspace.delete': { mock: 'deleteWorkspace', input: {} },
};

type Outcome = { status: 'allowed' } | { status: 'refused'; code: string } | { status: 'error' };

function TryIt({ capability }: { capability: Capability }) {
  const sample = samples[capability];
  if (!sample) return <span className="text-xs text-muted-foreground">On its own page</span>;
  return <TryItButton sample={sample} />;
}

function TryItButton({ sample }: { sample: { mock: DevMockName; input: object } }) {
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function run() {
    try {
      const contract: EndpointDefinition = devMocks[sample.mock];
      await callEndpoint({ baseUrl: '' }, contract, sample.input as never);
      setOutcome({ status: 'allowed' });
    } catch (error) {
      setOutcome(
        isApiError(error) && error.status === 403
          ? { status: 'refused', code: error.code }
          : { status: 'error' },
      );
    }
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {outcome?.status === 'allowed' && <Badge variant="secondary">API: 200 allowed</Badge>}
      {outcome?.status === 'refused' && (
        <Badge variant="destructive">API: 403 {outcome.code}</Badge>
      )}
      {outcome?.status === 'error' && <Badge variant="outline">API error</Badge>}
      <Button size="sm" variant="outline" onClick={() => void run()}>
        Try it
      </Button>
    </div>
  );
}

export function AccessPage() {
  const { workspace, user } = useWorkspace();
  const rows = Object.entries(capabilities) as [Capability, (typeof capabilities)[Capability]][];

  return (
    <>
      <PageHeader
        title="Access"
        description="What your role can do here. “Try it” asks the API, which makes the real decision."
      />
      <Card>
        <CardHeader>
          <CardTitle className="capitalize">{workspace.role}</CardTitle>
          <CardDescription>
            {user.email} in {workspace.name}. Roles rank owner › admin › editor › viewer; each role
            can do everything the roles below it can.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Capability</TableHead>
                <TableHead>Needs</TableHead>
                <TableHead>You</TableHead>
                <TableHead className="text-right">Check with the API</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(([id, capability]) => (
                <TableRow key={id}>
                  <TableCell className="font-medium">{capability.label}</TableCell>
                  <TableCell className="capitalize">{capability.minRole}+</TableCell>
                  <TableCell>
                    {can(workspace.role, id) ? (
                      <Check className="size-4 text-green-600" aria-label="allowed" />
                    ) : (
                      <X className="size-4 text-muted-foreground" aria-label="not allowed" />
                    )}
                  </TableCell>
                  <TableCell>
                    <TryIt capability={id} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

// Every capability must have a sample, and it must hit the mock for that capability.
for (const [capability, sample] of Object.entries(samples)) {
  if (devMockCapabilities[sample.mock] !== capability) {
    throw new Error(`Access sample for ${capability} calls the wrong mock (${sample.mock})`);
  }
}
