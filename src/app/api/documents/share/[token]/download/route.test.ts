import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { prismaMocks, engineMocks } = vi.hoisted(() => ({
  prismaMocks: {
    documentShare: { findUnique: vi.fn() },
  },
  engineMocks: {
    extractBodyContent: vi.fn((html: string) => html),
    verifySharePassword: vi.fn(async (password: string) => password === 'secret'),
    // Defaults to a successful claim; individual tests override it to model a
    // share whose allowance was consumed by a concurrent request.
    recordShareDownload: vi.fn(async () => true),
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMocks }));
vi.mock('@/lib/engine/document-engine', () => ({
  DocumentEngine: {
    verifySharePassword: engineMocks.verifySharePassword,
    recordShareDownload: engineMocks.recordShareDownload,
  },
  extractBodyContent: engineMocks.extractBodyContent,
}));

import { POST } from './route';

const BASE_SHARE = {
  id: 'share_1',
  documentId: 'doc_1',
  shareType: 'LINK',
  recipient: null,
  token: 'tok_1',
  password: null,
  expiresAt: null,
  maxDownloads: null,
  downloadCount: 0,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  document: {
    id: 'doc_1',
    title: 'Offer Letter',
    htmlContent: '<html><body>Hello {{Name}}</body></html>',
    organizationId: 'org_1',
    deletedAt: null,
    status: 'DRAFT',
  },
};

function post(body: unknown): Promise<Response> {
  const request = new NextRequest(
    'http://localhost:3000/api/documents/share/tok_1/download',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  return POST(request, { params: Promise.resolve({ token: 'tok_1' }) });
}

describe('POST /api/documents/share/[token]/download', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // resetAllMocks clears implementations, so restore the defaults.
    engineMocks.extractBodyContent.mockImplementation((html: string) => html);
    engineMocks.verifySharePassword.mockImplementation(async (password: string) => password === 'secret');
    engineMocks.recordShareDownload.mockImplementation(async () => true);
    prismaMocks.documentShare.findUnique.mockResolvedValue(BASE_SHARE);
  });

  it('rejects a password-protected share download when no password is sent (the bypass)', async () => {
    prismaMocks.documentShare.findUnique.mockResolvedValue({
      ...BASE_SHARE,
      password: 'hashed:secret',
    });

    const res = await post({});
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      success: false,
      error: 'Password required to download this document',
      requiresPassword: true,
    });
    // The document must not be served, and the download count must not move
    expect(engineMocks.recordShareDownload).not.toHaveBeenCalled();
  });

  it('rejects a wrong password with 401', async () => {
    prismaMocks.documentShare.findUnique.mockResolvedValue({
      ...BASE_SHARE,
      password: 'hashed:secret',
    });

    const res = await post({ password: 'wrong' });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      success: false,
      error: 'Invalid password',
    });
    expect(engineMocks.verifySharePassword).toHaveBeenCalledWith('wrong', 'hashed:secret');
    expect(engineMocks.recordShareDownload).not.toHaveBeenCalled();
  });

  it('serves the download for a password-protected share given the correct password', async () => {
    prismaMocks.documentShare.findUnique.mockResolvedValue({
      ...BASE_SHARE,
      password: 'hashed:secret',
    });

    const res = await post({ password: 'secret' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(engineMocks.verifySharePassword).toHaveBeenCalledWith('secret', 'hashed:secret');
    expect(engineMocks.recordShareDownload).toHaveBeenCalledWith('tok_1');
  });

  it('still serves unprotected shares without a password (no regression)', async () => {
    const res = await post({});
    expect(res.status).toBe(200);
    expect(engineMocks.recordShareDownload).toHaveBeenCalledWith('tok_1');
  });

  it('still blocks expired shares', async () => {
    prismaMocks.documentShare.findUnique.mockResolvedValue({
      ...BASE_SHARE,
      expiresAt: new Date(Date.now() - 1000),
    });

    const res = await post({});
    expect(res.status).toBe(410);
    expect(engineMocks.recordShareDownload).not.toHaveBeenCalled();
  });

  it('serves nothing when the download allowance was consumed concurrently', async () => {
    // The counter is claimed atomically in the engine; if a parallel request
    // took the last slot this request must fail rather than serve anyway.
    engineMocks.recordShareDownload.mockImplementation(async () => false);

    const res = await post({});
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({
      success: false,
      error: 'Maximum downloads reached',
    });
  });

  // ─── Soft-delete defense ───

  describe('soft-deleted document defense', () => {
    beforeEach(() => {
      vi.resetAllMocks();
      engineMocks.extractBodyContent.mockImplementation((html: string) => html);
      engineMocks.verifySharePassword.mockImplementation(async (password: string) => password === 'secret');
      engineMocks.recordShareDownload.mockImplementation(async () => true);
      prismaMocks.documentShare.findUnique.mockResolvedValue(BASE_SHARE);
    });

    it('denies download when share document has deletedAt set', async () => {
      prismaMocks.documentShare.findUnique.mockResolvedValue({
        ...BASE_SHARE,
        document: { ...BASE_SHARE.document, deletedAt: new Date(), status: 'DRAFT' },
      });

      const res = await post({});
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({
        success: false,
        error: 'Share link not found or revoked',
      });
      expect(engineMocks.recordShareDownload).not.toHaveBeenCalled();
    });

    it('denies download when share document status is DELETED', async () => {
      prismaMocks.documentShare.findUnique.mockResolvedValue({
        ...BASE_SHARE,
        document: { ...BASE_SHARE.document, deletedAt: null, status: 'DELETED' },
      });

      const res = await post({});
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({
        success: false,
        error: 'Share link not found or revoked',
      });
      expect(engineMocks.recordShareDownload).not.toHaveBeenCalled();
    });

    it('allows download for active document + active share (no regression)', async () => {
      const res = await post({});
      expect(res.status).toBe(200);
      expect(engineMocks.recordShareDownload).toHaveBeenCalledWith('tok_1');
    });

    it('still blocks revoked share (independent of document status)', async () => {
      prismaMocks.documentShare.findUnique.mockResolvedValue({
        ...BASE_SHARE,
        isActive: false,
      });

      const res = await post({});
      expect(res.status).toBe(404);
      expect(engineMocks.recordShareDownload).not.toHaveBeenCalled();
    });
  });

  describe('XSS in the served HTML', () => {
    // The response is text/html from the DocMint origin with no sandbox, so
    // anything executable here runs for every anonymous holder of the token.
    async function serveHtml(htmlContent: string): Promise<string> {
      prismaMocks.documentShare.findUnique.mockResolvedValue({
        ...BASE_SHARE,
        document: { ...BASE_SHARE.document, htmlContent },
      });
      const res = await post({});
      expect(res.status).toBe(200);
      return res.text();
    }

    it('strips script elements and event handlers', async () => {
      const body = await serveHtml(
        '<body><p>ok</p><script>alert(1)</script><img src="x" onerror="alert(2)"></body>'
      );
      // The payload is gone. (The route still injects its own literal
      // onerror="this.style.display='none'" after sanitizing, which is
      // application-controlled and not an injection point.)
      expect(body).not.toContain('alert(1)');
      expect(body).not.toContain('alert(2)');
      expect(body).toContain('<p>ok</p>');
    });

    it('strips entity-encoded javascript: URLs', async () => {
      const body = await serveHtml('<body><a href="&#106;avascript:alert(1)">x</a></body>');
      expect(body).not.toContain('avascript:alert');
    });

    it('strips script smuggled inside an SVG data-URI image', async () => {
      // replaceSvgDataUris promotes this to LIVE inline <svg>; cleanSvgMarkup
      // is what makes that transformation safe.
      const evilSvg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
      const uri = `data:image/svg+xml;base64,${Buffer.from(evilSvg, 'utf-8').toString('base64')}`;
      const body = await serveHtml(`<body><img src="${uri}" alt="logo"></body>`);
      expect(body).not.toContain('alert(1)');
    });
  });
});
