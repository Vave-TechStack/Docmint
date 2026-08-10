import { NextRequest, NextResponse } from 'next/server';
import type { TemplateData } from '@/types';
import { DocumentEngine, wrapStyledHtml, extractBodyContent, applySampleWatermark } from '@/lib/engine/document-engine';
import { DOCXGenerator } from '@/lib/docx/docx-generator';
import { resolveTemplateWithFallback } from '@/lib/data/sample-templates';
import { replaceSvgDataUris } from '@/lib/utils/image-placeholders';
import { validateImageVariables, validateImageDataUrl } from '@/lib/utils/image-upload';
import { sanitizeCustomSections, injectCustomSections } from '@/lib/utils/custom-sections';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { templateId, variables = {}, format = 'pdf', htmlContent, htmlTemplate } = body;

    if (!templateId) {
      return NextResponse.json(
        { success: false, error: 'Missing templateId' },
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

    // User-added custom content (logo / header / footer / extra fields). Only
    // accept a base64 image data URL for the logo (same policy as uploads).
    const customSections = sanitizeCustomSections(body.customSections);
    if (customSections?.logo) {
      const logoError = validateImageDataUrl(customSections.logo);
      if (logoError) {
        return NextResponse.json({ success: false, error: logoError }, { status: 400 });
      }
    }

    // Resolve the template — DB first, static sample fallback (the same
    // resolution every other template route uses), so the sample API works
    // even when the client doesn't send the HTML back and the DB is empty.
    let template: TemplateData | null = null;
    try {
      template = await resolveTemplateWithFallback(templateId);
    } catch (dbErr) {
      console.warn('[Sample API] Template resolution failed:', dbErr);
    }

    // Last resort: the client may still send the HTML it already loaded
    const fallbackHtml = htmlContent || htmlTemplate;
    if ((!template || !template.htmlTemplate) && fallbackHtml) {
      template = {
        id: templateId,
        name: 'Document',
        slug: 'document',
        htmlTemplate: fallbackHtml,
        variables: [],
        content: {},
        documentCategory: 'General',
        visibility: 'PUBLIC' as const,
        isPremium: false,
        isDefault: false,
        usageCount: 0,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    if (!template || !template.htmlTemplate) {
      return NextResponse.json(
        { success: false, error: 'Template content not available' },
        { status: 400 }
      );
    }

    // Prepare sample variables — fill empty ones with sample data
    const filledVariables = { ...variables };
    if (template.variables && Array.isArray(template.variables)) {
      template.variables.forEach((v: { key: string; label?: string; defaultValue?: string }) => {
        if (!filledVariables[v.key] && !v.key.startsWith('_')) {
          filledVariables[v.key] = v.defaultValue || `[Sample ${v.label || v.key}]`;
        }
      });
    }

    // Generate base document HTML
    const html = await DocumentEngine.generateFromTemplate(template, filledVariables);

    // Strip outer <html>/<body> boilerplate to avoid invalid nested HTML
    const bodyContent = extractBodyContent(html);

    // Inject user-added custom content (logo / header / footer / extra fields)
    const finalBodyContent = injectCustomSections(bodyContent, customSections);

    // Inject prominent Sample Watermark overlay around the body content
    const watermarkedHtml = applySampleWatermark(finalBodyContent);

    const styledHtml = wrapStyledHtml(watermarkedHtml);

    // DOCX: Generate server-side (docx library works in Node.js)
    if (format === 'docx') {
      const fileBuffer = await DOCXGenerator.generate(styledHtml, {
        format: 'docx',
        title: `${template.name} (Sample)`,
      });
      const fileName = `${template.slug || 'document'}-SAMPLE.docx`;

      return new NextResponse(new Uint8Array(fileBuffer), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="${fileName}"`,
          'Content-Length': fileBuffer.length.toString(),
        },
      });
    }

    const finalHtml = replaceSvgDataUris(styledHtml);
    return NextResponse.json({
      success: true,
      data: {
        html: finalHtml,
        title: `${template.name} (Sample)`,
        slug: `${template.slug || 'document'}-SAMPLE`,
        format: 'pdf',
        isSample: true,
      },
    });
  } catch (error) {
    console.error('Sample download error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate sample document' },
      { status: 500 }
    );
  }
}
