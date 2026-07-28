import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';
import { Navbar } from '@/components/layout/navbar';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: {
    default: 'DocMint - AI-Powered Business Document Generator',
    template: '%s | DocMint',
  },
  description:
    'Create, edit, and manage professional business documents with AI. Generate offer letters, invoices, contracts, and 200+ document types.',
  keywords: [
    'document generator',
    'business documents',
    'AI document generator',
    'offer letter',
    'invoice generator',
    'HR documents',
    'PDF generator',
    'DocMint',
  ],
  authors: [{ name: 'DocMint' }],
  creator: 'DocMint',
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    siteName: 'DocMint',
    title: 'DocMint - AI-Powered Business Document Generator',
    description:
      'Create professional business documents with AI. 200+ templates, PDF/DOCX export, company branding.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DocMint - AI-Powered Business Document Generator',
    description:
      'Create professional business documents with AI. 200+ templates, PDF/DOCX export, company branding.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-white font-sans antialiased">
        <Providers>
          <div className="min-h-screen flex flex-col">
            <Navbar />
            <main className="flex-1">{children}</main>
            <footer className="border-t border-gray-200 py-8">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                  <p className="text-sm text-gray-500">
                    &copy; {new Date().getFullYear()} DocMint. All rights reserved.
                  </p>
                  <div className="flex items-center space-x-6">
                    <a href="/privacy" className="text-sm text-gray-500 hover:text-gray-700">
                      Privacy
                    </a>
                    <a href="/terms" className="text-sm text-gray-500 hover:text-gray-700">
                      Terms
                    </a>
                    <a href="/contact" className="text-sm text-gray-500 hover:text-gray-700">
                      Contact
                    </a>
                  </div>
                </div>
              </div>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
