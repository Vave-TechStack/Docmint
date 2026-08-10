import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { TemplateEngine } from '@/lib/engine/template-engine';
import { DocumentEngine, wrapStyledHtml, extractBodyContent, applySampleWatermark } from '@/lib/engine/document-engine';
import { DOCXGenerator } from '@/lib/docx/docx-generator';
import { generateSampleVariables } from '@/lib/data/sample-data';
import { resolveTemplateWithFallback } from '@/lib/data/sample-templates';
import { hasActivePremiumSubscription } from '@/lib/subscription';
import { validateImageVariables, validateImageDataUrl } from '@/lib/utils/image-upload';
import { sanitizeCustomSections, injectCustomSections } from '@/lib/utils/custom-sections';

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

    // Fetch template — DB first, static sample fallback (the detail page GET
    // route falls back to samples too, so download and Sample PDF/DOCX must
    // resolve the same template or they 404 after the fact).
    const template = await resolveTemplateWithFallback(
      id,
      session?.user?.organizationId || null
    );
    if (!template || !template.htmlTemplate) {
      return NextResponse.json(
        { success: false, error: 'Template not found or has no content' },
        { status: 404 }
      );
    }

    const isSample = !!body.sample;

    // ─── Premium gate ───
    // Free watermarked samples stay free; full downloads of premium templates
    // require an active Premium subscription. Admins bypass (they manage them).
    if (template.isPremium && !isSample) {
      const isAdmin =
        session?.user?.role === 'SUPER_ADMIN' || session?.user?.role === 'ADMIN';
      if (!isAdmin) {
        if (!session?.user?.organizationId) {
          return NextResponse.json(
            { success: false, error: 'Please sign in to download premium templates.' },
            { status: 401 }
          );
        }
        const unlocked = await hasActivePremiumSubscription(session.user.organizationId);
        if (!unlocked) {
          return NextResponse.json(
            {
              success: false,
              error: 'This premium template requires an active DocMint Premium subscription. Subscribe at /pricing to unlock all premium templates.',
            },
            { status: 402 }
          );
        }
      }
    }

    // If sample=true, use auto-generated sample data instead
    const resolvedVariables = isSample
      ? generateSampleVariables((template.variables || []).map((v: { key: string }) => v.key))
      : variables;

    // Generate document HTML from template + variables
    const html = await DocumentEngine.generateFromTemplate(template, resolvedVariables);

    // Track usage
    await TemplateEngine.trackUsage(id).catch(() => {});

    // Watermark premium samples so the free demo can't double as the paid file
    const bodyHtml = extractBodyContent(html);
    // Inject user-added custom content: header at top, extra fields + footer at the bottom
    const finalBodyHtml = injectCustomSections(bodyHtml, customSections);
    const styledFinalHtml = wrapStyledHtml(finalBodyHtml);
    const sampleBodyHtml =
      isSample && template.isPremium ? applySampleWatermark(finalBodyHtml) : null;

    // DOCX: server-side (docx library works in Node.js)
    if (format === 'docx') {
      const fileBuffer = await DOCXGenerator.generate(
        sampleBodyHtml ? wrapStyledHtml(sampleBodyHtml) : styledFinalHtml,
        {
          format: 'docx',
          title: template.name,
        }
      );

      const fileName = isSample
        ? `${template.slug || 'document'}-sample.docx`
        : `${template.slug || 'document'}.docx`;

      return new NextResponse(new Uint8Array(fileBuffer), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="${fileName}"`,
          'Content-Length': fileBuffer.length.toString(),
        },
      });
    }

    // PDF: Return HTML as JSON — client-side jsPDF handles conversion
    // Strip outer <html>/<body> boilerplate first to avoid invalid nested HTML
    const styledHtml = wrapStyledHtml(sampleBodyHtml || finalBodyHtml);

    return NextResponse.json({
      success: true,
      data: {
        html: styledHtml,
        title: template.name,
        slug: template.slug,
        format: 'pdf',
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
