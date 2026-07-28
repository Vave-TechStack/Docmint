import { NextRequest, NextResponse } from 'next/server';
import { TemplateEngine } from '@/lib/engine/template-engine';
import { DocumentEngine } from '@/lib/engine/document-engine';
import { PDFGenerator } from '@/lib/pdf/pdf-generator';
import { DOCXGenerator } from '@/lib/docx/docx-generator';
import { PaymentService } from '@/lib/payment/razorpay';

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

    // Verify payment
    const isValid = await PaymentService.verifyPaymentAsync(orderId, paymentId, signature);
    if (!isValid) {
      return NextResponse.json(
        { success: false, error: 'Payment verification failed' },
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

    // Generate document HTML
    const html = await DocumentEngine.generateFromTemplate(template, variables);

    // Generate requested format
    let fileBuffer: Buffer;
    let contentType: string;
    let fileName: string;

    if (format === 'pdf') {
      fileBuffer = await PDFGenerator.generate(html, { format: 'pdf', title: template.name });
      contentType = 'application/pdf';
      fileName = `${template.slug}.pdf`;
    } else if (format === 'docx') {
      fileBuffer = await DOCXGenerator.generate(html, { format: 'docx', title: template.name });
      contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      fileName = `${template.slug}.docx`;
    } else {
      return NextResponse.json(
        { success: false, error: 'Unsupported format' },
        { status: 400 }
      );
    }

    // Record payment in database (no user session for instant mode)
    // For production: log the transaction

    return new NextResponse(new Uint8Array(fileBuffer), {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': fileBuffer.length.toString(),
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
