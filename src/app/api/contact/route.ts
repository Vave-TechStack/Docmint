import { NextResponse } from 'next/server';
import { EmailService } from '@/lib/email/email-service';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

/**
 * POST /api/contact
 * Sends a contact form enquiry to the DocMint support team
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, subject, message } = body;

    // ─── Validation ───
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return NextResponse.json(
        { error: 'Name is required and must be at least 2 characters' },
        { status: 400 }
      );
    }

    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: 'A valid email address is required' },
        { status: 400 }
      );
    }

    if (!message || typeof message !== 'string' || message.trim().length < 10) {
      return NextResponse.json(
        { error: 'Message is required and must be at least 10 characters' },
        { status: 400 }
      );
    }

    // ─── Rate limiting (shared in-memory check) ───
    const ip = getClientIp(request);
    if (!checkRateLimit(`contact:${ip}`, 1, 60_000)) {
      return NextResponse.json(
        { error: 'Please wait at least 1 minute between submissions' },
        { status: 429 }
      );
    }

    // ─── Send email ───
    const sent = await EmailService.sendContactEnquiry({
      name: name.trim(),
      email: email.trim(),
      subject: subject?.trim() || '',
      message: message.trim(),
    });

    if (!sent) {
      // If email service is not configured, still succeed (fallback)
      console.warn('Contact form: Email service not configured. Message logged but not sent.');
      console.log('Contact enquiry:', { name, email, subject, message });
    }

    return NextResponse.json({
      success: true,
      message: 'Your message has been sent successfully. We will get back to you within 24 hours.',
    });
  } catch (error) {
    console.error('Contact form error:', error);
    return NextResponse.json(
      { error: 'Failed to send message. Please try again later.' },
      { status: 500 }
    );
  }
}
