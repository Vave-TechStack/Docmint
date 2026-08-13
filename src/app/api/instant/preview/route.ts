import { NextRequest, NextResponse } from 'next/server';
import { TemplateEngine } from '@/lib/engine/template-engine';
import { DocumentEngine } from '@/lib/engine/document-engine';
import { validateImageVariables } from '@/lib/utils/image-upload';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

// Prevent static rendering - this route needs to call the database
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Abuse guard: rendering is CPU-heavy, so cap previews per IP.
    const ip = getClientIp(request);
    if (!checkRateLimit(`preview:${ip}`, 30, 60_000)) {
      return NextResponse.json(
        { success: false, error: 'Too many preview requests. Please slow down.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { templateId, variables } = body;

    if (!templateId || !variables) {
      return NextResponse.json(
        { success: false, error: 'Missing templateId or variables' },
        { status: 400 }
      );
    }

    // Enforce the shared image whitelist + size policy on data-URL variables
    const imageError = validateImageVariables(variables);
    if (imageError) {
      return NextResponse.json(
        { success: false, error: imageError },
        { status: 400 }
      );
    }

    // Fetch template
    const template = await TemplateEngine.getById(templateId);
    if (!template) {
      return NextResponse.json(
        { success: false, error: 'Template not found' },
        { status: 404 }
      );
    }

    // Premium templates are sold through the Template Library behind the
    // Premium subscription — block the free ₹9 preview flow so it can't be
    // used to extract premium template content without paying.
    if (template.isPremium) {
      return NextResponse.json(
        {
          success: false,
          error: 'Premium templates require a DocMint Premium subscription. Get this template from the Template Library.',
        },
        { status: 403 }
      );
    }

    // Generate preview
    const html = await DocumentEngine.generatePreview(template, variables);

    return NextResponse.json({
      success: true,
      data: {
        html,
        title: template.name,
        documentCategory: template.documentCategory,
      },
    });
  } catch (error) {
    console.error('Preview generation error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate preview' },
      { status: 500 }
    );
  }
}
