import { EmailMessage } from '../email/email-sender.js';

// Names and workspace titles are user input, so they are escaped before going into HTML.
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function layout(paragraphs: string[], action: { label: string; url: string }): string {
  const body = paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('');
  return `${body}<p><a href="${escapeHtml(action.url)}">${escapeHtml(action.label)}</a></p>`;
}

export function verificationEmail(to: string, name: string, url: string): EmailMessage {
  const lines = [`Hi ${name},`, 'Confirm your email address to finish setting up Evidence AI.'];
  return {
    to,
    subject: 'Confirm your email for Evidence AI',
    text: `${lines.join('\n\n')}\n\n${url}\n\nIf you didn't sign up, you can ignore this email.`,
    html: layout([...lines, "If you didn't sign up, you can ignore this email."], {
      label: 'Confirm email',
      url,
    }),
  };
}

export function invitationEmail(params: {
  to: string;
  inviterName: string;
  workspaceName: string;
  role: string;
  url: string;
}): EmailMessage {
  const { to, inviterName, workspaceName, role, url } = params;
  const lines = [`${inviterName} invited you to join ${workspaceName} on Evidence AI as ${role}.`];
  return {
    to,
    subject: `Join ${workspaceName} on Evidence AI`,
    text: `${lines.join('\n\n')}\n\n${url}`,
    html: layout(lines, { label: 'Accept invitation', url }),
  };
}

/** Paragraphs, an optional button, then an optional closing notice. */
function message(params: {
  to: string;
  subject: string;
  lines: string[];
  action?: { label: string; url: string };
  notice?: string;
}): EmailMessage {
  const { to, subject, lines, action, notice } = params;
  const paragraphs = (values: string[]) => values.map((p) => `<p>${escapeHtml(p)}</p>`).join('');
  return {
    to,
    subject,
    text: [lines.join('\n\n'), action?.url, notice].filter(Boolean).join('\n\n'),
    html:
      (action ? layout(lines, action) : paragraphs(lines)) + (notice ? paragraphs([notice]) : ''),
  };
}

export function resetPasswordEmail(to: string, name: string, url: string): EmailMessage {
  return message({
    to,
    subject: 'Reset your Evidence AI password',
    lines: [
      `Hi ${name},`,
      'Use this link to choose a new password. It works once, within an hour.',
    ],
    action: { label: 'Reset password', url },
    notice: "If you didn't ask for this, ignore this email: your password stays the same.",
  });
}

export function passwordChangedEmail(to: string, name: string): EmailMessage {
  return message({
    to,
    subject: 'Your Evidence AI password was changed',
    lines: [`Hi ${name},`, 'The password for your Evidence AI account was just changed.'],
    notice:
      "If this wasn't you, reset your password right away from the sign-in page and review your active sessions.",
  });
}

/** Sent to the current address, which must approve the change before the new one is verified. */
export function changeEmailApprovalEmail(params: {
  to: string;
  name: string;
  newEmail: string;
  url: string;
}): EmailMessage {
  const { to, name, newEmail, url } = params;
  return message({
    to,
    subject: 'Approve your new Evidence AI email address',
    lines: [
      `Hi ${name},`,
      `Someone signed in to your account asked to change its email to ${newEmail}.`,
      'Approve the change and we will send a confirmation link to the new address.',
    ],
    action: { label: 'Approve change', url },
    notice: "If this wasn't you, don't approve it: change your password and review your sessions.",
  });
}

export function deleteAccountEmail(to: string, name: string, url: string): EmailMessage {
  return message({
    to,
    subject: 'Confirm deleting your Evidence AI account',
    lines: [
      `Hi ${name},`,
      'Open this link while signed in to permanently delete your account. This cannot be undone.',
    ],
    action: { label: 'Delete my account', url },
    notice: "If you didn't ask for this, ignore this email and your account stays as it is.",
  });
}

/** Sign-up answers the same way for new and existing emails; the real owner gets this instead. */
export function existingAccountEmail(to: string, name: string, signInUrl: string): EmailMessage {
  return message({
    to,
    subject: 'You already have an Evidence AI account',
    lines: [
      `Hi ${name},`,
      'Someone tried to create an account with this email address, but you already have one.',
      'If it was you, sign in, or reset your password from the sign-in page.',
    ],
    action: { label: 'Sign in', url: signInUrl },
    notice: "If it wasn't you, you can ignore this email.",
  });
}
