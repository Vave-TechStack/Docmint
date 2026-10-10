import { escapeHtml, escapeHtmlWithBreaks, stripNewlines, headerSafe } from '@/lib/security/request';
/**
 * Constrain a value used as an `href` to an absolute http(s) URL.
 *
 * Interpolating a caller-supplied string into `href="..."` without this check
 * permits `javascript:` and `data:` URIs â€” a live script-execution vector in
 * the recipient's mail client even when the surrounding HTML is escaped.
 * Anything that is not a parseable absolute http/https URL collapses to `#`.
 */
function safeHttpUrl(value: string): string {
  try {
    const parsed = new URL(String(value ?? ''));
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? escapeHtml(parsed.toString()) : '#';
  } catch {
    return '#';
  }
}

/**
 * DocMint Email Service
 * Handles transactional emails for auth, notifications, and document sharing.
 */
/**
 * Public origin used to build links inside transactional email.
 *
 * Without a fallback, an unset `NEXT_PUBLIC_APP_URL` produced
 * `undefined/verify-email?token=â€¦`, so the one link the entire signup journey
 * depends on was unusable. Every other site URL in the codebase already falls
 * back to localhost; these two did not.
 */
function publicAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
}

export class EmailService {
  private static apiKey = process.env.RESEND_API_KEY;
  private static fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@docmint.com';

  /**
   * Send an email using Resend API
   */
  static async send(options: {
    to: string | string[];
    subject: string;
    html: string;
    text?: string;
    attachments?: { filename: string; content: string }[];
  }): Promise<boolean> {
    try {
      if (!this.apiKey) {
        console.warn('Email service not configured. Set RESEND_API_KEY.');
        return false;
      }

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.fromEmail,
          to: Array.isArray(options.to) ? options.to : [options.to],
          subject: options.subject,
          html: options.html,
          text: options.text,
          attachments: options.attachments,
        }),
      });

      return response.ok;
    } catch (error) {
      console.error('Email sending failed:', error);
      return false;
    }
  }

  /**
   * Send verification email
   */
  static async sendVerificationEmail(email: string, token: string): Promise<boolean> {
    const verificationUrl = `${publicAppUrl()}/verify-email?token=${token}`;

    return this.send({
      to: email,
      subject: 'Verify your email - DocMint',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #2563EB;">Welcome to DocMint!</h1>
          <p>Please verify your email address to get started.</p>
          <a href="${verificationUrl}" 
             style="display: inline-block; padding: 12px 24px; background-color: #2563EB; color: white; 
                    text-decoration: none; border-radius: 6px; margin: 20px 0;">
            Verify Email
          </a>
          <p>Or copy this link: ${verificationUrl}</p>
          <p style="color: #6B7280; font-size: 14px;">This link expires in 24 hours.</p>
        </div>
      `,
    });
  }

  /**
   * Send OTP email
   */
  static async sendOTP(email: string, otp: string): Promise<boolean> {
    return this.send({
      to: email,
      subject: 'Your OTP - DocMint',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563EB;">DocMint OTP Verification</h2>
          <p style="font-size: 16px;">Your One-Time Password is:</p>
          <div style="font-size: 36px; font-weight: bold; text-align: center; 
                      padding: 20px; background: #F3F4F6; border-radius: 8px; 
                      letter-spacing: 8px; margin: 20px 0;">
            ${otp}
          </div>
          <p style="color: #6B7280;">This OTP expires in 10 minutes.</p>
          <p style="color: #EF4444; font-size: 14px;">If you didn't request this, please ignore this email.</p>
        </div>
      `,
    });
  }

  /**
   * Send welcome email after signup
   */
  static async sendWelcomeEmail(email: string, name: string): Promise<boolean> {
    return this.send({
      to: email,
      subject: 'Welcome to DocMint!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #2563EB;">Welcome, ${name}! ðŸŽ‰</h1>
          <p>Your DocMint account is ready. Start creating professional documents.</p>
          <div style="margin: 30px 0;">
            <a href="${publicAppUrl()}/dashboard" 
               style="display: inline-block; padding: 12px 24px; background-color: #2563EB; color: white; 
                      text-decoration: none; border-radius: 6px;">
              Go to Dashboard
            </a>
          </div>
          <h3>What you can do:</h3>
          <ul>
            <li>Create unlimited business documents</li>
            <li>Use 200+ professional templates</li>
            <li>AI-powered content generation</li>
            <li>Export to PDF and DOCX</li>
            <li>Company branding and customization</li>
          </ul>
          <p style="color: #6B7280;">Need help? Contact support@docmint.com</p>
        </div>
      `,
    });
  }

  /**
   * Send password reset email
   */
  static async sendPasswordResetEmail(email: string, resetUrl: string): Promise<boolean> {
    return this.send({
      to: email,
      subject: 'Reset your password - DocMint',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563EB;">Reset Your Password</h2>
          <p>Click the button below to reset your password.</p>
          <a href="${safeHttpUrl(resetUrl)}" 
             style="display: inline-block; padding: 12px 24px; background-color: #2563EB; color: white; 
                    text-decoration: none; border-radius: 6px; margin: 20px 0;">
            Reset Password
          </a>
          <p style="color: #6B7280;">This link expires in 1 hour.</p>
          <p style="color: #EF4444; font-size: 14px;">If you didn't request this, please ignore this email.</p>
        </div>
      `,
    });
  }

  /**
   * Send document share email
   */
  static async sendDocumentShareEmail(
    recipientEmail: string,
    documentName: string,
    shareLink: string,
    senderName: string
  ): Promise<boolean> {
    /**
     * `senderName` and `documentName` are chosen by the user (display name and
     * document title) and were interpolated raw into the HTML body and the
     * subject, so markup in either executed in the recipient's mail client.
     */
    const sender = escapeHtml(headerSafe(senderName, 100));
    const docTitle = escapeHtml(String(documentName ?? '').slice(0, 200));
    // Only an absolute http(s) URL may reach the href; a `javascript:` URI
    // here would otherwise be a live script-injection vector.
    const link = safeHttpUrl(shareLink);

    return this.send({
      to: recipientEmail,
      subject: headerSafe(`${senderName} shared a document with you - DocMint`, 200),
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563EB;">Document Shared</h2>
          <p>${sender} shared the document "${docTitle}" with you.</p>
          <a href="${link}" 
             style="display: inline-block; padding: 12px 24px; background-color: #2563EB; color: white; 
                    text-decoration: none; border-radius: 6px; margin: 20px 0;">
            View Document
          </a>
        </div>
      `,
    });
  }

  /**
   * Send subscription confirmation
   */
  static async sendSubscriptionEmail(
    email: string,
    planName: string,
    amount: number,
    endDate: string
  ): Promise<boolean> {
    return this.send({
      to: email,
      subject: 'Subscription Confirmed - DocMint Premium',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #2563EB;">Subscription Active! ðŸŽ‰</h1>
          <p>Your ${planName} plan is now active.</p>
          <div style="background: #F3F4F6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Plan:</strong> ${planName}</p>
            <p><strong>Amount:</strong> â‚¹${amount}</p>
            <p><strong>Valid Until:</strong> ${endDate}</p>
          </div>
          <p>Enjoy unlimited document generation with premium features!</p>
          <p style="color: #6B7280;">Your subscription will auto-renew. Manage in settings.</p>
        </div>
      `,
    });
  }

  /**
   * Send payment receipt/invoice
   */
  static async sendInvoice(
    email: string,
    invoiceNumber: string,
    amount: number,
    date: string,
    invoiceUrl?: string
  ): Promise<boolean> {
    return this.send({
      to: email,
      subject: `Invoice #${invoiceNumber} - DocMint`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563EB;">Payment Receipt</h2>
          <p>Thank you for your payment!</p>
          <div style="background: #F3F4F6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Invoice:</strong> #${invoiceNumber}</p>
            <p><strong>Amount:</strong> â‚¹${amount}</p>
            <p><strong>Date:</strong> ${date}</p>
          </div>
          ${invoiceUrl ? `<a href="${invoiceUrl}" style="color: #2563EB;">Download Invoice</a>` : ''}
        </div>
      `,
    });
  }

  /**
   * Send contact form enquiry to the DocMint team
   */
  static async sendContactEnquiry(data: {
    name: string;
    email: string;
    subject: string;
    message: string;
  }): Promise<boolean> {
    const supportEmail = process.env.SUPPORT_EMAIL || 'support@docmint.com';

    /**
     * Every one of these fields is fully attacker-controlled and was previously
     * interpolated raw into BOTH the HTML body and the message subject:
     *
     * - HTML body: `<img src=x onerror=...>` in the name/subject/message
     *   executed in the support inbox's mail client, and a
     *   `javascript:` / `data:` URI in the `mailto:` href below was a second
     *   injection point.
     * - Subject: embedded CR/LF can be used to inject extra headers when a
     *   downstream provider folds the value into an SMTP conversation
     *   (header-injection / mail-relay abuse).
     *
     * Escaping happens here â€” at the sink â€” rather than in the route, so every
     * future caller is covered by construction.
     */
    const name = escapeHtml(headerSafe(data.name, 100));
    const email = escapeHtml(headerSafe(data.email, 200));
    const subjectEscaped = escapeHtml(headerSafe(data.subject, 200));
    const messageEscaped = escapeHtmlWithBreaks(data.message);

    // The visible subject is built only from sanitised, length-capped text.
    const subject = data.subject
      ? `[Contact Form] ${headerSafe(data.subject, 100)} - from ${headerSafe(data.name, 60)}`
      : `[Contact Form] New enquiry from ${headerSafe(data.name, 60)}`;

    return this.send({
      to: supportEmail,
      subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563EB;">ðŸ“¬ New Contact Form Enquiry</h2>
          <div style="background: #F3F4F6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 12px; color: #6B7280; font-weight: 600; width: 100px;">Name:</td>
                <td style="padding: 8px 12px;">${name}</td>
              </tr>
              <tr>
                <td style="padding: 8px 12px; color: #6B7280; font-weight: 600;">Email:</td>
                <td style="padding: 8px 12px;">
                  <a href="mailto:${email}" style="color: #2563EB;">${email}</a>
                </td>
              </tr>
              ${data.subject ? `
              <tr>
                <td style="padding: 8px 12px; color: #6B7280; font-weight: 600;">Subject:</td>
                <td style="padding: 8px 12px;">${subjectEscaped}</td>
              </tr>` : ''}
              <tr>
                <td style="padding: 8px 12px; color: #6B7280; font-weight: 600;">Date:</td>
                <td style="padding: 8px 12px;">${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
              </tr>
            </table>
          </div>
          <h3 style="color: #374151;">Message:</h3>
          <div style="background: white; border: 1px solid #E5E7EB; padding: 16px; border-radius: 8px; margin: 10px 0; white-space: pre-wrap;">
            ${messageEscaped}
          </div>
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 24px 0;" />
          <p style="color: #6B7280; font-size: 14px;">
            Reply to this enquiry by writing back to 
            <a href="mailto:${email}" style="color: #2563EB;">${email}</a>
          </p>
        </div>
      `,
      text: `Contact Form Enquiry

Name: ${stripNewlines(data.name)}
Email: ${stripNewlines(data.email)}
Subject: ${stripNewlines(data.subject) || 'N/A'}
Date: ${new Date().toISOString()}

Message:
${data.message}`,
    });
  }
}
