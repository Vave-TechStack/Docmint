import Link from 'next/link';
import { Scale, ArrowLeft } from 'lucide-react';

export default function TermsPage() {
  const sections = [
    {
      title: '1. Acceptance of Terms',
      content: `By accessing or using DocMint ("the Platform"), you agree to be bound by these Terms of Service. If you do not agree to these terms, do not use the Platform. These terms apply to all users, including those who use the Platform for instant document downloads without creating an account.`,
    },
    {
      title: '2. Description of Service',
      content: `DocMint is an AI-powered business document generation platform that allows users to:
• Create, edit, and manage professional business documents
• Generate documents using pre-built templates
• Download documents in PDF and DOCX formats
• Save and organize documents in cloud storage (Premium users)
• Share documents via links, email, and WhatsApp (Premium users)
• Use AI-powered features for content generation and enhancement`,
    },
    {
      title: '3. User Accounts',
      content: `Premium Account Registration: When you create an account, you must provide accurate and complete information. You are responsible for maintaining the confidentiality of your account credentials and for all activities under your account.

Instant Download: No account is required. Documents are generated on a pay-per-use basis without any data retention.

Account Termination: We reserve the right to suspend or terminate accounts that violate these terms or engage in abusive behavior.`,
    },
    {
      title: '4. Subscriptions and Payments',
      content: `Premium Subscription: ₹299 per month, billed monthly. Features include unlimited document generation, cloud storage, AI features, and company branding.

Instant Download: ₹9 per document. Payment is processed securely through Razorpay before download.

Renewal: Premium subscriptions auto-renew unless cancelled. You can cancel anytime from your subscription settings.

Refunds: Premium subscriptions may be refunded within 7 days of purchase. Instant download purchases are non-refundable once the document has been downloaded.

GST Invoices: Tax invoices are generated for all payments as per applicable tax laws.`,
    },
    {
      title: '5. User Content and Data',
      content: `You retain all rights to the documents and content you create using DocMint. By using the Platform, you grant us a limited license to store, process, and transmit your content solely for the purpose of providing our services.

You are solely responsible for the content of your documents and must ensure they comply with all applicable laws. We do not claim ownership of your documents.

Data Deletion: You can delete your documents at any time. For instant downloads, data is deleted immediately after download. For premium accounts, data retention follows your subscription terms.`,
    },
    {
      title: '6. Acceptable Use',
      content: `You agree not to:
• Use the Platform for any illegal purpose or in violation of any laws
• Create documents that contain harmful, threatening, abusive, or obscene content
• Attempt to access another user's account or documents
• Interfere with or disrupt the Platform's security or functionality
• Use automated scripts or bots to interact with the Platform
• Reverse engineer or attempt to extract source code from the Platform
• Upload malicious code or content that could harm the Platform or other users`,
    },
    {
      title: '7. Intellectual Property',
      content: `The Platform, including its design, code, templates, and AI models, is owned by DocMint and protected by intellectual property laws. Templates provided on the Platform are licensed for your use in creating documents but may not be redistributed as templates.

DocMint, the DocMint logo, and related marks are trademarks of DocMint.`,
    },
    {
      title: '8. Limitation of Liability',
      content: `DocMint provides the Platform "as is" without warranties of any kind, either express or implied. We do not guarantee that the Platform will be uninterrupted, error-free, or secure.

We shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Platform.

Our total liability for any claims under these terms shall not exceed the amount you have paid us in the 12 months preceding the claim.`,
    },
    {
      title: '9. AI-Generated Content',
      content: `DocMint uses AI to assist in document generation. AI-generated content is provided as a starting point and should be reviewed by the user. We make no guarantees about the accuracy, completeness, or legal validity of AI-generated content.

Users are responsible for reviewing and verifying all AI-generated content before use. DocMint is not liable for any consequences arising from the use of AI-generated content.`,
    },
    {
      title: '10. Changes to Terms',
      content: `We may modify these terms at any time. Changes will be effective immediately upon posting. We will notify premium users of material changes via email. Continued use of the Platform after changes constitutes acceptance of the updated terms.

These terms were last updated on July 28, 2026.`,
    },
    {
      title: '11. Governing Law',
      content: `These terms shall be governed by and construed in accordance with the laws of India. Any disputes arising under these terms shall be subject to the exclusive jurisdiction of the courts in Mumbai, Maharashtra.`,
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <Link href="/" className="inline-flex items-center text-sm text-blue-600 hover:text-blue-700 mb-8">
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          Back to Home
        </Link>

        <div className="flex items-center gap-4 mb-8">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
            <Scale className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900">Terms of Service</h1>
            <p className="text-gray-500 mt-1">Last updated: July 28, 2026</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-8 md:p-12 shadow-sm">
          <p className="text-gray-600 mb-8 leading-relaxed">
            These Terms of Service govern your use of the DocMint platform. By accessing or using our services, you agree to be bound by these terms. Please read them carefully.
          </p>

          <div className="space-y-10">
            {sections.map((section) => (
              <div key={section.title}>
                <h2 className="text-xl font-semibold text-gray-900 mb-3">{section.title}</h2>
                <p className="text-gray-600 leading-relaxed whitespace-pre-line">{section.content}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 pt-8 border-t border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Contact</h2>
            <p className="text-gray-600">
              For questions about these terms, please contact us at{' '}
              <a href="mailto:legal@docmint.app" className="text-blue-600 hover:underline">
                legal@docmint.app
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
