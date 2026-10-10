import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import type { CompanyProfileData } from '@/types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/prisma', () => ({
  prisma: {
    document: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    documentVersion: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    documentShare: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/utils/image-placeholders', () => ({
  PLACEHOLDER_IMAGES: {
    logo: 'data:image/svg+xml;base64,LOGO',
    seal: 'data:image/svg+xml;base64,SEAL',
    signature: 'data:image/svg+xml;base64,SIGNATURE',
    photo: 'data:image/svg+xml;base64,PHOTO',
  },
  replaceSvgDataUris: (html: string) => html,
  getDefaultImageForPlaceholder: (key: string) => `data:image/svg+xml;base64,${key.toUpperCase()}`,
  isImagePlaceholder: (key: string) =>
    ['logo', 'photo', 'picture', 'signature', 'seal', 'stamp', 'image', 'qr', 'barcode']
      .some((kw) => key.toLowerCase().includes(kw)),
  isValidImageSource: (value: string) =>
    !!value && (value.startsWith('data:') || value.startsWith('http://') ||
      value.startsWith('https://') || value.startsWith('blob:')),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { wrapStyledHtml, DocumentEngine, sanitizeDocumentHtml, truncateSampleBody } from './document-engine';
import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockDocument = {
  id: 'doc-1',
  organizationId: 'org-1',
  userId: 'user-1',
  title: 'Test Document',
  description: 'A test',
  documentType: 'letter',
  categoryId: null,
  folderId: null,
  content: {},
  variables: {},
  status: 'DRAFT',
  isFavorite: false,
  isArchived: false,
  isTemplate: false,
  tags: [],
  version: 1,
  lastEditedAt: null,
  deletedAt: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

const mockShare = {
  id: 'share-1',
  token: 'abc123token',
  shareType: 'LINK',
  recipient: null,
  password: null,
  expiresAt: null,
  maxDownloads: null,
  downloadCount: 0,
  isActive: true,
  documentId: 'doc-1',
  createdAt: new Date('2024-01-01'),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('wrapStyledHtml', () => {
  it('should wrap html in a styled document', () => {
    const result = wrapStyledHtml('<p>Content</p>');
    expect(result).toContain('<!DOCTYPE html>');
    expect(result).toContain('<p>Content</p>');
    expect(result).toContain('page-content');
    expect(result).toContain('</html>');
  });

  it('should include A4 page styling', () => {
    const result = wrapStyledHtml('');
    expect(result).toContain('max-width:210mm');
    expect(result).toContain('min-height:297mm');
    expect(result).toContain('padding:12.7mm');
  });
});

// ---------------------------------------------------------------------------
// DocumentEngine
// ---------------------------------------------------------------------------

describe('DocumentEngine', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── create ──────────────────────────────────────────────

  describe('create', () => {
    const input = {
      title: 'New Doc',
      description: 'Desc',
      documentType: 'letter',
    };

    it('should create a document with initial version and audit log', async () => {
      (prisma.document.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockDocument);
      (prisma.documentVersion.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
      (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const result = await DocumentEngine.create(input, 'org-1', 'user-1');

      expect(prisma.document.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-1',
          userId: 'user-1',
          title: 'New Doc',
          documentType: 'letter',
          status: 'DRAFT',
          version: 1,
        }),
      });
      expect(prisma.documentVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          documentId: 'doc-1',
          userId: 'user-1',
          version: 1,
          changeNote: 'Initial version',
        }),
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-1',
          userId: 'user-1',
          action: 'DOCUMENT_CREATED',
          entityId: 'doc-1',
        }),
      });
      expect(result).toEqual(mockDocument);
    });

    it('should default content and variables to empty objects', async () => {
      (prisma.document.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockDocument);
      (prisma.documentVersion.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
      (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await DocumentEngine.create(input, 'org-1', 'user-1');

      expect(prisma.document.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          content: {},
          variables: {},
        }),
      });
    });
  });

  // ─── update ──────────────────────────────────────────────

  describe('update', () => {
    it('should update existing document and create version snapshot', async () => {
      (prisma.document.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockDocument);
      (prisma.document.update as ReturnType<typeof vi.fn>).mockResolvedValue({ ...mockDocument, version: 2 });
      (prisma.documentVersion.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const result = await DocumentEngine.update('doc-1', { title: 'Updated' }, 'org-1', 'user-1');

      expect(prisma.document.findFirst).toHaveBeenCalledWith({
        where: { id: 'doc-1', organizationId: 'org-1' },
      });
      expect(result.version).toBe(2);
      expect(prisma.documentVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          documentId: 'doc-1',
          userId: 'user-1',
          version: 2,
          changeNote: 'Updated',
        }),
      });
    });

    it('should throw when document is not found', async () => {
      (prisma.document.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        DocumentEngine.update('non-existent', { title: 'Nope' }, 'org-1', 'user-1')
      ).rejects.toThrow('Document not found');
    });

    /**
     * Regression: the write used to spread the parsed request body straight
     * into Prisma `data`. `Prisma.DocumentUpdateInput` is a union that includes
     * `DocumentUncheckedUpdateInput`, which accepts `organizationId` and
     * `userId`, and the TypeScript annotation is erased at runtime — so any
     * signed-in user could re-parent their own document into another tenant
     * with one PATCH. The scoping check only validated the row's CURRENT owner.
     */
    describe('ownership column allowlist', () => {
      beforeEach(() => {
        (prisma.document.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockDocument);
        (prisma.document.update as ReturnType<typeof vi.fn>).mockResolvedValue({ ...mockDocument, version: 2 });
        (prisma.documentVersion.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
      });

      const writtenData = () =>
        (prisma.document.update as ReturnType<typeof vi.fn>).mock.calls[0][0].data as Record<string, unknown>;

      it('does not let a caller re-parent a document into another organization', async () => {
        await DocumentEngine.update(
          'doc-1',
          { title: 'x', organizationId: 'org_VICTIM' } as never,
          'org-1',
          'user-1'
        );

        expect(writtenData().organizationId).toBeUndefined();
      });

      it('does not let a caller reassign the document to another user', async () => {
        await DocumentEngine.update(
          'doc-1',
          { title: 'x', userId: 'user_VICTIM' } as never,
          'org-1',
          'user-1'
        );

        expect(writtenData().userId).toBeUndefined();
      });

      it('ignores every ownership and lifecycle column a caller might inject', async () => {
        await DocumentEngine.update(
          'doc-1',
          {
            title: 'legit',
            organizationId: 'org_EVIL',
            userId: 'user_EVIL',
            id: 'doc-hijacked',
            createdAt: new Date('1999-01-01'),
            deletedAt: null,
            password: 'x',
            version: 9999,
            isTemplate: true,
          } as never,
          'org-1',
          'user-1'
        );

        const data = writtenData();
        for (const forbidden of [
          'organizationId',
          'userId',
          'id',
          'createdAt',
          'deletedAt',
          'password',
          'isTemplate',
        ]) {
          expect(data[forbidden], forbidden).toBeUndefined();
        }
        // Server-controlled fields must still be applied.
        expect(data.title).toBe('legit');
        expect(data.version).toBe(mockDocument.version + 1);
      });

      it('still allows the legitimate editable columns through', async () => {
        await DocumentEngine.update(
          'doc-1',
          {
            title: 'New title',
            description: 'desc',
            htmlContent: '<p>hi</p>',
            status: 'COMPLETED',
            isFavorite: true,
            tags: ['a'],
          } as never,
          'org-1',
          'user-1'
        );

        const data = writtenData();
        expect(data.title).toBe('New title');
        expect(data.description).toBe('desc');
        expect(data.htmlContent).toBe('<p>hi</p>');
        expect(data.status).toBe('COMPLETED');
        expect(data.isFavorite).toBe(true);
        expect(data.tags).toEqual(['a']);
      });
    });
  });

  // ─── getById ─────────────────────────────────────────────

  describe('getById', () => {
    it('should return document with latest version', async () => {
      const docWithVersions = { ...mockDocument, versions: [{ version: 2, content: {} }] };
      (prisma.document.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(docWithVersions);

      const result = await DocumentEngine.getById('doc-1', 'org-1');

      expect(prisma.document.findFirst).toHaveBeenCalledWith({
        where: { id: 'doc-1', organizationId: 'org-1' },
        include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
      });
      expect(result).toEqual(docWithVersions);
    });

    it('should return null when not found', async () => {
      (prisma.document.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await DocumentEngine.getById('non-existent', 'org-1');

      expect(result).toBeNull();
    });
  });

  // ─── list ────────────────────────────────────────────────

  describe('list', () => {
    it('should list documents with tenant isolation and default filters', async () => {
      (prisma.document.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([mockDocument]);
      (prisma.document.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

      const result = await DocumentEngine.list('org-1', 'user-1', {});

      expect(prisma.document.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', userId: 'user-1', deletedAt: null },
        orderBy: { updatedAt: 'desc' },
        skip: 0,
        take: 20,
        include: {
          category: { select: { name: true, slug: true } },
          folder: { select: { name: true } },
        },
      });
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
    });

    it('should apply filters when provided', async () => {
      (prisma.document.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([mockDocument]);
      (prisma.document.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

      await DocumentEngine.list('org-1', 'user-1', {
        status: 'DRAFT',
        categoryId: 'cat-1',
        folderId: 'folder-1',
        isFavorite: true,
        isArchived: false,
        search: 'test',
        tags: ['important'],
        page: 2,
        pageSize: 10,
        sortBy: 'title',
        sortOrder: 'asc',
      });

      expect(prisma.document.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          userId: 'user-1',
          deletedAt: null,
          status: 'DRAFT',
          categoryId: 'cat-1',
          folderId: 'folder-1',
          isFavorite: true,
          isArchived: false,
          title: { contains: 'test', mode: 'insensitive' },
          tags: { hasSome: ['important'] },
        },
        orderBy: { title: 'asc' },
        skip: 10,
        take: 10,
        include: {
          category: { select: { name: true, slug: true } },
          folder: { select: { name: true } },
        },
      });
    });
  });

  // ─── delete ──────────────────────────────────────────────

  describe('delete', () => {
    it('should soft delete document and create audit log', async () => {
      (prisma.document.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockDocument);
      (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn) => fn(prisma));
      (prisma.document.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
      (prisma.documentShare.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 });
      (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await DocumentEngine.delete('doc-1', 'org-1', 'user-1');

      expect(prisma.document.update).toHaveBeenCalledWith({
        where: { id: 'doc-1' },
        data: { deletedAt: expect.any(Date), status: 'DELETED' },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'DOCUMENT_DELETED',
          entityId: 'doc-1',
        }),
      });
    });

    it('should throw when document not found', async () => {
      (prisma.document.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        DocumentEngine.delete('non-existent', 'org-1', 'user-1')
      ).rejects.toThrow('Document not found or access denied');
    });
  });

  // ─── delete soft-deletes shares ──────────────────────────────

  describe('delete deactivates shares', () => {
    it('should deactivate active shares in a transaction when soft-deleting a document', async () => {
      const mockDoc = { ...mockDocument, id: 'doc-1' };
      (prisma.document.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockDoc);
      (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn) => fn(prisma));
      (prisma.document.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
      (prisma.documentShare.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 2 });
      (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await DocumentEngine.delete('doc-1', 'org-1', 'user-1');

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.document.update).toHaveBeenCalledWith({
        where: { id: 'doc-1' },
        data: { deletedAt: expect.any(Date), status: 'DELETED' },
      });
      expect(prisma.documentShare.updateMany).toHaveBeenCalledWith({
        where: { documentId: 'doc-1', isActive: true },
        data: { isActive: false },
      });
    });

    it('should not deactivate already-inactive shares', async () => {
      const mockDoc = { ...mockDocument, id: 'doc-2' };
      (prisma.document.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockDoc);
      (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn) => fn(prisma));
      (prisma.document.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
      (prisma.documentShare.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 });
      (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await DocumentEngine.delete('doc-2', 'org-1', 'user-1');

      // updateMany called with isActive: true filter — zero affected is expected
      expect(prisma.documentShare.updateMany).toHaveBeenCalledWith({
        where: { documentId: 'doc-2', isActive: true },
        data: { isActive: false },
      });
    });
  });

  // ─── getSharedDocument soft-delete defense ──────────────────

  describe('getSharedDocument soft-delete defense', () => {
    const sharedDoc = { id: 'doc-1', title: 'Shared Doc', deletedAt: null, status: 'DRAFT' };
    const activeShare = { ...mockShare, document: sharedDoc };

    it('returns document when document is active (no deletedAt, status DRAFT)', async () => {
      (prisma.documentShare.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(activeShare);

      const result = await DocumentEngine.getSharedDocument('valid-token');

      expect(result.success).toBe(true);
    });

    it('denies access when document has deletedAt set', async () => {
      (prisma.documentShare.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...activeShare,
        document: { ...sharedDoc, deletedAt: new Date(), status: 'DRAFT' },
      });

      const result = await DocumentEngine.getSharedDocument('valid-token');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Share link not found');
    });

    it('denies access when document status is DELETED', async () => {
      (prisma.documentShare.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...activeShare,
        document: { ...sharedDoc, deletedAt: null, status: 'DELETED' },
      });

      const result = await DocumentEngine.getSharedDocument('valid-token');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Share link not found');
    });

    it('denies access when document is missing (defensive)', async () => {
      (prisma.documentShare.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...activeShare,
        document: null,
      });

      const result = await DocumentEngine.getSharedDocument('valid-token');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Share link not found');
    });

    it('preserves expired-share behavior (still returns expired error)', async () => {
      (prisma.documentShare.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...activeShare,
        expiresAt: new Date('2020-01-01'),
      });

      const result = await DocumentEngine.getSharedDocument('expired-token');

      expect(result.success).toBe(false);
      expect(result.error).toBe('This share link has expired');
    });

    it('preserves password-protected share behavior', async () => {
      const hash = await DocumentEngine.hashSharePassword('secret');
      (prisma.documentShare.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...activeShare,
        password: hash,
      });

      const result = await DocumentEngine.getSharedDocument('pw-protected', 'secret');

      expect(result.success).toBe(true);
    });

    it('preserves revoked-share behavior (still returns revoked error)', async () => {
      (prisma.documentShare.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...activeShare,
        isActive: false,
      });

      const result = await DocumentEngine.getSharedDocument('revoked-token');

      expect(result.success).toBe(false);
      expect(result.error).toBe('This share link has been revoked');
    });
  });

  // ─── restore ─────────────────────────────────────────────

  describe('restore', () => {
    it('should restore deleted document', async () => {
      (prisma.document.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await DocumentEngine.restore('doc-1', 'org-1');

      expect(prisma.document.update).toHaveBeenCalledWith({
        where: { id: 'doc-1', organizationId: 'org-1' },
        data: { deletedAt: null, status: 'DRAFT' },
      });
    });
  });

  // ─── duplicate ───────────────────────────────────────────

  describe('duplicate', () => {
    it('should duplicate document with "(Copy)" suffix', async () => {
      const original = { ...mockDocument, title: 'Original', description: 'Desc', documentType: 'letter' };
      (prisma.document.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(original);
      (prisma.document.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockDocument);
      (prisma.documentVersion.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
      (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await DocumentEngine.duplicate('doc-1', 'org-1', 'user-2');

      expect(prisma.document.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: 'Original (Copy)',
          organizationId: 'org-1',
          userId: 'user-2',
        }),
      });
    });

    it('should throw when original not found', async () => {
      (prisma.document.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        DocumentEngine.duplicate('non-existent', 'org-1', 'user-1')
      ).rejects.toThrow('Document not found');
    });
  });

  // ─── toggleFavorite ──────────────────────────────────────

  describe('toggleFavorite', () => {
    it('should toggle favorite from false to true', async () => {
      (prisma.document.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ isFavorite: false });
      (prisma.document.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const result = await DocumentEngine.toggleFavorite('doc-1', 'org-1');

      expect(result).toBe(true);
      expect(prisma.document.update).toHaveBeenCalledWith({
        where: { id: 'doc-1' },
        data: { isFavorite: true },
      });
    });

    it('should toggle favorite from true to false', async () => {
      (prisma.document.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ isFavorite: true });
      (prisma.document.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const result = await DocumentEngine.toggleFavorite('doc-1', 'org-1');

      expect(result).toBe(false);
    });

    it('should throw when document not found', async () => {
      (prisma.document.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        DocumentEngine.toggleFavorite('non-existent', 'org-1')
      ).rejects.toThrow('Document not found');
    });
  });

  // ─── getVersions ─────────────────────────────────────────

  describe('getVersions', () => {
    it('should return versions ordered by version desc', async () => {
      const versions = [{ id: 'v2', version: 2 }, { id: 'v1', version: 1 }];
      (prisma.documentVersion.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(versions);

      const result = await DocumentEngine.getVersions('doc-1', 'org-1');

      expect(prisma.documentVersion.findMany).toHaveBeenCalledWith({
        where: { document: { id: 'doc-1', organizationId: 'org-1' } },
        orderBy: { version: 'desc' },
        include: { user: { select: { id: true, name: true, image: true } } },
      });
      expect(result).toEqual(versions);
    });
  });

  // ─── restoreVersion ──────────────────────────────────────

  describe('restoreVersion', () => {
    it('should restore version content and increment version', async () => {
      const version = { id: 'v1', version: 1, content: { body: 'restored' }, variables: { name: 'John' } };
      (prisma.documentVersion.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(version);
      (prisma.document.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
      (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await DocumentEngine.restoreVersion('doc-1', 'v1', 'org-1', 'user-1');

      expect(prisma.document.update).toHaveBeenCalledWith({
        where: { id: 'doc-1' },
        data: { content: version.content, variables: version.variables, version: { increment: 1 } },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'VERSION_RESTORED',
          entityId: 'v1',
        }),
      });
    });

    it('should throw when version not found', async () => {
      (prisma.documentVersion.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        DocumentEngine.restoreVersion('doc-1', 'non-existent', 'org-1', 'user-1')
      ).rejects.toThrow('Version not found');
    });
  });

  // ─── extractPlaceholders ─────────────────────────────────

  describe('extractPlaceholders', () => {
    it('should extract {{...}} style placeholders', () => {
      const result = DocumentEngine.extractPlaceholders('<p>{{Name}} {{Email}}</p>');
      expect(result).toEqual(['Name', 'Email']);
    });

    it('should return unique placeholders only', () => {
      const result = DocumentEngine.extractPlaceholders('{{Name}} {{Name}} {{Name}}');
      expect(result).toEqual(['Name']);
    });

    it('should support dotted keys like company.name', () => {
      const result = DocumentEngine.extractPlaceholders('{{user.name}} {{company.address.city}}');
      expect(result).toEqual(['user.name', 'company.address.city']);
    });

    it('should return empty array when no placeholders', () => {
      const result = DocumentEngine.extractPlaceholders('<p>No placeholders here</p>');
      expect(result).toEqual([]);
    });

    it('should return empty array for empty string', () => {
      expect(DocumentEngine.extractPlaceholders('')).toEqual([]);
    });

    it('should extract placeholders with {{Key:fallback}} syntax', () => {
      const result = DocumentEngine.extractPlaceholders('<p>{{Name:John}} {{Email:john@example.com}}</p>');
      expect(result).toEqual(['Name', 'Email']);
    });

    it('should not duplicate a key used both with and without a fallback', () => {
      const result = DocumentEngine.extractPlaceholders('{{Name:John}} {{Name}}');
      expect(result).toEqual(['Name']);
    });

    it('should support dotted keys with fallbacks', () => {
      const result = DocumentEngine.extractPlaceholders('{{user.name:Acme}} {{company.address.city:Bangalore}}');
      expect(result).toEqual(['user.name', 'company.address.city']);
    });
  });

  // ─── resolvePlaceholders ─────────────────────────────────

  describe('resolvePlaceholders', () => {
    it('should resolve system placeholders with context values', () => {
      const result = DocumentEngine.resolvePlaceholders('{{CompanyName}}', {
        customValues: {},
        company: { companyName: 'Acme Inc' } as CompanyProfileData,
      });
      expect(result).toBe('Acme Inc');
    });

    it('should resolve custom values from context', () => {
      const result = DocumentEngine.resolvePlaceholders('Hello {{EmployeeName}}', {
        customValues: { EmployeeName: 'John' },
      });
      expect(result).toBe('Hello John');
    });

    it('should leave unresolved custom values as-is', () => {
      const result = DocumentEngine.resolvePlaceholders('{{UnknownKey}}', {
        customValues: {},
      });
      expect(result).toBe('{{UnknownKey}}');
    });

    it('should substitute a default image for an image placeholder with no value', () => {
      const result = DocumentEngine.resolvePlaceholders('{{CompanyLogo}}', {
        customValues: {},
      });
      expect(result).toMatch(/^data:image\/svg\+xml;base64,/);
    });

    it('should substitute the default image when an image placeholder has plain text (sample-style) value', () => {
      const result = DocumentEngine.resolvePlaceholders('{{HeroImage}}', {
        customValues: { HeroImage: '[Sample Hero Image]' },
      });
      expect(result).toMatch(/^data:image\/svg\+xml;base64,/);
    });

    it('should keep a valid image source value in an image placeholder', () => {
      const result = DocumentEngine.resolvePlaceholders('{{CompanyLogo}}', {
        customValues: { CompanyLogo: 'data:image/png;base64,abc' },
      });
      expect(result).toBe('data:image/png;base64,abc');
    });

    it('should resolve {{Key:fallback}} syntax using the custom value first', () => {
      expect(DocumentEngine.resolvePlaceholders('{{EmployeeName:John}}', { customValues: {} })).toBe('John');
      expect(
        DocumentEngine.resolvePlaceholders('{{EmployeeName:John}}', { customValues: { EmployeeName: 'Alice' } })
      ).toBe('Alice');
    });

    it('should default an image placeholder with fallback text to the default image', () => {
      const result = DocumentEngine.resolvePlaceholders('{{CompanyLogo:Logo Here}}', { customValues: {} });
      expect(result).toMatch(/^data:image\/svg\+xml;base64,/);
    });

    it('should default a leftover bare image token (custom image key, no value)', () => {
      const result = DocumentEngine.resolvePlaceholders('{{QRCode}}', { customValues: {} });
      expect(result).toMatch(/^data:image\/svg\+xml;base64,/);
    });

    it('should keep a text value for a non-image key that contains a partial keyword', () => {
      // 'CoverBody' (cover letter body text) contains 'cover' but is a text
      // field — it must NOT be replaced with a default image.
      const result = DocumentEngine.resolvePlaceholders('{{CoverBody}}', {
        customValues: { CoverBody: 'Dear Hiring Manager,' },
      });
      expect(result).toBe('Dear Hiring Manager,');
    });
  });

  // ─── generateFromTemplate ────────────────────────────────

  describe('generateFromTemplate', () => {
    it('should resolve placeholders in template html', async () => {
      const template = {
        htmlTemplate: '<p>{{EmployeeName}} - {{Salary}}</p>',
      };

      const result = await DocumentEngine.generateFromTemplate(template, {
        EmployeeName: 'Alice',
        Salary: '50000',
      });

      expect(result).toBe('<p>Alice - 50000</p>');
    });

    it('should merge company profile with variables', async () => {
      const template = { htmlTemplate: '<p>{{CompanyName}} - {{EmployeeName}}</p>' };

      const result = await DocumentEngine.generateFromTemplate(
        template,
        { EmployeeName: 'Bob' },
        { CompanyName: 'Big Corp' }
      );

      expect(result).toBe('<p>Big Corp - Bob</p>');
    });

    it('should handle empty htmlTemplate', async () => {
      const template = {};

      const result = await DocumentEngine.generateFromTemplate(template, {});

      expect(result).toBe('');
    });

    it('should put a default image inside img tags for unfilled image placeholders', async () => {
      // The exact server-side bug: sample/paid docs generated a broken
      // <img src="[Sample ...]"> because image keys fell through to text.
      const template = { htmlTemplate: '<img src="{{EmployeePhoto}}" alt="Photo" />' };

      const result = await DocumentEngine.generateFromTemplate(template, { EmployeePhoto: '[Sample Photo]' });

      expect(result).toMatch(/src="data:image\/svg\+xml;base64,/);
      expect(result).not.toContain('[Sample Photo]');
    });
  });

  // ─── generatePreview ─────────────────────────────────────

  describe('generatePreview', () => {
    it('should delegate to generateFromTemplate', async () => {
      const template = { htmlTemplate: '<p>{{Name}}</p>' };
      const spy = vi.spyOn(DocumentEngine, 'generateFromTemplate');

      await DocumentEngine.generatePreview(template, { Name: 'Test' });

      expect(spy).toHaveBeenCalledWith(template, { Name: 'Test' });
    });
  });

  // ─── sanitizeDocumentHtml ───────────────────────────────

  describe('sanitizeDocumentHtml', () => {
    it('removes script tags (block + self-closing + nested case)', () => {
      expect(sanitizeDocumentHtml('<p>hi</p><script>alert(1)</script>')).toBe('<p>hi</p>');
      expect(sanitizeDocumentHtml('<script src="https://evil.com/x.js"></script>ok')).toBe('ok');
      expect(sanitizeDocumentHtml('<SCRIPT>alert(1)</SCRIPT>ok')).toBe('ok');
    });

    it('removes iframe, object, embed, base, link, and meta elements', () => {
      const input =
        '<div>x</div><iframe src="https://evil.com"></iframe><object data="x"></object>' +
        '<embed src="x"><base href="https://evil.com"><link rel="stylesheet" href="x.css">' +
        '<meta http-equiv="refresh" content="0;url=https://evil.com">';
      const out = sanitizeDocumentHtml(input);
      expect(out).toContain('<div>x</div>');
      expect(out).not.toContain('iframe');
      expect(out).not.toContain('object');
      expect(out).not.toContain('embed');
      expect(out).not.toContain('<base');
      expect(out).not.toContain('<link');
      expect(out).not.toContain('<meta');
    });

    it('removes on* event-handler attributes', () => {
      const out = sanitizeDocumentHtml('<img src="x.png" onerror="alert(1)" onload="evil()" alt="a">');
      expect(out).not.toContain('onerror');
      expect(out).not.toContain('onload');
      expect(out).toContain('<img src="x.png"');
      expect(out).toContain('alt="a"');
    });

    it('neutralizes javascript:, vbscript:, and data:text/html URLs in href/src', () => {
      expect(sanitizeDocumentHtml('<a href="javascript:alert(1)">x</a>')).not.toContain('javascript:');
      expect(sanitizeDocumentHtml('<a href="JaVaScRiPt:alert(1)">x</a>')).not.toContain('JaVaScRiPt');
      expect(sanitizeDocumentHtml('<img src="vbscript:msgbox(1)">')).not.toContain('vbscript:');
      expect(sanitizeDocumentHtml('<iframe src="data:text/html,<script>1</script>">')).not.toContain('data:text/html');
      expect(sanitizeDocumentHtml('<a href="https://safe.com">ok</a>')).toContain('https://safe.com');
    });

    it('strips style attributes smuggling url(javascript:)', () => {
      const out = sanitizeDocumentHtml('<div style="background:url(javascript:alert(1))">x</div>');
      expect(out).not.toContain('javascript:');
    });

    it('keeps legitimate document HTML intact (tables, styles, SVG, data-URI images)', () => {
      const legit =
        '<table><tr><td style="color:red">A</td></tr></table>' +
        '<style>.x{font-weight:bold}</style>' +
        '<svg width="10"><circle cx="5" cy="5" r="4"/></svg>' +
        '<img src="data:image/svg+xml;base64,PHN2Zz4=" alt="logo">';
      const out = sanitizeDocumentHtml(legit);
      expect(out).toContain('<table>');
      expect(out).toContain('<style>.x{font-weight:bold}</style>');
      expect(out).toContain('<svg');
      expect(out).toContain('data:image/svg+xml');
      expect(out).toContain('style="color:red"');
    });
  });

  // ─── truncateSampleBody ──────────────────────────────────────

  describe('truncateSampleBody', () => {
    it('leaves a short body untouched', () => {
      const result = truncateSampleBody('<p>short</p>', 3000);
      expect(result.truncated).toBe(false);
      expect(result.html).toBe('<p>short</p>');
    });

    it('cuts a long body at a top-level element boundary', () => {
      const body =
        '<div>one</div><div>two</div><div>three</div><div>four</div><div>five</div>';
      const result = truncateSampleBody(body, 30);
      expect(result.truncated).toBe(true);
      // Whole top-level elements only — no tag sliced in half.
      expect(result.html).toBe('<div>one</div><div>two</div>');
      expect(result.html).not.toContain('thr');
    });

    it('does not disclose the tail of the document', () => {
      const secret = '<p>CONFIDENTIAL_SALARY_TABLE</p>';
      const body = '<div>a</div>'.repeat(50) + secret;
      const result = truncateSampleBody(body, 120);
      expect(result.html).not.toContain('CONFIDENTIAL_SALARY_TABLE');
    });

    it('keeps nested markup balanced at the cut point', () => {
      const body = '<div><table><tr><td>cell</td></tr></table></div>'.repeat(20);
      const result = truncateSampleBody(body, 60);
      expect(result.truncated).toBe(true);
      // Every emitted tag is closed.
      const open = (result.html.match(/<div>/g) || []).length;
      const close = (result.html.match(/<\/div>/g) || []).length;
      expect(open).toBe(close);
    });

    it('sanitizes before truncating', () => {
      const body = '<script>alert(1)</script>' + '<div>x</div>'.repeat(200);
      const result = truncateSampleBody(body, 5000);
      expect(result.html).not.toContain('alert(1)');
    });

    it('handles a single element larger than the budget without returning nothing', () => {
      const body = '<div>' + 'a'.repeat(5000) + '</div>';
      const result = truncateSampleBody(body, 100);
      expect(result.truncated).toBe(true);
      expect(result.html.length).toBeGreaterThan(0);
    });
  });

  it('generateFromTemplate sanitizes script in template HTML', async () => {
    const template = { htmlTemplate: '<p>{{Name}}</p><script>alert(1)</script>' };
    const result = await DocumentEngine.generateFromTemplate(template, { Name: 'Alice' });
    expect(result).toBe('<p>Alice</p>');
  });

  it('generateFromTemplate sanitizes script injected via variable values', async () => {
    const template = { htmlTemplate: '<p>{{Name}}</p>' };
    const result = await DocumentEngine.generateFromTemplate(template, {
      Name: 'Alice<img src=x onerror=alert(1)>',
    });
    expect(result).toBe('<p>Alice<img src=x></p>');
  });

  // ─── createShare ─────────────────────────────────────────

  describe('createShare', () => {
    it('should create a share link and audit log', async () => {
      (prisma.document.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockDocument);
      (prisma.documentShare.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockShare);
      (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const result = await DocumentEngine.createShare('doc-1', 'org-1', 'user-1', {
        shareType: 'LINK',
      });

      expect(prisma.documentShare.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          documentId: 'doc-1',
          shareType: 'LINK',
          token: expect.any(String),
          isActive: true,
        }),
      });
      expect(result.token).toBe('abc123token');
      expect(result.shareUrl).toContain('/share/abc123token');
    });

    it('should throw when document not found', async () => {
      (prisma.document.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        DocumentEngine.createShare('non-existent', 'org-1', 'user-1', { shareType: 'LINK' })
      ).rejects.toThrow('Document not found');
    });

    it('should set expiresAt when expiresInDays is provided', async () => {
      (prisma.document.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockDocument);
      (prisma.documentShare.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockShare);
      (prisma.auditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await DocumentEngine.createShare('doc-1', 'org-1', 'user-1', {
        shareType: 'EMAIL',
        recipient: 'a@b.com',
        expiresInDays: 7,
        maxDownloads: 5,
        password: 'secret',
      });

      const callData = (prisma.documentShare.create as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
      expect(callData.recipient).toBe('a@b.com');
      expect(callData.expiresAt).toBeInstanceOf(Date);
      expect(callData.maxDownloads).toBe(5);
      expect(callData.password).toBeTruthy();
    });
  });

  // ─── getShares ───────────────────────────────────────────

  describe('getShares', () => {
    it('should return shares with shareUrl', async () => {
      (prisma.documentShare.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([mockShare]);

      const result = await DocumentEngine.getShares('doc-1', 'org-1');

      expect(prisma.documentShare.findMany).toHaveBeenCalledWith({
        where: { documentId: 'doc-1', document: { organizationId: 'org-1' } },
        orderBy: { createdAt: 'desc' },
      });
      expect(result[0].shareUrl).toContain('/share/abc123token');
    });
  });

  // ─── getSharedDocument ───────────────────────────────────

  describe('getSharedDocument', () => {
    const sharedDoc = { id: 'doc-1', title: 'Shared Doc' };
    const activeShare = { ...mockShare, document: sharedDoc };

    it('should return document when share is valid', async () => {
      (prisma.documentShare.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(activeShare);

      const result = await DocumentEngine.getSharedDocument('valid-token');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(sharedDoc);
    });

    it('should return error when share not found', async () => {
      (prisma.documentShare.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await DocumentEngine.getSharedDocument('bad-token');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Share link not found');
    });

    it('should return error when share is inactive', async () => {
      (prisma.documentShare.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...activeShare,
        isActive: false,
      });

      const result = await DocumentEngine.getSharedDocument('revoked-token');

      expect(result.success).toBe(false);
      expect(result.error).toBe('This share link has been revoked');
    });

    it('should return error when share has expired', async () => {
      (prisma.documentShare.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...activeShare,
        expiresAt: new Date('2020-01-01'),
      });

      const result = await DocumentEngine.getSharedDocument('expired-token');

      expect(result.success).toBe(false);
      expect(result.error).toBe('This share link has expired');
    });

    it('should return error when max downloads reached', async () => {
      (prisma.documentShare.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...activeShare,
        maxDownloads: 5,
        downloadCount: 5,
      });

      const result = await DocumentEngine.getSharedDocument('exhausted-token');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Maximum downloads reached');
    });

    it('should require password when share is password-protected', async () => {
      (prisma.documentShare.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...activeShare,
        password: 'hashed-password',
      });

      const result = await DocumentEngine.getSharedDocument('pw-protected');

      expect(result.success).toBe(false);
      expect(result.requiresPassword).toBe(true);
      expect(result.shareId).toBe('share-1');
    });

    it('should reject wrong password', async () => {
      (prisma.documentShare.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...activeShare,
        password: 'real-hash',
      });

      const result = await DocumentEngine.getSharedDocument('pw-protected', 'wrong-password');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid password');
    });

    it('should accept the correct bcrypt password', async () => {
      const hash = await DocumentEngine.hashSharePassword('secret');
      (prisma.documentShare.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...activeShare,
        password: hash,
      });

      const result = await DocumentEngine.getSharedDocument('pw-protected', 'secret');

      expect(result.success).toBe(true);
    });

    it('should still accept legacy unsalted SHA-256 hashes (pre-upgrade rows)', async () => {
      const legacy = crypto.createHash('sha256').update('oldpass').digest('hex');
      (prisma.documentShare.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...activeShare,
        password: legacy,
      });

      const result = await DocumentEngine.getSharedDocument('pw-protected', 'oldpass');

      expect(result.success).toBe(true);
    });

    it('should not accept a legacy SHA-256 hash with the wrong password', async () => {
      const legacy = crypto.createHash('sha256').update('oldpass').digest('hex');
      (prisma.documentShare.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...activeShare,
        password: legacy,
      });

      const result = await DocumentEngine.getSharedDocument('pw-protected', 'wrong');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid password');
    });
  });

  // ─── recordShareDownload ─────────────────────────────────

  describe('recordShareDownload', () => {
    it('should increment download count', async () => {
      (prisma.documentShare.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockShare);
      (prisma.documentShare.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });

      const result = await DocumentEngine.recordShareDownload('token');

      expect(result).toBe(true);
      // The limit is part of the WHERE clause so the database serialises the
      // check and the increment — no read-then-write race.
      expect(prisma.documentShare.updateMany).toHaveBeenCalledWith({
        where: { id: 'share-1', isActive: true },
        data: { downloadCount: { increment: 1 } },
      });
    });

    it('should deactivate share when max downloads reached', async () => {
      (prisma.documentShare.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockShare,
        maxDownloads: 3,
        downloadCount: 2,
      });
      (prisma.documentShare.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });

      await DocumentEngine.recordShareDownload('token');

      // The claim is guarded by the remaining allowance...
      expect(prisma.documentShare.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: 'share-1', isActive: true, downloadCount: { lt: 3 } },
        data: { downloadCount: { increment: 1 } },
      });
      // ...and a second pass deactivates the link once it is used up.
      expect(prisma.documentShare.updateMany).toHaveBeenNthCalledWith(2, {
        where: { id: 'share-1', downloadCount: { gte: 3 }, isActive: true },
        data: { isActive: false },
      });
    });

    it('should return false when the allowance was consumed concurrently', async () => {
      (prisma.documentShare.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockShare,
        maxDownloads: 1,
        downloadCount: 0,
      });
      // A parallel request claimed the last download first.
      (prisma.documentShare.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 });

      const result = await DocumentEngine.recordShareDownload('token');

      expect(result).toBe(false);
    });

    it('should return false when share not found', async () => {
      (prisma.documentShare.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await DocumentEngine.recordShareDownload('bad-token');

      expect(result).toBe(false);
      expect(prisma.documentShare.updateMany).not.toHaveBeenCalled();
    });
  });

  // ─── revokeShare ─────────────────────────────────────────

  describe('revokeShare', () => {
    it('should deactivate share', async () => {
      (prisma.documentShare.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockShare);
      (prisma.documentShare.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await DocumentEngine.revokeShare('share-1', 'org-1');

      expect(prisma.documentShare.update).toHaveBeenCalledWith({
        where: { id: 'share-1' },
        data: { isActive: false },
      });
    });

    it('should throw when share not found', async () => {
      (prisma.documentShare.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        DocumentEngine.revokeShare('non-existent', 'org-1')
      ).rejects.toThrow('Share not found');
    });
  });

  // ─── getStats ────────────────────────────────────────────

  describe('getStats', () => {
    it('should return document stats for tenant', async () => {
      (prisma.document.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(10); // total
      (prisma.document.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(5);  // drafts
      (prisma.document.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(3);  // completed
      (prisma.document.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(1);  // archived
      (prisma.document.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(2);  // favorites

      const result = await DocumentEngine.getStats('org-1');

      expect(result).toEqual({ total: 10, drafts: 5, completed: 3, archived: 1, favorites: 2 });
    });

    it('should filter by userId when provided', async () => {
      (prisma.document.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(2);
      (prisma.document.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(1);
      (prisma.document.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(1);
      (prisma.document.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0);
      (prisma.document.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(1);

      await DocumentEngine.getStats('org-1', 'user-1');

      // Each count call should include userId
      const calls = (prisma.document.count as ReturnType<typeof vi.fn>).mock.calls;
      for (const call of calls) {
        expect(call[0].where.userId).toBe('user-1');
      }
    });
  });
});
