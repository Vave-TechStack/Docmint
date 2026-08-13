import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { TemplateEngine } from '@/lib/engine/template-engine';
import { querySampleTemplates, sampleToTemplateData } from '@/lib/data/sample-templates';
import { validateVariableDefaultImages } from '@/lib/utils/image-upload';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const { searchParams } = new URL(request.url);

    const isPremiumParam = searchParams.get('isPremium');
    const isPremium = isPremiumParam === 'true' ? true : isPremiumParam === 'false' ? false : undefined;

    const options = {
      documentCategory: searchParams.get('category') || undefined,
      visibility: searchParams.get('type') || undefined,
      isPremium,
      search: searchParams.get('search') || undefined,
      slug: searchParams.get('slug') || undefined,
      page: parseInt(searchParams.get('page') || '1'),
      pageSize: parseInt(searchParams.get('pageSize') || '20'),
      sortBy: searchParams.get('sortBy') || 'usageCount',
      sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc',
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
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Enforce the shared image whitelist + size policy on variable defaults
    const imageError = validateVariableDefaultImages((body as { variables?: unknown }).variables);
    if (imageError) {
      return NextResponse.json(
        { success: false, error: imageError },
        { status: 400 }
      );
    }

    const template = await TemplateEngine.create(
      body,
      session.user.organizationId!,
      session.user.id
    );

    return NextResponse.json({ success: true, data: template });
  } catch (error) {
    console.error('Template creation error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create template' },
      { status: 500 }
    );
  }
}
