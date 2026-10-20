'use client';

import { Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ApiErrorAlert } from '@/components/api-error-alert';
import { MockNotice, PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useDeleteMockDocument,
  useMockDocuments,
  useUploadMockDocument,
} from '@/features/dev-mocks/queries';
import { Can, useCan } from '@/features/workspace/workspace-context';

function UploadDialog() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const upload = useUploadMockDocument();

  function submit() {
    upload.mutate(title, {
      onSuccess: (doc) => {
        toast.success(`"${doc.title}" uploaded (mock)`);
        setOpen(false);
        setTitle('');
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Upload /> Upload
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload a document</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        {upload.error && <ApiErrorAlert error={upload.error} capability="documents.upload" />}
        <DialogFooter>
          <Button onClick={submit} disabled={!title.trim() || upload.isPending}>
            Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DocumentsPage() {
  const documents = useMockDocuments();
  const remove = useDeleteMockDocument();
  const canDelete = useCan('documents.delete');

  return (
    <>
      <PageHeader
        title="Documents"
        description="Files your workspace can search and ask about."
        actions={
          <Can capability="documents.upload">
            <UploadDialog />
          </Can>
        }
      />
      <MockNotice phase="Phase 2 (ingestion)" />
      {documents.error && <ApiErrorAlert error={documents.error} capability="documents.read" />}
      {documents.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              {canDelete && <TableHead className="w-12" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(documents.data?.items ?? []).map((doc) => (
              <TableRow key={doc.id}>
                <TableCell className="font-medium">{doc.title}</TableCell>
                <TableCell className="uppercase">{doc.type}</TableCell>
                <TableCell>
                  <Badge variant={doc.status === 'ready' ? 'secondary' : 'outline'}>
                    {doc.status}
                  </Badge>
                </TableCell>
                {canDelete && (
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${doc.title}`}
                      onClick={() => {
                        remove.mutate(doc.id, {
                          onSuccess: () => toast.success(`"${doc.title}" deleted (mock)`),
                          onError: (error) => toast.error(error.message),
                        });
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
