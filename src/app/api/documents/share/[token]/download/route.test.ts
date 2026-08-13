import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { prismaMocks, engineMocks } = vi.hoisted(() => ({
  prismaMocks: {
    documentShare: { findUnique: vi.fn() },
  },
  engineMocks: {
    extractBodyContent: vi.fn((html: string) => html),
    verifySharePassword: vi.fn(async (password: string) => password === 'secret'),
    recordShareDownload: vi.fn(),
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
});
