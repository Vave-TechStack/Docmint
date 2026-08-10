import { NextRequest, NextResponse } from 'next/server';
import { DocumentEngine, wrapStyledHtml, extractBodyContent } from '@/lib/engine/document-engine';
import { DOCXGenerator } from '@/lib/docx/docx-generator';
import { PaymentService } from '@/lib/payment/razorpay';
import { resolveTemplateWithFallback } from '@/lib/data/sample-templates';
import { validateImageVariables, validateImageDataUrl } from '@/lib/utils/image-upload';
import { sanitizeCustomSections, injectCustomSections } from '@/lib/utils/custom-sections';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { templateId, variables, format, paymentId, orderId, signature } = body;

    if (!templateId || !variables || !format || !paymentId || !orderId || !signature) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
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

    // Verify payment
    const isValid = await PaymentService.verifyPaymentAsync(orderId, paymentId, signature);
    if (!isValid) {
      return NextResponse.json(
        { success: false, error: 'Payment verification failed' },
        { status: 400 }
      );
    }

    // Fetch template — DB first, static sample fallback (the /instant page
    // itself falls back to sample templates when the DB is empty, so the paid
    // download MUST resolve the same template or paying users get a 404).
    const template = await resolveTemplateWithFallback(templateId);
    if (!template || !template.htmlTemplate) {
      return NextResponse.json(
        { success: false, error: 'Template not found. Please ensure the database is seeded and try again.' },
        { status: 404 }
      );
    }

    // Premium templates are sold through the Template Library behind the
    // Premium subscription — block the ₹9 instant flow so it can't bypass.
    if (template.isPremium) {
      return NextResponse.json(
        {
          success: false,
          error: 'Premium templates require a DocMint Premium subscription. Get this template from the Template Library.',
        },
        { status: 403 }
      );
    }

    // Generate document HTML
    const html = await DocumentEngine.generateFromTemplate(template, variables);

    // Inject user-added custom content: header at top, extra fields + footer at the bottom
    const finalBodyHtml = injectCustomSections(extractBodyContent(html), customSections);
    const styledFinalHtml = wrapStyledHtml(finalBodyHtml);

    // DOCX: Generate server-side (docx library works in Node.js)
    if (format === 'docx') {
      const fileBuffer = await DOCXGenerator.generate(styledFinalHtml, {
        format: 'docx',
        title: template.name,
      });
      const fileName = `${template.slug}.docx`;

      return new NextResponse(new Uint8Array(fileBuffer), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="${fileName}"`,
          'Content-Length': fileBuffer.length.toString(),
        },
      });
    }

    // PDF: Return HTML + styled wrapper — client-side jsPDF handles conversion
    // jsPDF.html() requires a browser DOM, so we generate PDF on the client
    return NextResponse.json({
      success: true,
      data: {
        html: styledFinalHtml,
        title: template.name,
        slug: template.slug,
        format: 'pdf',
      },
    });
  } catch (error) {
    console.error('Download generation error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate document' },
      { status: 500 }
    );
  }
}
