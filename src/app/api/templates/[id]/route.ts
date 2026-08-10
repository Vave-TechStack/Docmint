import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { TemplateEngine } from '@/lib/engine/template-engine';
import { findSampleById, sampleToTemplateData } from '@/lib/data/sample-templates';
import { validateVariableDefaultImages } from '@/lib/utils/image-upload';

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
        return NextResponse.json({ success: true, data: template });
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
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    // Enforce the shared image whitelist + size policy on variable defaults
    const imageError = validateVariableDefaultImages((body as { variables?: unknown }).variables);
    if (imageError) {
      return NextResponse.json(
        { success: false, error: imageError },
        { status: 400 }
      );
    }

    const template = await TemplateEngine.update(
      id,
      body,
      session.user.organizationId!
    );

    return NextResponse.json({ success: true, data: template });
  } catch (error) {
    console.error('Template update error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update template' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    await TemplateEngine.delete(id, session.user.organizationId!);

    return NextResponse.json({ success: true, message: 'Template deleted' });
  } catch (error) {
    console.error('Template delete error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete template' },
      { status: 500 }
    );
  }
}
