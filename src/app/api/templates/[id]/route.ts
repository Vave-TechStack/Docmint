import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { TemplateEngine } from '@/lib/engine/template-engine';
import { findSampleById, sampleToTemplateData } from '@/lib/data/sample-templates';
import { validateVariableDefaultImages } from '@/lib/utils/image-upload';
import { validateExternalImageUrl } from '@/lib/security/image-url';
import { requireUserScope } from '@/lib/security/authorization';
import {
  assertSameOrigin,
  readJsonBody,
  isPlainObject,
  cleanString,
  ValidationError,
} from '@/lib/security/request';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const { id } = await params;
    const tenantId = session?.user?.organizationId;

    // Try database first
    try {
      const template = await TemplateEngine.getById(id, tenantId);
      if (template) {
        // Premium templates: strip paywalled fields (htmlTemplate, variables,
        // placeholders, content) unless the caller holds premium access — the
        // download route is gated too, but the raw HTML must not leak here.
        const sanitized = await TemplateEngine.sanitizeTemplateForCaller(
          template as unknown as Record<string, unknown>,
          session
        );
        return NextResponse.json({ success: true, data: sanitized });
      }
    } catch (dbError) {
      console.warn('DB unavailable for template detail, checking fallback:', (dbError as Error)?.message);
    }

    // Fallback: check static sample data
    const sample = findSampleById(id);
    if (sample) {
      return NextResponse.json({
        success: true,
        data: sampleToTemplateData(sample),
        usingFallback: true,
      });
    }

    return NextResponse.json(
      { success: false, error: 'Template not found' },
      { status: 404 }
    );
  } catch (error) {
    console.error('Template get error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch template' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const scope = await requireUserScope(request);
  if (!scope.ok) return scope.response;

  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  try {
    const { id } = await params;
    const body = await readJsonBody(request);
    if (!isPlainObject(body)) {
      return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    }

    // Enforce the shared image whitelist + size policy on variable defaults
    const imageError = validateVariableDefaultImages(body.variables);
    if (imageError) {
      return NextResponse.json(
        { success: false, error: imageError },
        { status: 400 }
      );
    }

    // Build an explicit allowlist of mutable fields instead of forwarding the
    // whole body: `organizationId`, `slug`, `usageCount` and `version` are all
    // settable on the Prisma model, so a raw spread let a caller re-parent a
    // template to another tenant.
    const input: Record<string, unknown> = {};
    if (body.name !== undefined) input.name = cleanString(body.name, 200, { required: true });
    if (body.description !== undefined) input.description = cleanString(body.description, 1000);
    if (body.category !== undefined) input.category = cleanString(body.category, 64, { required: true });
    if (body.htmlTemplate !== undefined) input.htmlTemplate = cleanString(body.htmlTemplate, 500_000);
    if (body.content !== undefined && isPlainObject(body.content)) input.content = body.content;
    if (Array.isArray(body.variables)) input.variables = body.variables;
    if (body.thumbnail !== undefined) {
      // Any signed-in org member can set this (there is no admin check), and it
      // renders through `<Image unoptimized>`, which bypasses
      // `images.remotePatterns` entirely. `cleanString` only capped length, so
      // this accepted any http(s) URL and made the browser request it.
      const thumbnail = validateExternalImageUrl(body.thumbnail, {
        allowEmpty: true,
        field: 'thumbnail',
      });
      if (!thumbnail.valid) {
        return NextResponse.json(
          { success: false, error: thumbnail.reason },
          { status: 400 }
        );
      }
      input.thumbnail = thumbnail.value ? thumbnail.value : null;
    }

    const visibility = cleanString(body.visibility, 20).toUpperCase();
    const allowedVisibility = ['PUBLIC', 'PRIVATE', 'ORGANIZATION', 'PREMIUM', 'AI'];
    if (visibility) {
      if (!allowedVisibility.includes(visibility)) {
        return NextResponse.json(
          { success: false, error: `visibility must be one of: ${allowedVisibility.join(', ')}` },
          { status: 400 }
        );
      }
      input.visibility = visibility;
    }

    for (const flag of ['isPremium', 'isActive'] as const) {
      if (body[flag] !== undefined) {
        if (typeof body[flag] !== 'boolean') {
          return NextResponse.json(
            { success: false, error: `${flag} must be a boolean` },
            { status: 400 }
          );
        }
        input[flag] = body[flag];
      }
    }

    if (Object.keys(input).length === 0) {
      return NextResponse.json({ success: false, error: 'No valid fields to update' }, { status: 400 });
    }

    const template = await TemplateEngine.update(
      id,
      input as Parameters<typeof TemplateEngine.update>[1],
      scope.organizationId
    );

    return NextResponse.json({ success: true, data: template });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error('Template update error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update template' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const scope = await requireUserScope(request);
  if (!scope.ok) return scope.response;

  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  try {
    const { id } = await params;
    await TemplateEngine.delete(id, scope.organizationId);

    return NextResponse.json({ success: true, message: 'Template deleted' });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error('Template delete error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete template' },
      { status: 500 }
    );
  }
}
