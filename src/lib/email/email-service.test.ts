import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The enquiry email is rendered into the support team's mail client, and the
 * share email into a recipient's. Every interpolated field there is
 * attacker-controlled, so these tests pin the escaping that keeps markup from
 * becoming live content.
 */
const { fetchMock } = vi.hoisted(() => {
  // `EmailService.send` short-circuits with a warning when the API key is
  // absent, and it is captured into a static class field at import time — so
  // both the stub and the env var must be installed before the module loads.
  process.env.RESEND_API_KEY = 'test-key';
  return { fetchMock: vi.fn() };
});

vi.stubGlobal('fetch', fetchMock);

import { EmailService } from './email-service';

/** Pull the single request body handed to the Resend API. */
function sentPayload(): { subject: string; html: string; text?: string } {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  return JSON.parse(fetchMock.mock.calls[0][1].body);
}

describe('EmailService.sendContactEnquiry', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('escapes markup in the name', async () => {
    await EmailService.sendContactEnquiry({
      name: '<img src=x onerror=alert(1)>',
      email: 'a@b.com',
      subject: '',
      message: 'hello there friend',
    });
    const { html } = sentPayload();
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('escapes markup in the message body', async () => {
    await EmailService.sendContactEnquiry({
      name: 'Alice',
      email: 'a@b.com',
      subject: '',
      message: '<script>alert(document.cookie)</script> please help',
    });
    const { html } = sentPayload();
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('strips CR/LF from the subject line to block mail-header injection', async () => {
    await EmailService.sendContactEnquiry({
      name: 'Alice',
      email: 'a@b.com',
      subject: 'Hi\r\nBcc: victim@elsewhere.test',
      message: 'hello there friend',
    });
    const { subject } = sentPayload();
    // A bare CR/LF in a subject can be folded into extra SMTP headers.
    expect(subject).not.toMatch(/[\r\n]/);
    expect(subject).not.toContain('Bcc: victim@elsewhere.test\r\n');
  });

  it('does not let a subject smuggle a raw Bcc header', async () => {
    await EmailService.sendContactEnquiry({
      name: 'Alice',
      email: 'a@b.com',
      subject: 'x\nBcc: attacker@evil.test',
      message: 'hello there friend',
    });
    const { subject } = sentPayload();
    expect(subject.split('\n')).toHaveLength(1);
  });

  it('escapes a javascript: URI in the mailto href', async () => {
    await EmailService.sendContactEnquiry({
      name: 'Alice',
      // The route validates the shape, but the sink must not trust its caller.
      email: '"><script>alert(1)</script>',
      subject: '',
      message: 'hello there friend',
    });
    const { html } = sentPayload();
    expect(html).not.toContain('<script>');
  });
});

describe('EmailService.sendDocumentShareEmail', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('escapes markup in the sender display name', async () => {
    await EmailService.sendDocumentShareEmail(
      'victim@target.test',
      'Q3 report',
      'https://docmint.test/share/abc',
      '<img src=x onerror=alert(1)>'
    );
    const { html } = sentPayload();
    expect(html).not.toContain('<img src=x');
  });

  it('escapes markup in the document title', async () => {
    await EmailService.sendDocumentShareEmail(
      'victim@target.test',
      '<svg onload=alert(1)>',
      'https://docmint.test/share/abc',
      'Alice'
    );
    const { html } = sentPayload();
    expect(html).not.toContain('<svg onload');
  });

  it('refuses a javascript: share link', async () => {
    await EmailService.sendDocumentShareEmail(
      'victim@target.test',
      'Q3 report',
      'javascript:alert(document.cookie)',
      'Alice'
    );
    const { html } = sentPayload();
    // The href must degrade to a dead value, never carry a live script URI.
    expect(html).not.toContain('javascript:');
    expect(html).toContain('href="#"');
  });

  it('refuses a data: share link', async () => {
    await EmailService.sendDocumentShareEmail(
      'victim@target.test',
      'Q3 report',
      'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      'Alice'
    );
    const { html } = sentPayload();
    expect(html).toContain('href="#"');
  });

  it('keeps a legitimate https share link intact', async () => {
    await EmailService.sendDocumentShareEmail(
      'victim@target.test',
      'Q3 report',
      'https://docmint.test/share/abc123',
      'Alice'
    );
    const { html } = sentPayload();
    expect(html).toContain('https://docmint.test/share/abc123');
  });
});

describe('EmailService.sendPasswordResetEmail', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('refuses a javascript: reset link', async () => {
    await EmailService.sendPasswordResetEmail('a@b.com', 'javascript:alert(1)');
    const { html } = sentPayload();
    expect(html).not.toContain('javascript:');
    expect(html).toContain('href="#"');
  });

  it('keeps a legitimate https reset link intact', async () => {
    await EmailService.sendPasswordResetEmail('a@b.com', 'https://docmint.test/reset?token=abc');
    const { html } = sentPayload();
    expect(html).toContain('https://docmint.test/reset?token=abc');
  });
});
