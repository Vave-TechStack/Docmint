import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { toJson } from '@/lib/utils/prisma-json';
import type {
  DocumentData,
  DocumentCreateInput,
  DocumentUpdateInput,
  PlaceholderContext,
  TemplateData,
} from '@/types';
import { SYSTEM_PLACEHOLDERS } from '@/lib/utils/constants';
import { getDefaultImageForPlaceholder, isImagePlaceholder, isValidImageSource, replaceSvgDataUris } from '@/lib/utils/image-placeholders';
import { extractPlaceholders as detectPlaceholders } from '@/lib/utils/placeholders';
import crypto from 'crypto';

/**
 * Extract the body content and <style> tags from a full HTML document.
 * Templates stored in the DB are full HTML documents (<!DOCTYPE html><html><head>...<body>...).
 * When they pass through wrapStyledHtml(), they get nested inside another
 * complete HTML document, creating an invalid structure that breaks jsPDF.
 * This helper strips the outer document boilerplate, keeping only:
 * - <style> tags from <head> (template CSS)
 * - Everything inside <body> (template content)
 */
export function extractBodyContent(html: string): string {
  // Already just a fragment (no <html> wrapper) — return as-is
  if (!/<!DOCTYPE\s+html|<html[^>]*>/i.test(html.trim())) {
    return html;
  }

  // Extract <style> tags from head
  const styleTags: string[] = [];
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let styleMatch;
  while ((styleMatch = styleRegex.exec(html)) !== null) {
    styleTags.push(styleMatch[0]);
  }

  // Extract body content
  const bodyMatch = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html);
  const bodyContent = bodyMatch
    ? bodyMatch[1].trim()
    : html; // fallback: return original

  return styleTags.join('\n') + '\n' + bodyContent;
}

/**
 * Shared styled HTML wrapper for document download/preview.
 * Extracted to avoid duplication across API routes.
 * Automatically converts SVG data URIs to inline <svg> elements and adds
 * onerror handlers to remaining images to ensure no console errors occur.
 */
export function wrapStyledHtml(html: string): string {
  // Convert SVG data URIs to inline SVGs
  let processedHtml = replaceSvgDataUris(html || '');

  // Add onerror fallback to any remaining img tags to prevent broken image console errors
  processedHtml = processedHtml.replace(
    /(<img\s[^>]*?)(?:(\s+onerror\s*=\s*['"][^'"]*['"]))?([^>]*>)/gi,
    (match, before, existingOnerror, after) => {
      if (existingOnerror) return match;
      return `${before} onerror="this.style.display='none'"${after}`;
    }
  );

  // 12.7mm (0.5 inch) margins — A4 page (210mm × 297mm)
  return `
    <!DOCTYPE html>
    <html><head>
      <meta charset="utf-8">
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{
          font-family:'Segoe UI',Arial,sans-serif;
          padding:12.7mm;
          line-height:1.6;
          color:#333;
          max-width:210mm;
          min-height:297mm;
          margin:0 auto;
          word-wrap:break-word;
          -webkit-print-color-adjust:exact;
          print-color-adjust:exact
        }
        h1,h2,h3{color:#111;margin-top:16px;margin-bottom:8px}
        p{margin-bottom:8px}
        table{border-collapse:collapse;width:100%;margin:12px 0;table-layout:fixed}
        td,th{border:1px solid #ddd;padding:6px 8px;text-align:left;word-wrap:break-word}
        th{background:#f8f9fa;font-weight:600}
        img{max-width:100%;height:auto}
        .page-content{max-width:184.6mm;margin:0 auto}
      </style>
    </head><body><div class="page-content">${processedHtml}</div></body></html>
  `;
}

/**
 * Wrap document body HTML with a prominent red "FREE SAMPLE" watermark so
 * free demo downloads can't double as the paid product.
 *
 * Used by the sample-download paths (instant sample, premium template
 * samples). Expects the extracted <body> content (see extractBodyContent).
 */
export function applySampleWatermark(bodyHtml: string): string {
  return `
    <div style="position: relative;">
      <div style="position: absolute; top: 35%; left: 0; right: 0; text-align: center; transform: rotate(-35deg); opacity: 0.28; z-index: 9999; pointer-events: none;">
        <div style="font-family: Arial, sans-serif; font-size: 40px; font-weight: 900; color: #dc2626; text-transform: uppercase; letter-spacing: 6px; border: 4px dashed #dc2626; padding: 16px 24px; display: inline-block; border-radius: 12px; background: rgba(254, 226, 226, 0.5);">
          DOCMINT FREE SAMPLE<br/>
          <span style="font-size: 18px; font-weight: 700; letter-spacing: 2px; color: #991b1b;">WATERMARKED PREVIEW &bull; NOT FOR OFFICIAL USE</span>
        </div>
      </div>
      ${bodyHtml}
    </div>`;
}

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
        content: toJson(input.content || {}),
        variables: toJson(input.variables || {}),
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
        content: toJson(input.content || {}),
        variables: toJson(input.variables || {}),
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
        ...(input as unknown as Prisma.DocumentUpdateInput),
        version: existing.version + 1,
        lastEditedAt: new Date(),
      } as unknown as Prisma.DocumentUpdateInput,
    });

    // Create version snapshot
    await prisma.documentVersion.create({
      data: {
        documentId: id,
        userId,
        version: existing.version + 1,
        content: toJson(updated.content || {}),
        variables: toJson(updated.variables || {}),
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

  static async restore(id: string, tenantId: string): Promise<void> {
    await prisma.document.update({
      where: { id, organizationId: tenantId },
      data: { deletedAt: null, status: 'DRAFT' },
    });
  }

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

  static async getVersions(documentId: string, tenantId: string) {
    return prisma.documentVersion.findMany({
      where: { document: { id: documentId, organizationId: tenantId } },
      orderBy: { version: 'desc' },
      include: { user: { select: { id: true, name: true, image: true } } },
    });
  }

  static async restoreVersion(documentId: string, versionId: string, tenantId: string, userId: string) {
    const version = await prisma.documentVersion.findFirst({
      where: { id: versionId, document: { organizationId: tenantId } },
    });
    if (!version) throw new Error('Version not found');
    const updated = await prisma.document.update({
      where: { id: documentId },
      data: { content: toJson(version.content), variables: toJson(version.variables), version: { increment: 1 } },
    });
    await prisma.auditLog.create({
      data: { organizationId: tenantId, userId, action: 'VERSION_RESTORED', entity: 'DocumentVersion', entityId: versionId, description: `Version ${version.version} restored` },
    });
    return updated;
  }

  static extractPlaceholders(html: string): string[] {
    return detectPlaceholders(html);
  }

  static resolvePlaceholders(html: string, context: PlaceholderContext): string {
    let resolved = html;

    // 1. System placeholders (company profile + built-in semantics)
    for (const key of SYSTEM_PLACEHOLDERS) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      resolved = resolved.replace(regex, this.resolvePlaceholder(key, context));
    }

    // 2. Custom variable values — image-type keys get a default image when the
    //    value is missing or isn't a real image source (plain sample text like
    //    "[Sample Logo]" would otherwise end up as a broken <img src>).
    for (const [key, value] of Object.entries(context.customValues)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      resolved = resolved.replace(regex, this.resolveCustomValue(key, value));
    }

    // 3. Fallback syntax {{Key:fallback}} — the client renderers support this,
    //    so server-generated documents resolve it identically.
    resolved = resolved.replace(/\{\{([\w.-]+):([^}]+)\}\}/g, (match, key: string, fallback: string) => {
      return this.resolveCustomValue(key, context.customValues[key] || fallback);
    });

    // 4. Remaining bare tokens — image placeholders still get a default image
    //    (e.g. a custom image key with no value); other tokens stay literal.
    resolved = resolved.replace(/\{\{([\w.-]+)\}\}/g, (match, key: string) => {
      return isImagePlaceholder(key) ? getDefaultImageForPlaceholder(key) : match;
    });

    return resolved;
  }

  /**
   * Resolve a single custom value, substituting the default placeholder image
   * when an image-type key has no valid image source (empty or plain text).
   */
  private static resolveCustomValue(key: string, value: string): string {
    if (value && isValidImageSource(value)) return value;
    if (isImagePlaceholder(key)) return getDefaultImageForPlaceholder(key);
    return value;
  }

  private static resolvePlaceholder(key: string, context: PlaceholderContext): string {
    const customVal = context.customValues[key];

    // Image-type placeholders — company profile image takes precedence, then a
    // valid custom value, then the default placeholder image.
    if (isImagePlaceholder(key)) {
      if (key === 'CompanyLogo' && context.company?.companyLogo) return context.company.companyLogo;
      if (key === 'CompanySeal' && context.company?.companySeal) return context.company.companySeal;
      if (key === 'AuthorizedSignature' && context.company?.authorizedSign) return context.company.authorizedSign;
      if (customVal && isValidImageSource(customVal)) return customVal;
      return getDefaultImageForPlaceholder(key);
    }

    switch (key) {
      case 'CompanyName': return context.company?.companyName || customVal || '';
      case 'CompanyAddress': return context.company?.companyAddress || customVal || '';
      case 'CompanyPhone': return context.company?.companyPhone || customVal || '';
      case 'CompanyEmail': return context.company?.companyEmail || customVal || '';
      case 'CompanyWebsite': return context.company?.companyWebsite || customVal || '';
      case 'GST': return context.company?.gstNumber || customVal || '';
      case 'PAN': return context.company?.panNumber || customVal || '';
      case 'CIN': return context.company?.cinNumber || customVal || '';
      case 'CurrentDate': return new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });
      case 'CurrentYear': return new Date().getFullYear().toString();
      case 'EmployeeName': return customVal || '';
      case 'Designation': return customVal || '';
      case 'Department': return customVal || '';
      case 'JoiningDate': return customVal || '';
      case 'Salary': return customVal || '';
      case 'Manager': return customVal || '';
      default: return customVal || `{{${key}}}`;
    }
  }

  static async generateFromTemplate(
    template: Pick<TemplateData, 'htmlTemplate'>,
    variables: Record<string, string>,
    companyProfile?: Record<string, string>
  ): Promise<string> {
    let html = template.htmlTemplate || '';
    const context: PlaceholderContext = { customValues: { ...companyProfile, ...variables } };
    html = this.resolvePlaceholders(html, context);
    return html;
  }

  static async generatePreview(
    template: Pick<TemplateData, 'htmlTemplate'>,
    variables: Record<string, string>
  ): Promise<string> {
    return this.generateFromTemplate(template, variables);
  }

  private static generateShareToken(): string {
    return crypto.randomBytes(24).toString('hex');
  }

  private static hashSharePassword(password: string): string {
    return crypto.createHash('sha256').update(password).digest('hex');
  }

  static async createShare(
    documentId: string,
    tenantId: string,
    userId: string,
    options: { shareType: 'LINK' | 'EMAIL' | 'WHATSAPP'; recipient?: string; password?: string; expiresInDays?: number; maxDownloads?: number; }
  ) {
    const doc = await prisma.document.findFirst({ where: { id: documentId, organizationId: tenantId } });
    if (!doc) throw new Error('Document not found');
    const token = this.generateShareToken();
    const expiresAt = options.expiresInDays ? new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000) : null;
    const share = await prisma.documentShare.create({
      data: {
        documentId, shareType: options.shareType, recipient: options.recipient || null, token,
        password: options.password ? this.hashSharePassword(options.password) : null, expiresAt,
        maxDownloads: options.maxDownloads || null, downloadCount: 0, isActive: true,
      },
    });
    await prisma.auditLog.create({
      data: { organizationId: tenantId, userId, action: 'SHARE_CREATED', entity: 'DocumentShare', entityId: share.id, description: `Share link created for "${doc.title}"` },
    });
    return {
      id: share.id, token: share.token, shareType: share.shareType, recipient: share.recipient,
      password: !!share.password, expiresAt: share.expiresAt, maxDownloads: share.maxDownloads,
      downloadCount: share.downloadCount, isActive: share.isActive, createdAt: share.createdAt,
      shareUrl: `${process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000'}/share/${share.token}`,
    };
  }

  static async getShares(documentId: string, tenantId: string) {
    const shares = await prisma.documentShare.findMany({
      where: { documentId, document: { organizationId: tenantId } },
      orderBy: { createdAt: 'desc' },
    });
    return shares.map((s) => ({
      id: s.id, token: s.token, shareType: s.shareType, recipient: s.recipient,
      password: !!s.password, expiresAt: s.expiresAt, maxDownloads: s.maxDownloads,
      downloadCount: s.downloadCount, isActive: s.isActive, createdAt: s.createdAt,
      shareUrl: `${process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000'}/share/${s.token}`,
    }));
  }

  static async getSharedDocument(token: string, password?: string) {
    const share = await prisma.documentShare.findUnique({
      where: { token },
      include: { document: { select: { id: true, title: true, description: true, documentType: true, htmlContent: true, createdAt: true, updatedAt: true } } },
    });
    if (!share) return { success: false, error: 'Share link not found' };
    if (!share.isActive) return { success: false, error: 'This share link has been revoked' };
    if (share.expiresAt && share.expiresAt < new Date()) return { success: false, error: 'This share link has expired' };
    if (share.maxDownloads && share.downloadCount >= share.maxDownloads) return { success: false, error: 'Maximum downloads reached' };
    if (share.password) {
      if (!password) return { success: false, requiresPassword: true, shareId: share.id };
      const hashedInput = this.hashSharePassword(password);
      if (hashedInput !== share.password) return { success: false, error: 'Invalid password' };
    }
    return { success: true, data: share.document, share };
  }

  static async recordShareDownload(token: string): Promise<boolean> {
    const share = await prisma.documentShare.findUnique({ where: { token } });
    if (!share) return false;
    await prisma.documentShare.update({ where: { id: share.id }, data: { downloadCount: { increment: 1 } } });
    if (share.maxDownloads && share.downloadCount + 1 >= share.maxDownloads) {
      await prisma.documentShare.update({ where: { id: share.id }, data: { isActive: false } });
    }
    return true;
  }

  static async revokeShare(shareId: string, tenantId: string): Promise<void> {
    const share = await prisma.documentShare.findFirst({
      where: { id: shareId, document: { organizationId: tenantId } },
    });
    if (!share) throw new Error('Share not found');
    await prisma.documentShare.update({ where: { id: shareId }, data: { isActive: false } });
  }

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
