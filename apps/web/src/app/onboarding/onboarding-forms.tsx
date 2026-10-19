'use client';

import type { WorkspaceRole } from '@evidence/shared';
import { useRouter } from 'next/navigation';
import { SubmitEvent, useState } from 'react';
import { Button, ErrorText, Field } from '../../components/ui';
import { formText } from '../../lib/form-data';
import { authClient } from '../../lib/auth-client';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export function CreateWorkspaceForm() {
  const router = useRouter();
  const [error, setError] = useState('');

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = formText(new FormData(event.currentTarget), 'name');
    const { error } = await authClient.organization.create({ name, slug: slugify(name) });
    if (error) setError(error.message ?? 'Could not create the workspace');
    else router.refresh();
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
      <Field label="Workspace name" name="name" required maxLength={100} />
      <ErrorText>{error}</ErrorText>
      <Button type="submit">Create workspace</Button>
    </form>
  );
}

export function InviteForm() {
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const email = formText(form, 'email');
    const role = formText(form, 'role') as Exclude<WorkspaceRole, 'owner'>;
    setError('');
    const { error } = await authClient.organization.inviteMember({ email, role });
    if (error) {
      setError(error.message ?? 'Could not send the invitation');
      return;
    }
    setSentTo(email);
    formElement.reset();
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
      <Field label="Teammate's email" name="email" type="email" required />
      <label className="flex flex-col gap-1 text-sm font-medium">
        Role
        <select
          name="role"
          defaultValue="viewer"
          className="rounded-md border border-zinc-300 px-3 py-2"
        >
          <option value="viewer">Viewer</option>
          <option value="editor">Editor</option>
          <option value="admin">Admin</option>
        </select>
      </label>
      <ErrorText>{error}</ErrorText>
      {sentTo && <p className="text-sm text-green-700">Invitation sent to {sentTo}.</p>}
      <Button type="submit">Send invitation</Button>
    </form>
  );
}
