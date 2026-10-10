/**
 * Regression tests for two defects that made the product unusable or unsafe.
 *
 * 1. Anonymous callers could read EVERY tenant's PRIVATE templates, including
 *    the full `htmlTemplate`, by requesting `GET /api/templates?type=PRIVATE`.
 *    The tenant OR-clause was only appended when a tenant id was present, so
 *    an anonymous request produced a visibility filter with no ownership
 *    filter at all — a cross-tenant data leak reachable with no credentials.
 *
 * 2. `DocumentEngine.create` silently dropped `htmlContent`, which is the
 *    column the editor loads and every export path renders from. Every
 *    document created from a template therefore opened as a blank editor.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { prismaMocks } = vi.hoisted(() => ({
  prismaMocks: {
    template: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
    },
    document: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    documentVersion: { create: vi.fn() },
    auditLog: { create: vi.fn() },
    category: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMocks }));

import { TemplateEngine } from './template-engine';
import { DocumentEngine } from './document-engine';

const whereOf = () => prismaMocks.template.findMany.mock.calls[0][0].where;

describe('TemplateEngine.list — tenant isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMocks.template.findMany.mockResolvedValue([]);
    prismaMocks.template.count.mockResolvedValue(0);
  });

  it('never returns PRIVATE templates to an anonymous caller', async () => {
    // The exact request an attacker would send: no credentials at all.
    await TemplateEngine.list({ visibility: 'PRIVATE' as never, page: 1, pageSize: 20 });

    const clauses = whereOf().AND as Record<string, unknown>[];
    expect(Array.isArray(clauses)).toBe(true);

    // One of the ANDed clauses must be the anonymous visibility restriction,
    // permitting only PUBLIC and PREMIUM. Intersecting the caller's requested
    // `PRIVATE` filter with it makes the query return nothing, which is the
    // correct outcome — the leak was the absence of this clause entirely.
    const anon = clauses.find((c) => c.OR && !c.visibility && !(c.AND));
    expect(anon, 'anonymous visibility restriction is missing').toBeDefined();
    expect(JSON.stringify(anon)).toContain('PUBLIC');
    expect(JSON.stringify(anon)).toContain('PREMIUM');
    expect(JSON.stringify(anon)).not.toContain('PRIVATE');

    // No clause may grant visibility via another organization's rows.
    for (const c of clauses) {
      if (c.organizationId !== undefined) {
        throw new Error('anonymous caller was scoped to an organization');
      }
    }
  });

  it('always adds a visibility restriction for an anonymous caller', async () => {
    await TemplateEngine.list({ page: 1, pageSize: 20 });
    const serialised = JSON.stringify(whereOf());
    expect(serialised).toContain('PUBLIC');
    expect(serialised).toContain('PREMIUM');
  });

  it('shows a tenant its own templates plus the publicly listable ones', async () => {
    await TemplateEngine.list({ tenantId: 'org_A', page: 1, pageSize: 20 });
    const serialised = JSON.stringify(whereOf());
    expect(serialised).toContain('org_A');
    expect(serialised).toContain('PUBLIC');
    expect(serialised).toContain('PREMIUM');
  });

  it('lets a tenant see its own PRIVATE templates', async () => {
    await TemplateEngine.list({ tenantId: 'org_A', visibility: 'PRIVATE' as never, page: 1, pageSize: 20 });
    const serialised = JSON.stringify(whereOf());
    // Allowed only because the clause also restricts to this organization.
    expect(serialised).toContain('org_A');
  });

  it('still supports the other advertised filters', async () => {
    await TemplateEngine.list({
      tenantId: 'org_A',
      documentCategory: 'Finance',
      search: 'invoice',
      isPremium: false,
      page: 2,
      pageSize: 10,
    });
    const [args] = prismaMocks.template.findMany.mock.calls[0];
    expect(JSON.stringify(args.where)).toContain('Finance');
    expect(JSON.stringify(args.where)).toContain('invoice');
    expect(args.take).toBe(10);
    expect(args.skip).toBe(10);
  });
});

describe('DocumentEngine.create — document body persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMocks.document.create.mockResolvedValue({ id: 'doc-1' });
    prismaMocks.documentVersion.create.mockResolvedValue({});
    prismaMocks.auditLog.create.mockResolvedValue({});
  });

  it('persists htmlContent, the column the editor loads', async () => {
    const html = '<h1>Offer Letter</h1><p>Dear {{EmployeeName}}</p>';
    await DocumentEngine.create(
      { title: 'Offer', documentType: 'HR', content: { html }, htmlContent: html },
      'org-1',
      'user-1'
    );

    const [args] = prismaMocks.document.create.mock.calls[0];
    expect(args.data.htmlContent).toBe(html);
  });

  it('snapshots htmlContent into the initial version', async () => {
    const html = '<p>body</p>';
    await DocumentEngine.create(
      { title: 'Doc', documentType: 'HR', htmlContent: html },
      'org-1',
      'user-1'
    );

    const [args] = prismaMocks.documentVersion.create.mock.calls[0];
    expect(args.data.htmlContent).toBe(html);
  });

  it('stores null rather than undefined when no body is supplied', async () => {
    await DocumentEngine.create({ title: 'Doc', documentType: 'HR' }, 'org-1', 'user-1');
    const [args] = prismaMocks.document.create.mock.calls[0];
    expect(args.data.htmlContent).toBeNull();
  });

  it('still stamps tenant ownership', async () => {
    await DocumentEngine.create({ title: 'Doc', documentType: 'HR' }, 'org-1', 'user-1');
    const [args] = prismaMocks.document.create.mock.calls[0];
    expect(args.data.organizationId).toBe('org-1');
    expect(args.data.userId).toBe('user-1');
  });
});