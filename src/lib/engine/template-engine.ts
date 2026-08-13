import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { toJson } from '@/lib/utils/prisma-json';
import { inferImageSubtype } from '@/lib/utils/image-upload';
import { hasActivePremiumSubscription } from '@/lib/subscription';
import type { TemplateData, TemplateVariable, TemplateVisibility } from '@/types';
import { DocumentEngine } from './document-engine';

/**
 * DocMint Template Engine
 * Manages templates, variable detection, and template import/export.
 */
export class TemplateEngine {
  static async create(
    input: {
      name: string;
      description?: string;
      content?: Record<string, unknown>;
      htmlTemplate?: string;
      variables?: TemplateVariable[];
      category: string;
      visibility?: 'PUBLIC' | 'PRIVATE' | 'ORGANIZATION' | 'PREMIUM' | 'AI';
      isPremium?: boolean;
    },
    tenantId: string | null,
    userId: string | null
  ): Promise<TemplateData> {
    const placeholders = input.htmlTemplate
      ? DocumentEngine.extractPlaceholders(input.htmlTemplate)
      : [];

    // Use user-defined variables if provided, otherwise auto-detect from placeholders
    const variables = input.variables && input.variables.length > 0
      ? input.variables
      : placeholders.map((key) => ({
          key,
          label: this.placeholderToLabel(key),
          type: this.inferVariableType(key),
          required: this.isRequiredPlaceholder(key),
        }));

    // If user provided variables, also ensure all detected placeholders are included
    if (input.variables && input.variables.length > 0) {
      const definedKeys = new Set(input.variables.map(v => v.key));
      for (const key of placeholders) {
        if (!definedKeys.has(key)) {
          variables.push({
            key,
            label: this.placeholderToLabel(key),
            type: this.inferVariableType(key),
            required: this.isRequiredPlaceholder(key),
          });
        }
      }
    }

    const template = await prisma.template.create({
      data: {
        organizationId: tenantId,
        userId,
        name: input.name,
        slug: input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
        description: input.description,
        content: toJson(input.content || {}),
        htmlTemplate: input.htmlTemplate,
        variables: toJson(variables),
        placeholders,
        documentCategory: input.category,
        visibility: input.visibility || 'PRIVATE',
        isPremium: input.isPremium || false,
        version: 1,
      },
    });

    return template as unknown as TemplateData;
  }

  static async update(
    id: string,
    input: Partial<{
      name: string;
      description: string;
      content: Record<string, unknown>;
      htmlTemplate: string;
      variables: TemplateVariable[];
      category: string;
      visibility: 'PUBLIC' | 'PRIVATE' | 'ORGANIZATION' | 'PREMIUM' | 'AI';
      isPremium: boolean;
      isActive: boolean;
      thumbnail: string;
    }>,
    tenantId: string
  ): Promise<TemplateData> {
    const existing = await prisma.template.findFirst({
      where: { id, organizationId: tenantId },
    });

    if (!existing) throw new Error('Template not found');

    let variables: TemplateVariable[] = input.variables && input.variables.length > 0
      ? input.variables
      : (existing.variables as unknown as TemplateVariable[]) || [];
    let placeholders = existing.placeholders;

    // If htmlTemplate changed, re-detect placeholders and merge with user variables
    if (input.htmlTemplate && input.htmlTemplate !== existing.htmlTemplate) {
      const detectedPlaceholders = DocumentEngine.extractPlaceholders(input.htmlTemplate);
      placeholders = detectedPlaceholders;

      // If no user variables provided, auto-generate
      if (!input.variables || input.variables.length === 0) {
        variables = detectedPlaceholders.map((key) => ({
          key,
          label: this.placeholderToLabel(key),
          type: this.inferVariableType(key),
          required: this.isRequiredPlaceholder(key),
        }));
      } else {
        // Ensure all detected placeholders are included in user variables
        const definedKeys = new Set(input.variables.map(v => v.key));
        for (const key of detectedPlaceholders) {
          if (!definedKeys.has(key)) {
            variables.push({
              key,
              label: this.placeholderToLabel(key),
              type: this.inferVariableType(key),
              required: this.isRequiredPlaceholder(key),
            });
          }
        }
      }
    }

    // Build update data, explicitly mapping category to documentCategory
    const updateData: Prisma.TemplateUpdateInput = {
      version: existing.version + 1,
      variables: toJson(variables),
      placeholders,
    };
    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.content !== undefined) updateData.content = toJson(input.content);
    if (input.htmlTemplate !== undefined) updateData.htmlTemplate = input.htmlTemplate;
    if (input.category !== undefined) updateData.documentCategory = input.category; // Map category → documentCategory
    if (input.visibility !== undefined) updateData.visibility = input.visibility;
    if (input.isPremium !== undefined) updateData.isPremium = input.isPremium;
    if (input.isActive !== undefined) updateData.isActive = input.isActive;
    if (input.thumbnail !== undefined) updateData.thumbnail = input.thumbnail;

    const template = await prisma.template.update({
      where: { id },
      data: updateData,
    });

    await prisma.templateVersion.create({
      data: {
        templateId: id,
        version: existing.version + 1,
        content: toJson(input.content || {}),
        htmlTemplate: input.htmlTemplate || existing.htmlTemplate,
        variables: toJson(variables),
        changeNote: 'Updated',
      },
    });

    return template as unknown as TemplateData;
  }

  static async getById(id: string, tenantId?: string | null): Promise<TemplateData | null> {
    const where: Record<string, unknown> = { id };
    if (tenantId) {
      const orClauses: Record<string, unknown>[] = [
        { organizationId: tenantId },
        { visibility: 'PUBLIC' },
        { visibility: 'PREMIUM' },
      ];
      where.OR = orClauses;
    }
    const template = await prisma.template.findFirst({ where });
    return template as unknown as TemplateData | null;
  }

  static async list(options: {
    documentCategory?: string;
    visibility?: string;
    isPremium?: boolean;
    search?: string;
    slug?: string;
    tenantId?: string;
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const conditions: Record<string, unknown>[] = [{ isActive: true }];

    if (options.documentCategory) {
      conditions.push({ documentCategory: options.documentCategory });
    }
    if (options.visibility) {
      conditions.push({ visibility: options.visibility as TemplateVisibility });
    }
    if (options.isPremium !== undefined) {
      conditions.push({ isPremium: options.isPremium });
    }
    if (options.slug) {
      conditions.push({ slug: options.slug });
    }
    if (options.search) {
      conditions.push({
        OR: [
          { name: { contains: options.search, mode: 'insensitive' as const } },
          { description: { contains: options.search, mode: 'insensitive' as const } },
        ],
      });
    }

    const where: Record<string, unknown> = {};
    if (conditions.length > 1 || options.tenantId) {
      // Start with the base conditions (isActive, category, search, etc.) joined by AND
      const allClauses: Record<string, unknown>[] = conditions;
      
      // For tenant access: show own templates OR public/premium templates
      if (options.tenantId) {
        allClauses.push({
          OR: [
            { organizationId: options.tenantId },
            { visibility: 'PUBLIC' },
            { visibility: 'PREMIUM' },
          ],
        });
      }
      
      where.AND = allClauses;
    } else if (conditions.length === 1) {
      Object.assign(where, conditions[0]);
    }

    const page = options.page || 1;
    const pageSize = options.pageSize || 20;

    const [data, total] = await Promise.all([
      prisma.template.findMany({
        where,
        orderBy: { [options.sortBy || 'usageCount']: options.sortOrder || 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          category: { select: { name: true, icon: true } },
          user: { select: { name: true, image: true } },
        },
      }),
      prisma.template.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  /**
   * Whether a caller may see/render premium template content (htmlTemplate,
   * placeholders, content): admins manage templates; everyone else needs an
   * active Premium subscription on their organization.
   */
  static async canAccessPremiumContent(session: {
    user?: { role?: string | null; organizationId?: string | null } | null;
  } | null): Promise<boolean> {
    if (!session?.user) return false;
    if (session.user.role === 'SUPER_ADMIN' || session.user.role === 'ADMIN') return true;
    return hasActivePremiumSubscription(session.user.organizationId);
  }

  /**
   * Strip the paywalled fields (htmlTemplate, placeholders, content, variables)
   * from a premium template when the caller has no premium access. Metadata
   * (name, description, thumbnail, isPremium, …) is kept so the UI can render
   * a lock card instead of the editor.
   */
  static async sanitizeTemplateForCaller<T extends Record<string, unknown>>(
    template: T,
    session: {
      user?: { role?: string | null; organizationId?: string | null } | null;
    } | null
  ): Promise<T> {
    if (!template.isPremium) return template;
    if (await this.canAccessPremiumContent(session)) return template;

    const sanitized = { ...template };
    delete sanitized.htmlTemplate;
    delete sanitized.placeholders;
    delete sanitized.content;
    delete sanitized.variables;
    return sanitized;
  }

  static async delete(id: string, tenantId: string): Promise<void> {
    await prisma.template.delete({
      where: { id, organizationId: tenantId },
    });
  }

  static async duplicate(id: string, tenantId: string, userId: string): Promise<TemplateData> {
    const original = await prisma.template.findFirst({
      where: { id, organizationId: tenantId },
    });

    if (!original) throw new Error('Template not found');

    return this.create(
      {
        name: `${original.name} (Copy)`,
        description: original.description || undefined,
        content: original.content as Record<string, unknown>,
        htmlTemplate: original.htmlTemplate || undefined,
        category: original.documentCategory,
        visibility: original.visibility,
        isPremium: false,
      },
      tenantId,
      userId
    );
  }

  static async trackUsage(id: string): Promise<void> {
    await prisma.template.update({
      where: { id },
      data: { usageCount: { increment: 1 } },
    });
  }

  static placeholderToLabel(key: string): string {
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()).trim();
  }

  static inferVariableType(key: string): TemplateVariable['type'] {
    const lower = key.toLowerCase();
    if (lower.includes('date') || lower.includes('joining') || lower.includes('created')) return 'date';
    if (lower.includes('email')) return 'email';
    if (lower.includes('salary') || lower.includes('amount') || lower.includes('price') || lower.includes('total')) return 'number';
    // Only image-eligible fields (logo/sign/stamp/header/…) may be image or
    // signature type — word-safe, so "Designation" stays text.
    const imageSubtype = inferImageSubtype(key);
    if (imageSubtype) return imageSubtype;
    if (lower.includes('address') || lower.includes('description') || lower.includes('note') || lower.includes('terms')) return 'textarea';
    if (lower.includes('gender') || lower.includes('type') || lower.includes('status') || lower.includes('department')) return 'select';
    return 'text';
  }

  static isRequiredPlaceholder(key: string): boolean {
    const optional = ['photo', 'image', 'optional', 'seal', 'watermark'];
    return !optional.some((o) => key.toLowerCase().includes(o));
  }

  static async getCategories() {
    const categories = await prisma.template.groupBy({
      by: ['documentCategory'],
      _count: true,
      where: { isActive: true },
    });

    return categories.map((c) => ({
      name: c.documentCategory,
      count: c._count,
    }));
  }
}
