import { NextRequest, NextResponse } from 'next/server';
import { TemplateEngine } from '@/lib/engine/template-engine';
import { DocumentEngine } from '@/lib/engine/document-engine';
import { validateImageVariables } from '@/lib/utils/image-upload';

// Prevent static rendering - this route needs to call the database
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
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
