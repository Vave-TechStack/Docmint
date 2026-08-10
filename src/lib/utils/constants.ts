export const APP_NAME = 'DocMint';
export const APP_DESCRIPTION = 'AI-Powered Business Document Generator';

// ─── Subscription ───
export const SUBSCRIPTION_DURATION_DAYS = 30;
export const GRACE_PERIOD_DAYS = 7;
export const PREMIUM_PRICE = 299; // INR per month
export const ANNUAL_PREMIUM_PRICE = 2870; // INR per year (20% off ₹3,588)
export const INSTANT_DOWNLOAD_PRICE = 9; // INR

// ─── Data Retention ───
export const DATA_RETENTION_DAYS = 30; // Default
export const DATA_RETENTION_OPTIONS = [30, 60, 90];

// ─── Pagination ───
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// ─── File Upload ───
// Shared image-upload policy for the document editor, instant downloads and
// template image fields. Every upload surface reads these constants so the
// whitelist and size limit can never drift apart.
export const IMAGE_UPLOAD_MAX_MB = 5;
export const IMAGE_UPLOAD_MAX_BYTES = IMAGE_UPLOAD_MAX_MB * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif'];
export const ALLOWED_IMAGE_TYPES_ACCEPT = ALLOWED_IMAGE_TYPES.join(',');
export const ALLOWED_DOCUMENT_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/html',
  'application/json',
];

// ─── Document Categories ───
export const DOCUMENT_CATEGORIES = [
  { name: 'HR Documents', slug: 'hr', icon: 'Users', color: '#3B82F6' },
  { name: 'Payroll', slug: 'payroll', icon: 'Banknote', color: '#10B981' },
  { name: 'Finance', slug: 'finance', icon: 'DollarSign', color: '#F59E0B' },
  { name: 'Legal', slug: 'legal', icon: 'Scale', color: '#8B5CF6' },
  { name: 'Business', slug: 'business', icon: 'Briefcase', color: '#EC4899' },
  { name: 'Marketing', slug: 'marketing', icon: 'Megaphone', color: '#F97316' },
  { name: 'Resume Builder', slug: 'resume', icon: 'FileText', color: '#14B8A6' },
  { name: 'Education', slug: 'education', icon: 'GraduationCap', color: '#6366F1' },
  { name: 'Medical', slug: 'medical', icon: 'Stethoscope', color: '#EF4444' },
  { name: 'Manufacturing', slug: 'manufacturing', icon: 'Factory', color: '#78716C' },
  { name: 'Real Estate', slug: 'real-estate', icon: 'Building2', color: '#D946EF' },
  { name: 'General', slug: 'general', icon: 'File', color: '#6B7280' },
];

// ─── Placeholders ───
// Single source of truth for the placeholder panel. Order matters: the
// editor derives its three groups (Company → Employee → Document) by
// filtering this list, so each group's items render in list order.
export const SYSTEM_PLACEHOLDERS = [
  // ── Company Fields ──
  'CompanyName',
  'CompanyLogo',
  'CompanySeal',
  'CompanyAddress',
  'CompanyPhone',
  'CompanyEmail',
  'CompanyWebsite',
  'GST',
  'PAN',
  'CIN',
  'MSME',
  // ── Employee Fields ──
  'EmployeePhoto',
  'EmployeeName',
  'EmployeeID',
  'Department',
  'Designation',
  'JoiningDate',
  'Salary',
  'Manager',
  // ── Document Fields ──
  'InvoiceNumber',
  'QuotationNumber',
  'DocumentNumber',
  'CurrentDate',
  'CurrentYear',
  'AuthorizedSignature',
  'HRSignature',
  'DirectorSignature',
  'FinanceSignature',
  'QRCode',
  'Barcode',
  'Watermark',
];

// ─── Export Formats ───
export const EXPORT_FORMATS = ['pdf', 'docx', 'html', 'print', 'json', 'zip'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

// ─── Routes ───
export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  SIGNUP: '/signup',
  FORGOT_PASSWORD: '/forgot-password',
  VERIFY_EMAIL: '/verify-email',
  DASHBOARD: '/dashboard',
  DOCUMENTS: '/documents',
  DOCUMENT_EDITOR: '/documents/new',
  DOCUMENT_VIEW: (id: string) => `/documents/${id}`,
  DOCUMENT_EDIT: (id: string) => `/documents/${id}/edit`,
  TEMPLATES: '/templates',
  TEMPLATE_VIEW: (id: string) => `/templates/${id}`,
  COMPANY_PROFILE: '/company',
  SUBSCRIPTION: '/subscription',
  SETTINGS: '/settings',
  ADMIN: '/admin',
  ADMIN_DASHBOARD: '/admin/dashboard',
  ADMIN_USERS: '/admin/users',
  ADMIN_SETTINGS: '/admin/settings',
  ADMIN_TEMPLATES: '/admin/templates',
  INSTANT_DOWNLOAD: '/instant',
  INSTANT_DOWNLOAD_TEMPLATE: (slug: string) => `/instant/${slug}`,
} as const;
