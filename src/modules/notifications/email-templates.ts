import { EmailMessage } from '../../infrastructure/providers/provider.contracts';
import { NotificationType } from './notification.types';
export const escapeHtml = (value: string) =>
  value.replace(
    /[&<>'"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]!,
  );
export function renderEmail(
  type: NotificationType,
  title: string,
  message: string,
  metadata: Record<string, unknown>,
  to: string,
): EmailMessage {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  const actionUrl = typeof metadata.actionUrl === 'string' ? metadata.actionUrl : undefined;
  const link = actionUrl ? `<p><a href="${escapeHtml(actionUrl)}">Open securely</a></p>` : '';
  return {
    to,
    subject: title,
    text: `${message}${actionUrl ? `\n\n${actionUrl}` : ''}`,
    html: `<!doctype html><html><body><h1>${safeTitle}</h1><p>${safeMessage}</p>${link}<p>This is an automated ${escapeHtml(type.toLowerCase().replaceAll('_', ' '))} notification.</p></body></html>`,
  };
}
