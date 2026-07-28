import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { TemplateEngine } from '@/lib/engine/template-engine';
import { querySampleTemplates } from '@/lib/data/sample-templates';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const { searchParams } = new URL(request.url);

    const options = {
      documentCategory: searchParams.get('category') || undefined,
      visibility: searchParams.get('type') || undefined,
      isPremium: searchParams.get('isPremium') === 'true' ? true : undefined,
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
        return NextResponse.json({ success: true, ...result });
      }
    } catch (dbError) {
      console.warn('DB unavailable, using fallback template data:', (dbError as Error)?.message);
    }

    // Fallback: return static sample templates
    const fallbackResult = querySampleTemplates(options);
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
    const template = await TemplateEngine.create(
      body,
      session.user.organizationId,
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
