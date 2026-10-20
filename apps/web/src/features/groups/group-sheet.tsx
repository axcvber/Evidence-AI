'use client';

import type { Group } from '@evidence/shared';
import { useState, type SubmitEvent } from 'react';
import { toast } from 'sonner';
import { ConfirmButton } from '@/components/confirm-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { FormError } from '@/features/auth/auth-card';
import { useCan } from '@/features/workspace/workspace-context';
import { authClient } from '@/lib/auth-client';
import { formText } from '@/lib/form-data';
import {
  useAddGroupMember,
  useDeleteGroup,
  useGroupMembers,
  useRemoveGroupMember,
  useUpdateGroup,
} from './queries';

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'That did not work';

function EditGroupForm({ group }: { group: Group }) {
  const update = useUpdateGroup(group.id);

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const description = formText(form, 'description').trim();
    update.mutate(
      { name: formText(form, 'name'), description: description || null },
      { onSuccess: () => toast.success('Group saved') },
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="group-name">Name</Label>
        <Input id="group-name" name="name" defaultValue={group.name} required maxLength={80} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="group-description">Description</Label>
        <Textarea
          id="group-description"
          name="description"
          defaultValue={group.description ?? ''}
          maxLength={500}
        />
      </div>
      <FormError>{update.error ? errorMessage(update.error) : ''}</FormError>
      <Button type="submit" variant="outline" size="sm" disabled={update.isPending}>
        Save
      </Button>
    </form>
  );
}

/** Workspace members who aren't in the group yet, to pick from. */
function AddMember({ groupId, memberIds }: { groupId: string; memberIds: Set<string> }) {
  const { data: workspace } = authClient.useActiveOrganization();
  const add = useAddGroupMember(groupId);
  const [userId, setUserId] = useState('');
  const candidates = (workspace?.members ?? []).filter((m) => !memberIds.has(m.userId));

  if (candidates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Everyone in the workspace is in this group.</p>
    );
  }
  return (
    <div className="flex gap-2">
      <Select value={userId} onValueChange={setUserId}>
        <SelectTrigger className="flex-1">
          <SelectValue placeholder="Add a member" />
        </SelectTrigger>
        <SelectContent>
          {candidates.map((m) => (
            <SelectItem key={m.userId} value={m.userId}>
              {m.user.name} ({m.user.email})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        disabled={!userId || add.isPending}
        onClick={() =>
          add.mutate(userId, {
            onSuccess: () => setUserId(''),
            onError: (error) => toast.error(errorMessage(error)),
          })
        }
      >
        Add
      </Button>
    </div>
  );
}

function GroupMembers({ group }: { group: Group }) {
  const canManage = useCan('groups.manage');
  const members = useGroupMembers(group.id);
  const remove = useRemoveGroupMember(group.id);
  const list = members.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">Members</h3>
      {canManage && <AddMember groupId={group.id} memberIds={new Set(list.map((m) => m.userId))} />}
      {members.isPending ? (
        <Skeleton className="h-20 w-full" />
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">No one is in this group yet.</p>
      ) : (
        <ul className="divide-y text-sm">
          {list.map((member) => (
            <li key={member.userId} className="flex items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <div className="truncate font-medium">{member.name}</div>
                <div className="truncate text-muted-foreground">{member.email}</div>
              </div>
              {canManage && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={remove.isPending}
                  onClick={() =>
                    remove.mutate(member.userId, {
                      onError: (error) => toast.error(errorMessage(error)),
                    })
                  }
                >
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {members.hasNextPage && (
        <Button
          variant="outline"
          size="sm"
          disabled={members.isFetchingNextPage}
          onClick={() => void members.fetchNextPage()}
        >
          Show more
        </Button>
      )}
    </div>
  );
}

export function GroupSheet({ group, onClose }: { group: Group | null; onClose: () => void }) {
  const canManage = useCan('groups.manage');
  const deleteGroup = useDeleteGroup();

  return (
    <Sheet open={group !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {group && (
          <div className="space-y-6 p-4">
            <SheetHeader className="p-0">
              <SheetTitle>{group.name}</SheetTitle>
              <SheetDescription>{group.description ?? 'No description'}</SheetDescription>
            </SheetHeader>
            {canManage && <EditGroupForm key={group.id} group={group} />}
            <GroupMembers group={group} />
            {canManage && (
              <ConfirmButton
                title={`Delete ${group.name}?`}
                description="People in it stay in the workspace. Documents shared with this group will no longer be shared through it."
                confirmLabel="Delete group"
                variant="destructive"
                onConfirm={async () => {
                  try {
                    await deleteGroup.mutateAsync(group.id);
                    toast.success('Group deleted');
                    onClose();
                    return true;
                  } catch (error) {
                    toast.error(errorMessage(error));
                    return false;
                  }
                }}
              >
                Delete group
              </ConfirmButton>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
