import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { TemplateEngine } from '@/lib/engine/template-engine';
import { querySampleTemplates, sampleToTemplateData } from '@/lib/data/sample-templates';
import { validateVariableDefaultImages } from '@/lib/utils/image-upload';
import { requireUserScope } from '@/lib/security/authorization';
import {
  assertSameOrigin,
  readJsonBody,
  isPlainObject,
  cleanString,
  boundedInt,
  ValidationError,
} from '@/lib/security/request';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const { searchParams } = new URL(request.url);

    const isPremiumParam = searchParams.get('isPremium');
    const isPremium = isPremiumParam === 'true' ? true : isPremiumParam === 'false' ? false : undefined;

    // The catalogue is intentionally browsable without a session, so this route
    // stays public. Note that a stale/absent session simply means anonymous
    // visibility in `TemplateEngine.list` plus the premium-field stripping in
    // `sanitizeTemplateForCaller`; `requireUserScope` is not appropriate here.
    const options = {
      documentCategory: cleanString(searchParams.get('category'), 64) || undefined,
      visibility: cleanString(searchParams.get('type'), 20) || undefined,
      isPremium,
      search: cleanString(searchParams.get('search'), 120) || undefined,
      slug: cleanString(searchParams.get('slug'), 120) || undefined,
      // `parseInt` previously produced `NaN` for absent/garbage input, which
      // propagated into the Prisma `skip`/`take` and the `totalPages` math.
      page: boundedInt(searchParams.get('page'), { min: 1, max: 10_000 }) ?? 1,
      pageSize: boundedInt(searchParams.get('pageSize'), { min: 1, max: 100 }) ?? 20,
      sortBy: cleanString(searchParams.get('sortBy'), 40) || 'usageCount',
      sortOrder: (searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc',
      tenantId: session?.user?.organizationId,
    };

    // Try database first, fall back to static sample data on failure
    try {
      const result = await TemplateEngine.list(options);
      // If DB returned data, use it
      if (result.data && result.data.length > 0) {
        // Premium templates: strip paywalled fields (htmlTemplate, variables,
        // placeholders, content) unless the caller holds premium access. The
        // instant (₹9) flow only ever requests isPremium=false templates, so
        // its client-side rendering keeps working unchanged.
        const data = await Promise.all(
          result.data.map((t) =>
            TemplateEngine.sanitizeTemplateForCaller(t as Record<string, unknown>, session)
          )
        );
        return NextResponse.json({ success: true, ...result, data });
      }
    } catch (dbError) {
      console.warn('DB unavailable, using fallback template data:', (dbError as Error)?.message);
    }

    // Fallback: return static sample templates
    const fallbackResult = querySampleTemplates(options);

    // Slug lookup (instant page) needs the full template shape — typed variables
    // + generated HTML — else the form renders no editable fields. Merge keeps
    // the list metadata (placeholders, category, user) alongside the full data.
    if (options.slug && fallbackResult.data.length === 1) {
      const full = sampleToTemplateData(fallbackResult.data[0]);
      fallbackResult.data = [{ ...full, ...fallbackResult.data[0] }];
    }

    return NextResponse.json({ success: true, ...fallbackResult, usingFallback: true });
  } catch (error) {
    console.error('Templates list error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch templates' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const scope = await requireUserScope(request);
  if (!scope.ok) return scope.response;

  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  try {
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

    /**
     * `TemplateEngine.create` requires `name` and `category`. The route used to
     * forward the raw parsed body, so the compiler never checked the shape and
     * a request missing either field reached the database. Validate the
     * required fields and bound the free-text/template fields here.
     */
    const name = cleanString(body.name, 200, { required: true });
    const category = cleanString(body.category, 64, { required: true });
    if (!name) {
      return NextResponse.json({ success: false, error: 'Template name is required' }, { status: 400 });
    }
    if (!category) {
      return NextResponse.json({ success: false, error: 'Template category is required' }, { status: 400 });
    }

    const visibility = cleanString(body.visibility, 20).toUpperCase();
    const allowedVisibility = ['PUBLIC', 'PRIVATE', 'ORGANIZATION', 'PREMIUM', 'AI'];
    if (visibility && !allowedVisibility.includes(visibility)) {
      return NextResponse.json(
        { success: false, error: `visibility must be one of: ${allowedVisibility.join(', ')}` },
        { status: 400 }
      );
    }

    if (body.isPremium !== undefined && typeof body.isPremium !== 'boolean') {
      return NextResponse.json({ success: false, error: 'isPremium must be a boolean' }, { status: 400 });
    }

    const input = {
      name,
      category,
      description: cleanString(body.description, 1000) || undefined,
      htmlTemplate: cleanString(body.htmlTemplate, 500_000) || undefined,
      content: (isPlainObject(body.content) ? body.content : undefined) as Record<string, unknown> | undefined,
      variables: Array.isArray(body.variables)
        ? (body.variables as Parameters<typeof TemplateEngine.create>[0]['variables'])
        : undefined,
      visibility: (visibility || 'PRIVATE') as NonNullable<
        Parameters<typeof TemplateEngine.create>[0]['visibility']
      >,
      isPremium: body.isPremium as boolean | undefined,
    };

    const template = await TemplateEngine.create(input, scope.organizationId, scope.userId);

    return NextResponse.json({ success: true, data: template });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error('Template creation error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create template' },
      { status: 500 }
    );
  }
}
