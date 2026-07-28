import { prisma } from '@/lib/prisma';
import { toJson } from '@/lib/utils/prisma-json';
import type {
  DocumentData,
  DocumentCreateInput,
  DocumentUpdateInput,
  PlaceholderContext,
  TemplateData,
} from '@/types';
import { SYSTEM_PLACEHOLDERS } from '@/lib/utils/constants';
import crypto from 'crypto';

/**
 * DocMint Document Engine
 * Core engine for document generation, template parsing, variable resolution, and export.
 */
export class DocumentEngine {
  // ─── Document CRUD ───

  /**
   * Create a new document
   */
  static async create(input: DocumentCreateInput, tenantId: string, userId: string): Promise<DocumentData> {
    const document = await prisma.document.create({
      data: {
        organizationId: tenantId,
        userId,
        title: input.title,
        description: input.description,
        documentType: input.documentType,
        categoryId: input.categoryId,
        folderId: input.folderId,
        content: (input.content || {}) as any,
        variables: (input.variables || {}) as any,
        status: 'DRAFT',
        version: 1,
      },
    });

    // Create initial version
    await prisma.documentVersion.create({
      data: {
        documentId: document.id,
        userId,
        version: 1,
        content: (input.content || {}) as any,
        variables: (input.variables || {}) as any,
        changeNote: 'Initial version',
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        organizationId: tenantId,
        userId,
        action: 'DOCUMENT_CREATED',
        entity: 'Document',
        entityId: document.id,
        description: `Document "${input.title}" created`,
      },
    });

    return document as unknown as DocumentData;
  }

  /**
   * Update a document
   */
  static async update(
    id: string,
    input: DocumentUpdateInput,
    tenantId: string,
    userId: string
  ): Promise<DocumentData> {
    const existing = await prisma.document.findFirst({
      where: { id, organizationId: tenantId },
    });

    if (!existing) throw new Error('Document not found');

    const updated = await prisma.document.update({
      where: { id },
      data: {
        ...(input as any),
        version: existing.version + 1,
        lastEditedAt: new Date(),
      } as any,
    });

    // Create version snapshot
    await prisma.documentVersion.create({
      data: {
        documentId: id,
        userId,
        version: existing.version + 1,
        content: (updated.content || {}) as any,
        variables: (updated.variables || {}) as any,
        changeNote: 'Updated',
      },
    });

    return updated as unknown as DocumentData;
  }

  /**
   * Get a document with tenant isolation
   */
  static async getById(id: string, tenantId: string): Promise<DocumentData | null> {
    const doc = await prisma.document.findFirst({
      where: { id, organizationId: tenantId },
      include: {
        versions: { orderBy: { version: 'desc' }, take: 1 },
      },
    });
    return doc as unknown as DocumentData | null;
  }

  /**
   * List documents with filtering and pagination
   */
  static async list(
    tenantId: string,
    userId: string,
    options: {
      status?: string;
      categoryId?: string;
      folderId?: string;
      isFavorite?: boolean;
      isArchived?: boolean;
      search?: string;
      tags?: string[];
      page?: number;
      pageSize?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    }
  ) {
    const where: Record<string, unknown> = {
      organizationId: tenantId,
      userId,
      deletedAt: null,
    };

    if (options.status) where.status = options.status;
    if (options.categoryId) where.categoryId = options.categoryId;
    if (options.folderId) where.folderId = options.folderId;
    if (options.isFavorite !== undefined) where.isFavorite = options.isFavorite;
    if (options.isArchived !== undefined) where.isArchived = options.isArchived;
    if (options.search) where.title = { contains: options.search, mode: 'insensitive' };
    if (options.tags?.length) where.tags = { hasSome: options.tags };

    const page = options.page || 1;
    const pageSize = options.pageSize || 20;
    const orderBy: Record<string, string> = {};
    orderBy[options.sortBy || 'updatedAt'] = options.sortOrder || 'desc';

    const [data, total] = await Promise.all([
      prisma.document.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          category: { select: { name: true, slug: true } },
          folder: { select: { name: true } },
        },
      }),
      prisma.document.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Soft delete a document with tenant isolation
   */
  static async delete(id: string, tenantId: string, userId: string): Promise<void> {
    // First verify the document belongs to the tenant
    const doc = await prisma.document.findFirst({
      where: { id, organizationId: tenantId },
    });

    if (!doc) throw new Error('Document not found or access denied');

    await prisma.document.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'DELETED' },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: tenantId,
        userId,
        action: 'DOCUMENT_DELETED',
        entity: 'Document',
        entityId: id,
        description: 'Document deleted',
      },
    });
  }

  /**
   * Restore a soft-deleted document
   */
  static async restore(id: string, tenantId: string): Promise<void> {
    await prisma.document.update({
      where: { id, organizationId: tenantId },
      data: { deletedAt: null, status: 'DRAFT' },
    });
  }

  /**
   * Duplicate a document
   */
  static async duplicate(id: string, tenantId: string, userId: string): Promise<DocumentData> {
    const original = await prisma.document.findFirst({
      where: { id, organizationId: tenantId },
    });

    if (!original) throw new Error('Document not found');

    return this.create(
      {
        title: `${original.title} (Copy)`,
        description: original.description || undefined,
        documentType: original.documentType,
        content: original.content as Record<string, unknown>,
        variables: original.variables as Record<string, string>,
      },
      tenantId,
      userId
    );
  }

  /**
   * Toggle favorite status
   */
  static async toggleFavorite(id: string, tenantId: string): Promise<boolean> {
    const doc = await prisma.document.findFirst({
      where: { id, organizationId: tenantId },
      select: { isFavorite: true },
    });

    if (!doc) throw new Error('Document not found');

    await prisma.document.update({
      where: { id },
      data: { isFavorite: !doc.isFavorite },
    });

    return !doc.isFavorite;
  }

  // ─── Version History ───

  /**
   * Get version history for a document
   */
  static async getVersions(documentId: string, tenantId: string) {
    return prisma.documentVersion.findMany({
      where: {
        document: { id: documentId, organizationId: tenantId },
      },
      orderBy: { version: 'desc' },
      include: {
        user: { select: { id: true, name: true, image: true } },
      },
    });
  }

  /**
   * Restore a specific version
   */
  static async restoreVersion(documentId: string, versionId: string, tenantId: string, userId: string) {
    const version = await prisma.documentVersion.findFirst({
      where: { id: versionId, document: { organizationId: tenantId } },
    });

    if (!version) throw new Error('Version not found');

    const updated = await prisma.document.update({
      where: { id: documentId },
      data: {
        content: toJson(version.content),
        variables: toJson(version.variables),
        version: { increment: 1 },
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: tenantId,
        userId,
        action: 'VERSION_RESTORED',
        entity: 'DocumentVersion',
        entityId: versionId,
        description: `Version ${version.version} restored`,
      },
    });

    return updated;
  }

  // ─── Placeholder Resolution ───

  /**
   * Extract all placeholders from template content
   * Supports word characters, dots, and hyphens in placeholder names
   */
  static extractPlaceholders(html: string): string[] {
    const regex = /\{\{([\w.-]+)\}\}/g;
    const placeholders: string[] = [];
    let match;
    while ((match = regex.exec(html)) !== null) {
      if (!placeholders.includes(match[1])) {
        placeholders.push(match[1]);
      }
    }
    return placeholders;
  }

  /**
   * Resolve all placeholders with provided context
   */
  static resolvePlaceholders(html: string, context: PlaceholderContext): string {
    let resolved = html;

    // Replace system placeholders
    for (const key of SYSTEM_PLACEHOLDERS) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      const value = this.resolvePlaceholder(key, context);
      resolved = resolved.replace(regex, value);
    }

    // Replace custom placeholders from document variables
    for (const [key, value] of Object.entries(context.customValues)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      resolved = resolved.replace(regex, value || `{{${key}}}`);
    }

    return resolved;
  }

  /**
   * Resolve a single placeholder value
   *
   * Image placeholders (CompanyLogo, CompanySeal, signatures, etc.) return just the URL,
   * because templates already use <img src="{{Placeholder}}"> wrapping.
   * Falls back to context.customValues when company profile is not available.
   */
  private static resolvePlaceholder(key: string, context: PlaceholderContext): string {
    switch (key) {
      case 'CompanyName':
        return context.company?.companyName || context.customValues['CompanyName'] || '';
      case 'CompanyLogo':
        return context.company?.companyLogo || context.customValues['CompanyLogo'] || '';
      case 'CompanySeal':
        return context.company?.companySeal || context.customValues['CompanySeal'] || '';
      case 'CompanyAddress':
        return context.company?.companyAddress || context.customValues['CompanyAddress'] || '';
      case 'CompanyPhone':
        return context.company?.companyPhone || context.customValues['CompanyPhone'] || '';
      case 'CompanyEmail':
        return context.company?.companyEmail || context.customValues['CompanyEmail'] || '';
      case 'CompanyWebsite':
        return context.company?.companyWebsite || context.customValues['CompanyWebsite'] || '';
      case 'GST':
        return context.company?.gstNumber || context.customValues['GST'] || '';
      case 'PAN':
        return context.company?.panNumber || context.customValues['PAN'] || '';
      case 'CIN':
        return context.company?.cinNumber || context.customValues['CIN'] || '';
      case 'CurrentDate':
        return new Date().toLocaleDateString('en-IN', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
      case 'CurrentYear':
        return new Date().getFullYear().toString();
      case 'AuthorizedSignature':
        return context.company?.authorizedSign || context.customValues['AuthorizedSignature'] || '';
      case 'EmployeePhoto':
        return context.customValues['EmployeePhoto'] || '';
      case 'EmployeeName':
        return context.customValues['EmployeeName'] || '';
      case 'Designation':
        return context.customValues['Designation'] || '';
      case 'Department':
        return context.customValues['Department'] || '';
      case 'JoiningDate':
        return context.customValues['JoiningDate'] || '';
      case 'Salary':
        return context.customValues['Salary'] || '';
      case 'Manager':
        return context.customValues['Manager'] || '';
      default:
        return context.customValues[key] || `{{${key}}}`;
    }
  }

  // ─── Template Generation ───

  /**
   * Generate document HTML from template and variables
   */
  static async generateFromTemplate(
    template: TemplateData,
    variables: Record<string, string>,
    companyProfile?: Record<string, string>
  ): Promise<string> {
    let html = template.htmlTemplate || '';

    const context: PlaceholderContext = {
      customValues: { ...companyProfile, ...variables },
    };

    // Resolve all placeholders
    html = this.resolvePlaceholders(html, context);

    return html;
  }

  /**
   * Generate a preview of the document
   */
  static async generatePreview(template: TemplateData, variables: Record<string, string>): Promise<string> {
    return this.generateFromTemplate(template, variables);
  }

  // ─── Document Sharing ───

  /**
   * Generate a unique share token
   */
  private static generateShareToken(): string {
    return crypto.randomBytes(24).toString('hex');
  }

  /**
   * Hash a share password for storage
   */
  private static hashSharePassword(password: string): string {
    return crypto.createHash('sha256').update(password).digest('hex');
  }

  /**
   * Create a document share link
   */
  static async createShare(
    documentId: string,
    tenantId: string,
    userId: string,
    options: {
      shareType: 'LINK' | 'EMAIL' | 'WHATSAPP';
      recipient?: string;
      password?: string;
      expiresInDays?: number;
      maxDownloads?: number;
    }
  ) {
    // Verify document ownership
    const doc = await prisma.document.findFirst({
      where: { id: documentId, organizationId: tenantId },
    });
    if (!doc) throw new Error('Document not found');

    const token = this.generateShareToken();
    const expiresAt = options.expiresInDays
      ? new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const share = await prisma.documentShare.create({
      data: {
        documentId,
        shareType: options.shareType,
        recipient: options.recipient || null,
        token,
        password: options.password ? this.hashSharePassword(options.password) : null,
        expiresAt,
        maxDownloads: options.maxDownloads || null,
        downloadCount: 0,
        isActive: true,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        organizationId: tenantId,
        userId,
        action: 'SHARE_CREATED',
        entity: 'DocumentShare',
        entityId: share.id,
        description: `Share link created for "${doc.title}"`,
      },
    });

    return {
      id: share.id,
      token: share.token,
      shareType: share.shareType,
      recipient: share.recipient,
      password: !!share.password,
      expiresAt: share.expiresAt,
      maxDownloads: share.maxDownloads,
      downloadCount: share.downloadCount,
      isActive: share.isActive,
      createdAt: share.createdAt,
      shareUrl: `${process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000'}/share/${share.token}`,
    };
  }

  /**
   * Get all shares for a document
   */
  static async getShares(documentId: string, tenantId: string) {
    const shares = await prisma.documentShare.findMany({
      where: {
        documentId,
        document: { organizationId: tenantId },
      },
      orderBy: { createdAt: 'desc' },
    });

    return shares.map((s) => ({
      id: s.id,
      token: s.token,
      shareType: s.shareType,
      recipient: s.recipient,
      password: !!s.password,
      expiresAt: s.expiresAt,
      maxDownloads: s.maxDownloads,
      downloadCount: s.downloadCount,
      isActive: s.isActive,
      createdAt: s.createdAt,
      shareUrl: `${process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000'}/share/${s.token}`,
    }));
  }

  /**
   * Get a shared document by token (public access)
   */
  static async getSharedDocument(token: string, password?: string) {
    const share = await prisma.documentShare.findUnique({
      where: { token },
      include: {
        document: {
          select: {
            id: true,
            title: true,
            description: true,
            documentType: true,
            htmlContent: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!share) {
      return { success: false, error: 'Share link not found' };
    }

    if (!share.isActive) {
      return { success: false, error: 'This share link has been revoked' };
    }

    if (share.expiresAt && share.expiresAt < new Date()) {
      return { success: false, error: 'This share link has expired' };
    }

    if (share.maxDownloads && share.downloadCount >= share.maxDownloads) {
      return { success: false, error: 'Maximum downloads reached' };
    }

    // Check password
    if (share.password) {
      if (!password) {
        return { success: false, requiresPassword: true, shareId: share.id };
      }
      const hashedInput = this.hashSharePassword(password);
      if (hashedInput !== share.password) {
        return { success: false, error: 'Invalid password' };
      }
    }

    return { success: true, data: share.document, share };
  }

  /**
   * Record a download/view and check limits
   */
  static async recordShareDownload(token: string): Promise<boolean> {
    const share = await prisma.documentShare.findUnique({ where: { token } });
    if (!share) return false;

    await prisma.documentShare.update({
      where: { id: share.id },
      data: { downloadCount: { increment: 1 } },
    });

    // Auto-revoke if max downloads reached
    if (share.maxDownloads && share.downloadCount + 1 >= share.maxDownloads) {
      await prisma.documentShare.update({
        where: { id: share.id },
        data: { isActive: false },
      });
    }

    return true;
  }

  /**
   * Revoke a share link
   */
  static async revokeShare(shareId: string, tenantId: string): Promise<void> {
    const share = await prisma.documentShare.findFirst({
      where: {
        id: shareId,
        document: { organizationId: tenantId },
      },
    });
    if (!share) throw new Error('Share not found');

    await prisma.documentShare.update({
      where: { id: shareId },
      data: { isActive: false },
    });
  }

  // ─── Document Statistics ───

  /**
   * Get document statistics for dashboard
   */
  static async getStats(tenantId: string, userId?: string) {
    const where: Record<string, unknown> = { organizationId: tenantId };
    if (userId) where.userId = userId;

    const [total, drafts, completed, archived, favorites] = await Promise.all([
      prisma.document.count({ where: { ...where, deletedAt: null } }),
      prisma.document.count({ where: { ...where, status: 'DRAFT', deletedAt: null } }),
      prisma.document.count({ where: { ...where, status: 'COMPLETED', deletedAt: null } }),
      prisma.document.count({ where: { ...where, isArchived: true, deletedAt: null } }),
      prisma.document.count({ where: { ...where, isFavorite: true, deletedAt: null } }),
    ]);

    return { total, drafts, completed, archived, favorites };
  }
}
