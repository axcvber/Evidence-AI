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
