import { NextRequest, NextResponse } from 'next/server';
import { resolveOptionalScope } from '@/lib/security/authorization';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { TemplateEngine } from '@/lib/engine/template-engine';
import { DocumentEngine, wrapStyledHtml, extractBodyContent, applySampleWatermark, truncateSampleBody } from '@/lib/engine/document-engine';
import { DOCXGenerator } from '@/lib/docx/docx-generator';
import { generateSampleVariables } from '@/lib/data/sample-data';
import { resolveTemplateWithFallback } from '@/lib/data/sample-templates';
import { hasActivePremiumSubscription } from '@/lib/subscription';
import { validateImageVariables, validateImageDataUrl } from '@/lib/utils/image-upload';
import { validateFinancials, describeFinancialErrors } from '@/lib/documents/validation';
import { sanitizeCustomSections, injectCustomSections } from '@/lib/utils/custom-sections';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  try {
    // Server-side DOCX/PDF rendering is expensive, and this route is reachable
    // anonymously. Its sibling render paths are already throttled
    // (/api/instant/download and /api/instant/sample, 10/min) — this one was
    // missed, which made it an anonymous render-amplification endpoint.
    if (!checkRateLimit(`template-download:${getClientIp(request)}`, 10, 60_000)) {
      return NextResponse.json(
        { success: false, error: 'Too many download requests. Please wait a minute.' },
        { status: 429 }
      );
    }

    // Optional authentication, but REVALIDATED against the database.
    // Reading `session.user.role` / `session.user.organizationId` straight off
    // the token let a demoted admin keep the paywall bypass and a transferred
    // user keep their old tenant for the 30-day default token lifetime.
    const scope = await resolveOptionalScope(request, { requireOrganization: true });
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
      scope?.organizationId ?? null
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
        scope?.guard.isAdmin === true;
      if (!isAdmin) {
        if (!scope?.organizationId) {
          return NextResponse.json(
            { success: false, error: 'Please sign in to download premium templates.' },
            { status: 401 }
          );
        }
        const unlocked = await hasActivePremiumSubscription(scope.organizationId);
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

    // Financial integrity gate. Auto-generated sample data is exempt: it is
    // illustrative filler, not a customer's declared figures. A real
    // submission that contradicts itself (earnings that do not sum to the
    // stated gross, words that disagree with the total) is refused before
    // any file is produced. See src/lib/documents/validation.ts.
    if (!isSample) {
      const declaredKeys = (template.variables || []).map((v: { key: string }) => v.key);
      const financial = validateFinancials({
        values: (resolvedVariables ?? {}) as Record<string, unknown>,
        declaredKeys,
      });
      if (!financial.ok) {
        return NextResponse.json(
          {
            success: false,
            error: describeFinancialErrors(financial.errors),
            financialErrors: financial.errors,
          },
          { status: 400 }
        );
      }
    }

    // Generate document HTML from template + variables
    const html = await DocumentEngine.generateFromTemplate(template, resolvedVariables);

    // Track usage
    await TemplateEngine.trackUsage(id).catch(() => {});

    // Build the sample body.
    //
    // A premium sample must NOT contain the whole template. The watermark is
    // just a <div> in the output, so returning the complete premium document
    // behind a watermark leaked the paid product: one `remove()` call and the
    // buyer has the file. Premium samples are therefore TRUNCATED first, then
    // watermarked, and the truncation notice makes the cut explicit.
    const bodyHtml = extractBodyContent(html);
    // Inject user-added custom content: header at top, extra fields + footer at the bottom
    const finalBodyHtml = injectCustomSections(bodyHtml, customSections);
    const styledFinalHtml = wrapStyledHtml(finalBodyHtml);

    let sampleBodyHtml: string | null = null;
    if (isSample && template.isPremium) {
      const preview = truncateSampleBody(finalBodyHtml);
      sampleBodyHtml = applySampleWatermark(
        preview.truncated
          ? preview.html +
              '<div style="margin-top:16px;padding:10px 14px;border:1px dashed #dc2626;' +
              'border-radius:8px;background:#fef2f2;color:#991b1b;font-size:12px;' +
              'text-align:center;">Preview truncated — purchase this template to ' +
              'receive the complete document.</div>'
          : preview.html
      );
    }

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
