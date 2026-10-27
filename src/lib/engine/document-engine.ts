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
import { sanitizeHtmlFragment } from '@/lib/security/sanitize-html';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

/**
 * Server-side HTML sanitizer for generated documents.
 *
 * Templates are user-generated HTML, and a malicious PUBLIC template (or any
 * document shared publicly) could otherwise embed script that runs when a
 * victim opens the preview or the downloaded .html file. Variable values are
 * interpolated raw, so both the template and the values are attack inputs.
 *
 * The previous implementation was a regex *blocklist*:
 *
 *   out.replace(/(href|src)\s*=\s*(['"]?)\s*javascript\s*:/gi, '$1=$2#')
 *
 * which is bypassed by entity encoding (`&#106;avascript:`), embedded control
 * characters (`java&#x09;script:`), and elements the blocklist never
 * mentioned (`<svg><animate attributeName="href" values="javascript:…">`,
 * `<form action=…>`, `<math><mtext>` mXSS).
 *
 * It is now an allowlist sanitizer: unknown elements are unwrapped, scripting
 * and re-entrant-parsing elements are removed with their subtree, unknown
 * attributes are dropped, and URL schemes are checked *after* entity decoding.
 * See `src/lib/security/sanitize-html.ts` for the full rationale.
 */
export function sanitizeDocumentHtml(html: string): string {
  if (!html) return html;

  // A stored template may be a complete HTML document. Sanitize each part with
  // the same policy, but keep the document shell: `extractBodyContent()` keys
  // off `<!DOCTYPE html>` / `<body>`, and `<meta charset>` is load-bearing for
  // the downloaded file. Nothing inside <head> other than <style>/<title> is
  // carried over.
  const fullDocument = /<!DOCTYPE\s+html|<html[\s>]/i.test(html);
  if (!fullDocument) return sanitizeHtmlFragment(html);

  const styleTags: string[] = [];
  const styleRegex = /<style[^>]*>[\s\S]*?<\/style\s*>/gi;
  let styleMatch: RegExpExecArray | null;
  while ((styleMatch = styleRegex.exec(html)) !== null) {
    const safe = sanitizeHtmlFragment(styleMatch[0]);
    if (safe) styleTags.push(safe);
  }

  const bodyMatch = /<body[^>]*>([\s\S]*)<\/body\s*>/i.exec(html);
  if (!bodyMatch) return sanitizeHtmlFragment(html);

  return styleTags.join('\n') + '\n' + sanitizeHtmlFragment(bodyMatch[1]);
}

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
  // Sanitize BEFORE the SVG inlining and before the onerror injection below:
  //   - user HTML reaches this function unsanitized from the public-share
  //     download and instant-download routes, so this is the last gate before
  //     markup is served from the DocMint origin;
  //   - replaceSvgDataUris turns an inert <img src="data:image/svg+xml"> into
  //     LIVE inline <svg>, which would otherwise resurrect script that the
  //     sanitizer removed from the surrounding document;
  //   - the onerror handler is added by the application itself afterwards, so
  //     it is never stripped.
  let processedHtml = sanitizeHtmlFragment(html || '');

  // Convert SVG data URIs to inline SVGs (each payload is itself sanitized
  // inside cleanSvgMarkup).
  processedHtml = replaceSvgDataUris(processedHtml);

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
 * Truncate a document body to a real preview.
 *
 * The "sample" download for a premium template used to return the *entire*
 * template body with a watermark `<div>` layered on top. A watermark is a
 * `<div>` in the HTML: deleting it costs one line of JavaScript, so the
 * paywall leaked the complete premium template. This cuts the body at a
 * top-level element boundary instead, so a sample genuinely cannot be
 * reassembled into the paid document.
 *
 * Cutting only at depth-0 boundaries guarantees well-formed output (no tag is
 * sliced in half); a mid-element fallback exists for the case where the first
 * top-level element alone exceeds the budget.
 */
export function truncateSampleBody(
  html: string,
  maxChars = 3000
): { html: string; truncated: boolean } {
  const source = sanitizeHtmlFragment(html || '');
  if (source.length <= maxChars) return { html: source, truncated: false };

  const VOID = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
    'param', 'source', 'track', 'wbr',
  ]);
  const TAG = /<\/?([a-zA-Z][a-zA-Z0-9:._-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;

  const blockBoundaries: number[] = [];
  const anyBoundary: number[] = [];
  let depth = 0;
  let match: RegExpExecArray | null;

  while ((match = TAG.exec(source)) !== null) {
    const full = match[0];
    const name = match[1].toLowerCase();
    anyBoundary.push(match.index + full.length);

    if (full.startsWith('</')) {
      depth = Math.max(0, depth - 1);
      if (depth === 0) blockBoundaries.push(match.index + full.length);
    } else if (!/\/\s*>$/.test(full) && !VOID.has(name)) {
      depth += 1;
    }
  }
  // Unbalanced markup: the tail is still a usable cut point.
  blockBoundaries.push(source.length);
  anyBoundary.push(source.length);

  const pick = (points: number[]) => points.filter((p) => p <= maxChars).pop() ?? 0;
  let cut = pick(blockBoundaries);
  if (cut === 0) cut = pick(anyBoundary);
  if (cut === 0) return { html: '', truncated: true };

  return { html: source.slice(0, cut), truncated: cut < source.length };
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
        // The document body. Omitting this made every document created from a
        // template open as a blank editor, because this is the column the
        // editor loads and every export path renders from.
        htmlContent: input.htmlContent ?? null,
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
        htmlContent: input.htmlContent ?? null,
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
   * Columns a caller may write on update.
   *
   * This is an explicit allowlist rather than a spread of the request body.
   * `Prisma.DocumentUpdateInput` is a union that includes
   * `DocumentUncheckedUpdateInput`, which accepts `organizationId`, `userId`,
   * `id`, `deletedAt` and every other ownership column — and that TypeScript
   * annotation is erased at runtime. Spreading the parsed body straight into
   * `data` therefore let any signed-in user re-parent their own document into
   * another tenant (and into another user's document list) with a single PATCH,
   * because the scoping check above only validated the row's CURRENT owner.
   *
   * Ownership and lifecycle columns (`organizationId`, `userId`, `id`,
   * `createdAt`, `deletedAt`, `version`, `password`, …) are deliberately absent
   * and must be changed through a purpose-built method.
   */
  private static pickUpdatableFields(input: DocumentUpdateInput): Prisma.DocumentUpdateInput {
    const allowed = [
      'title',
      'description',
      'documentType',
      'categoryId',
      'folderId',
      'content',
      'htmlContent',
      'plainText',
      'variables',
      'status',
      'isFavorite',
      'isArchived',
      'tags',
    ] as const;

    const data: Record<string, unknown> = {};
    // The declared `DocumentUpdateInput` omits columns the database has
    // (`htmlContent`, `plainText`) because routes pass the parsed JSON body
    // straight through, so index a record view rather than the narrow type.
    const source = input as unknown as Record<string, unknown>;
    for (const field of allowed) {
      if (source[field] !== undefined) data[field] = source[field];
    }
    return data as Prisma.DocumentUpdateInput;
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
        ...DocumentEngine.pickUpdatableFields(input),
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
   * Also deactivates all active share links for the document.
   */
  static async delete(id: string, tenantId: string, userId: string): Promise<void> {
    const doc = await prisma.document.findFirst({
      where: { id, organizationId: tenantId },
    });
    if (!doc) throw new Error('Document not found or access denied');
    await prisma.$transaction(async (tx) => {
      await tx.document.update({
        where: { id },
        data: { deletedAt: new Date(), status: 'DELETED' },
      });
      // Deactivate all active shares so existing tokens cannot access the deleted document
      await tx.documentShare.updateMany({
        where: { documentId: id, isActive: true },
        data: { isActive: false },
      });
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
    // Sanitize AFTER resolution — template HTML and client-supplied variable
    // values both flow into the final document, and either could carry script.
    return sanitizeDocumentHtml(html);
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

  /**
   * Hash a share password with bcrypt (salted, slow) before storing it on the
   * DocumentShare row. Public so the share download route can hash without
   * reimplementing it.
   */
  static async hashSharePassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  /**
   * Verify a share password against the stored hash. New hashes are bcrypt;
   * pre-upgrade rows stored unsalted SHA-256 hex (64 chars) — those are still
   * accepted so existing password-protected shares keep working, but any new
   * share (or password change) is bcrypt.
   */
  static async verifySharePassword(
    password: string,
    storedHash: string | null | undefined
  ): Promise<boolean> {
    if (!storedHash) return false;
    if (/^[a-f0-9]{64}$/i.test(storedHash)) {
      const legacy = crypto.createHash('sha256').update(password).digest('hex');
      return legacy === storedHash;
    }
    return bcrypt.compare(password, storedHash);
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
        password: options.password ? await this.hashSharePassword(options.password) : null, expiresAt,
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
      include: { document: { select: { id: true, title: true, description: true, documentType: true, htmlContent: true, createdAt: true, updatedAt: true, deletedAt: true, status: true } } },
    });
    if (!share) return { success: false, error: 'Share link not found' };
    if (!share.isActive) return { success: false, error: 'This share link has been revoked' };
    if (share.expiresAt && share.expiresAt < new Date()) return { success: false, error: 'This share link has expired' };
    if (share.maxDownloads && share.downloadCount >= share.maxDownloads) return { success: false, error: 'Maximum downloads reached' };
    if (share.password) {
      if (!password) return { success: false, requiresPassword: true, shareId: share.id };
      const ok = await this.verifySharePassword(password, share.password);
      if (!ok) return { success: false, error: 'Invalid password' };
    }
    // Defense in depth: reject if the underlying document has been soft-deleted
    if (!share.document || share.document.deletedAt || share.document.status === 'DELETED') {
      return { success: false, error: 'Share link not found' };
    }

    /**
     * Sanitize before returning. This route is unauthenticated and the content
     * is attacker-controlled (template HTML and document variable values are
     * both interpolated raw), so the JSON feeds `dangerouslySetInnerHTML` on
     * the share page. Returning the raw column made that a stored-XSS sink on
     * the DocMint origin.
     */
    const data = {
      ...share.document,
      htmlContent: share.document.htmlContent
        ? sanitizeHtmlFragment(share.document.htmlContent)
        : share.document.htmlContent,
    };

    // NOTE: the full `share` row is deliberately not returned. It carries
    // `password` (the bcrypt hash), which previously shipped to every
    // anonymous visitor of a password-protected share link — a hash leak that
    // makes offline cracking of a user-chosen share password realistic.
    return { success: true, data };
  }

  /**
   * Atomically consume one download from the share's allowance.
   *
   * The previous read-then-increment had a check-then-act race: N concurrent
   * requests all read `downloadCount` before any of them wrote, so a share
   * limited to 1 download could be downloaded many times in parallel. The
   * limit is now part of the UPDATE's WHERE clause, which the database
   * evaluates under a row lock.
   *
   * @returns true when a download was recorded, false when the share is
   *          unknown, inactive or its allowance is exhausted.
   */
  static async recordShareDownload(token: string): Promise<boolean> {
    const share = await prisma.documentShare.findUnique({
      where: { token },
      select: { id: true, maxDownloads: true },
    });
    if (!share) return false;

    // `download_count < max_downloads` is evaluated atomically with the
    // increment, so the allowance cannot be oversubscribed.
    const claimed = await prisma.documentShare.updateMany({
      where: {
        id: share.id,
        isActive: true,
        ...(share.maxDownloads !== null
          ? { downloadCount: { lt: share.maxDownloads } }
          : {}),
      },
      data: { downloadCount: { increment: 1 } },
    });
    if (claimed.count === 0) return false;

    // Deactivate once the allowance is used up, so the link stops resolving.
    if (share.maxDownloads !== null) {
      await prisma.documentShare.updateMany({
        where: {
          id: share.id,
          downloadCount: { gte: share.maxDownloads },
          isActive: true,
        },
        data: { isActive: false },
      });
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
