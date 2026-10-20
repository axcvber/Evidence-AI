'use client';

import type { Group } from '@evidence/shared';
import { Plus } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import { toast } from 'sonner';
import { ApiErrorAlert } from '@/components/api-error-alert';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { FormError } from '@/features/auth/auth-card';
import { Can } from '@/features/workspace/workspace-context';
import { formText } from '@/lib/form-data';
import { GroupSheet } from './group-sheet';
import { useCreateGroup, useGroups } from './queries';

function CreateGroupDialog() {
  const [open, setOpen] = useState(false);
  const create = useCreateGroup();

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const description = formText(form, 'description').trim();
    create.mutate(
      { name: formText(form, 'name'), ...(description && { description }) },
      {
        onSuccess: (group) => {
          toast.success(`Created ${group.name}`);
          setOpen(false);
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        create.reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus /> New group
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New group</DialogTitle>
          <DialogDescription>
            Groups let you share documents with many people at once.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-group-name">Name</Label>
            <Input id="new-group-name" name="name" required maxLength={80} placeholder="Legal" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-group-description">Description (optional)</Label>
            <Input id="new-group-description" name="description" maxLength={500} />
          </div>
          <FormError>{create.error instanceof Error ? create.error.message : ''}</FormError>
          <Button type="submit" disabled={create.isPending}>
            Create group
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function GroupsPage() {
  const groups = useGroups();
  const [openId, setOpenId] = useState<string | null>(null);
  const list: Group[] = groups.data?.pages.flatMap((page) => page.items) ?? [];
  // Looked up from the list so the sheet shows fresh counts after changes.
  const open = list.find((group) => group.id === openId) ?? null;

  return (
    <>
      <PageHeader
        title="Groups"
        description="Sets of members that documents can be shared with."
        actions={
          <Can capability="groups.manage">
            <CreateGroupDialog />
          </Can>
        }
      />
      {groups.error ? (
        <ApiErrorAlert error={groups.error} />
      ) : groups.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">No groups yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Members</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((group) => (
              <TableRow
                key={group.id}
                className="cursor-pointer"
                onClick={() => setOpenId(group.id)}
              >
                <TableCell className="font-medium">{group.name}</TableCell>
                <TableCell className="max-w-xs truncate text-muted-foreground">
                  {group.description}
                </TableCell>
                <TableCell className="text-right">{group.memberCount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {groups.hasNextPage && (
        <Button
          variant="outline"
          disabled={groups.isFetchingNextPage}
          onClick={() => void groups.fetchNextPage()}
        >
          Show more
        </Button>
      )}
      <GroupSheet group={open} onClose={() => setOpenId(null)} />
    </>
  );
}
