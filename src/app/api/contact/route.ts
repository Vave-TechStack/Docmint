import { NextRequest, NextResponse } from 'next/server';
import { EmailService } from '@/lib/email/email-service';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { cleanString, ValidationError } from '@/lib/security/request';

/**
 * POST /api/contact
 * Sends a contact form enquiry to the DocMint support team
 *
 * Fully public and unauthenticated.
 */
export async function POST(request: NextRequest) {
  try {
    // ─── Rate limiting first ───
    // Applied before body parsing so a flood of submissions cannot force
    // repeated JSON work even when it fails validation.
    const ip = getClientIp(request);
    if (!checkRateLimit(`contact:${ip}`, 1, 60_000)) {
      return NextResponse.json(
        { error: 'Please wait at least 1 minute between submissions' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { name, email, subject, message } = body as Record<string, unknown>;

    // ─── Validation ───
    // Every field is length-capped. The enquiry is rendered into the support
    // team's HTML mail client, and an unbounded field (multi-megabyte message)
    // is both a delivery-cost and a mail-client DoS vector.
    const safeName = cleanString(name, 100);
    if (safeName.length < 2) {
      return NextResponse.json(
        { error: 'Name is required and must be at least 2 characters' },
        { status: 400 }
      );
    }

    const safeEmail = cleanString(email, 200);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeEmail)) {
      return NextResponse.json(
        { error: 'A valid email address is required' },
        { status: 400 }
      );
    }

    const safeMessage = cleanString(message, 5000, { keepNewlines: true });
    if (safeMessage.length < 10) {
      return NextResponse.json(
        { error: 'Message is required and must be at least 10 characters' },
        { status: 400 }
      );
    }

    const safeSubject = cleanString(subject, 200) || '';

    // ─── Send email ───
    const sent = await EmailService.sendContactEnquiry({
      name: safeName,
      email: safeEmail,
      subject: safeSubject,
      message: safeMessage,
    });

    if (!sent) {
      // If email service is not configured, still succeed (fallback)
      console.warn('Contact form: Email service not configured. Message would have been sent but was dropped.');
      // The submitter's name, email address and free-text message are
      // anonymous third-party PII. They were dumped into the application logs
      // on every submission while the mail provider was unconfigured, which
      // put visitor data into log storage with no operational justification —
      // the warning above already records the condition that matters.
    }

    return NextResponse.json({
      success: true,
      message: 'Your message has been sent successfully. We will get back to you within 24 hours.',
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Contact form error:', error);
    return NextResponse.json(
      { error: 'Failed to send message. Please try again later.' },
      { status: 500 }
    );
  }
}
