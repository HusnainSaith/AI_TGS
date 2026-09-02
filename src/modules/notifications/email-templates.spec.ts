import { escapeHtml, renderEmail } from './email-templates';
import { NotificationType } from './notification.types';

describe('email templates', () => {
  it('escapes user-controlled HTML and action URLs', () => {
    const rendered = renderEmail(
      NotificationType.SYSTEM,
      '<script>alert(1)</script>',
      '<img src=x onerror=alert(1)>',
      { actionUrl: 'https://example.test/?value=<unsafe>' },
      'teacher@example.test',
    );
    expect(rendered.html).not.toContain('<script>');
    expect(rendered.html).not.toContain('<img');
    expect(rendered.html).toContain('&lt;unsafe&gt;');
    expect(rendered.text).toContain('https://example.test/');
  });

  it('escapes all five HTML-sensitive characters', () => {
    expect(escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
});
