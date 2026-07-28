import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { TemplateEngine } from '@/lib/engine/template-engine';
import { DocumentEngine } from '@/lib/engine/document-engine';
import { PDFGenerator } from '@/lib/pdf/pdf-generator';
import { DOCXGenerator } from '@/lib/docx/docx-generator';
import { generateSampleVariables } from '@/lib/data/sample-data';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  try {
    // Authenticate user (optional - allow both logged-in and public template downloads)
    const session = await auth();
    const body = await request.json();
    const { variables, format } = body;

    if (!variables || !format) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: variables, format' },
        { status: 400 }
      );
    }

    if (format !== 'pdf' && format !== 'docx') {
      return NextResponse.json(
        { success: false, error: 'Unsupported format. Use "pdf" or "docx".' },
        { status: 400 }
      );
    }

    // Fetch template
    const template = await TemplateEngine.getById(
      id,
      session?.user?.organizationId || null
    );
    if (!template) {
      return NextResponse.json(
        { success: false, error: 'Template not found' },
        { status: 404 }
      );
    }

    // If sample=true, use auto-generated sample data instead
    const resolvedVariables = body.sample
      ? generateSampleVariables((template.variables || []).map((v: { key: string }) => v.key))
      : variables;

    // Generate document HTML from template + variables
    const html = await DocumentEngine.generateFromTemplate(template, resolvedVariables);

    // Generate requested format
    let fileBuffer: Buffer;
    let contentType: string;
    let fileName: string;

    if (format === 'pdf') {
      fileBuffer = await PDFGenerator.generate(html, {
        format: 'pdf',
        title: template.name,
      });
      contentType = 'application/pdf';
      fileName = `${template.slug || 'document'}.pdf`;
    } else {
      fileBuffer = await DOCXGenerator.generate(html, {
        format: 'docx',
        title: template.name,
      });
      contentType =
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      fileName = `${template.slug || 'document'}.docx`;
    }

    // Track usage
    await TemplateEngine.trackUsage(id).catch(() => {});

    // Return with sample suffix for sample downloads
    if (body.sample) {
      fileName = `${template.slug || 'document'}-sample.${format === 'pdf' ? 'pdf' : 'docx'}`;
    }

    return new NextResponse(new Uint8Array(fileBuffer), {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': fileBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Template download error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate document' },
      { status: 500 }
    );
  }
}
