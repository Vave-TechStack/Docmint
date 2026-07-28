import Link from 'next/link';
import { Shield, ArrowLeft } from 'lucide-react';

export default function PrivacyPage() {
  const sections = [
    {
      title: '1. Information We Collect',
      content: `We collect information you provide directly to us when you create an account, use our services, or communicate with us. This includes:
• Account Information: Name, email address, mobile number, company details, GST/PAN numbers
• Document Content: Any documents, templates, and content you create, upload, or generate using our platform
• Payment Information: When you make purchases, payment details are processed securely by Razorpay; we do not store full payment card details
• Usage Data: Information about how you interact with our platform, including features used, time spent, and documents created`,
    },
    {
      title: '2. How We Use Your Information',
      content: `We use the information we collect to:
• Provide, maintain, and improve our document generation services
• Process your transactions and manage your subscription
• Send you technical notices, updates, security alerts, and support messages
• Respond to your comments, questions, and requests
• Monitor and analyze trends, usage, and activities in connection with our services
• Detect, investigate, and prevent fraudulent transactions and abuse`,
    },
    {
      title: '3. Data Storage and Security',
      content: `We implement appropriate technical and organizational measures to protect your personal information. Your data is stored securely with encryption at rest and in transit. We use industry-standard security practices including:
• AES-256 encryption for data at rest
• TLS 1.3 for data in transit
• Regular security audits and penetration testing
• Access controls and authentication mechanisms
• SOC2-ready infrastructure and practices`,
    },
    {
      title: '4. Data Retention',
      content: `We retain your data for as long as your account is active or as needed to provide you services. You can request deletion of your data at any time. For premium users, data is retained according to your subscription terms:
• Active accounts: Data retained until account deletion
• Expired accounts: 30-day grace period, then data may be permanently deleted
• Instant download users: No data stored after download completion`,
    },
    {
      title: '5. Data Sharing and Disclosure',
      content: `We do not sell your personal information. We may share your data only in the following circumstances:
• With your consent or at your direction
• With service providers who perform services on our behalf (e.g., Razorpay for payments)
• To comply with legal obligations or respond to lawful requests
• To protect the rights, property, or safety of DocMint, our users, or others`,
    },
    {
      title: '6. Your Rights and Choices',
      content: `You have the following rights regarding your personal data:
• Access: Request a copy of your data
• Correction: Update or correct inaccurate data
• Deletion: Request deletion of your data
• Portability: Request your data in a machine-readable format
• Opt-out: Unsubscribe from marketing communications at any time
To exercise any of these rights, contact us at privacy@docmint.app`,
    },
    {
      title: '7. Cookies and Tracking',
      content: `We use essential cookies to operate our platform. We may also use analytics cookies to understand how our services are used. You can control cookie settings through your browser preferences. We do not use third-party tracking cookies for advertising purposes.`,
    },
    {
      title: '8. Third-Party Services',
      content: `Our platform integrates with third-party services for specific functionalities:
• Razorpay: Payment processing for subscriptions and instant downloads
• Google & Microsoft: Optional OAuth authentication
• AI Services: Document content generation and enhancement
These third parties have their own privacy policies governing the use of your data.`,
    },
    {
      title: '9. GDPR Compliance',
      content: `For users in the European Economic Area (EEA), we comply with the General Data Protection Regulation (GDPR). This includes:
• Lawful basis for processing: We process data based on your consent, contract fulfillment, and legitimate business interests
• Data Protection Officer: Contact dpo@docmint.app for GDPR-related inquiries
• Cross-border transfers: We ensure appropriate safeguards for data transferred outside the EEA
• Breach notification: We will notify you and relevant authorities within 72 hours of any data breach`,
    },
    {
      title: '10. Changes to This Policy',
      content: `We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the new policy on this page and, where appropriate, by email notification. Continued use of our services after changes constitutes acceptance of the updated policy.`,
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
            <Shield className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900">Privacy Policy</h1>
            <p className="text-gray-500 mt-1">Last updated: July 28, 2026</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-8 md:p-12 shadow-sm">
          <p className="text-gray-600 mb-8 leading-relaxed">
            At DocMint, we take your privacy seriously. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our document generation platform. Please read this policy carefully.
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
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Contact Us</h2>
            <p className="text-gray-600">
              If you have any questions about this Privacy Policy, please contact us at{' '}
              <a href="mailto:privacy@docmint.app" className="text-blue-600 hover:underline">
                privacy@docmint.app
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
