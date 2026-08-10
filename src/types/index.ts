// ─────────────────────────────────────────────────────────
// DocMint Core Types
// ─────────────────────────────────────────────────────────

// ─── Common ───
export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ─── Organization / Tenant ───
export interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  plan: 'FREE' | 'PREMIUM' | 'ENTERPRISE';
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
}

// ─── User ───
export interface UserProfile {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  mobile?: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'USER';
  image?: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
}

export interface AuthSession {
  user: UserProfile;
  organization: TenantInfo;
  expires: string;
}

// ─── Document ───
export interface DocumentData {
  id: string;
  organizationId: string;
  userId: string;
  categoryId?: string;
  folderId?: string;
  title: string;
  description?: string;
  documentType: string;
  content: Record<string, unknown>;
  htmlContent?: string;
  variables: Record<string, string>;
  status: 'DRAFT' | 'COMPLETED' | 'ARCHIVED' | 'DELETED';
  isFavorite: boolean;
  isArchived: boolean;
  isTemplate: boolean;
  tags: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentCreateInput {
  title: string;
  description?: string;
  documentType: string;
  categoryId?: string;
  folderId?: string;
  content?: Record<string, unknown>;
  variables?: Record<string, string>;
}

export interface DocumentUpdateInput extends Partial<DocumentCreateInput> {
  status?: 'DRAFT' | 'COMPLETED' | 'ARCHIVED' | 'DELETED';
  isFavorite?: boolean;
  isArchived?: boolean;
}

// ─── Document Version ───
export interface DocumentVersion {
  id: string;
  documentId: string;
  version: number;
  content: Record<string, unknown>;
  changeNote?: string;
  createdAt: string;
}

// ─── Template ───
export type TemplateVisibility = 'PUBLIC' | 'PRIVATE' | 'ORGANIZATION' | 'PREMIUM' | 'AI';

export interface TemplateData {
  id: string;
  name: string;
  slug: string;
  description?: string;
  thumbnail?: string;
  content: Record<string, unknown>;
  htmlTemplate?: string;
  variables: TemplateVariable[];
  documentCategory: string;
  visibility: TemplateVisibility;
  isPremium: boolean;
  isDefault: boolean;
  usageCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateVariable {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'email' | 'textarea' | 'select' | 'image' | 'signature';
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  options?: string[];
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
  };
}

// ─── Company Profile ───
export interface CompanyProfileData {
  id: string;
  companyName: string;
  companyLogo?: string;
  companySeal?: string;
  authorizedSign?: string;
  companyAddress?: string;
  companyWebsite?: string;
  companyEmail?: string;
  companyPhone?: string;
  gstNumber?: string;
  panNumber?: string;
  cinNumber?: string;
  msmeNumber?: string;
  bankName?: string;
  bankAccount?: string;
  bankIfsc?: string;
  bankBranch?: string;
  upiId?: string;
  qrCode?: string;
  headerText?: string;
  footerText?: string;
  termsConditions?: string;
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
}

// ─── Subscription ───
export interface SubscriptionData {
  id: string;
  plan: 'FREE' | 'PREMIUM' | 'ENTERPRISE';
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'GRACE_PERIOD' | 'SUSPENDED';
  startDate: string;
  endDate: string;
  graceEndDate: string;
  autoRenew: boolean;
}

// ─── Payment ───
export interface PaymentData {
  id: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  amount: number;
  currency: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED';
  paymentType: 'SUBSCRIPTION' | 'INSTANT_DOWNLOAD' | 'RENEWAL';
  invoiceNumber?: string;
  couponCode?: string;
  discountAmount: number;
  createdAt: string;
}

export interface RazorpayOrderResponse {
  id: string;
  amount: number;
  currency: string;
  key: string;
}

// ─── Document Editor ───
export interface EditorElement {
  id: string;
  type: 'text' | 'heading' | 'paragraph' | 'image' | 'table' | 'signature' | 'qrcode' | 'barcode' | 'watermark' | 'divider' | 'spacer' | 'placeholder';
  content: string;
  styles: Record<string, string | number>;
  placeholder?: string;
  children?: EditorElement[];
}

export interface EditorState {
  elements: EditorElement[];
  pageSettings: PageSettings;
}

export interface PageSettings {
  width: string;
  height: string;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  orientation: 'portrait' | 'landscape';
  size: 'A4' | 'A3' | 'A5' | 'LETTER' | 'LEGAL';
  headerEnabled: boolean;
  footerEnabled: boolean;
  pageNumbers: boolean;
  watermark?: string;
  backgroundColor: string;
}

// ─── Placeholder Resolver ───
export interface PlaceholderContext {
  document?: DocumentData;
  company?: CompanyProfileData;
  user?: UserProfile;
  customValues: Record<string, string>;
}

// ─── Export Options ───
export interface ExportOptions {
  format: 'pdf' | 'docx' | 'html' | 'print';
  watermark?: string;
  password?: string;
  quality?: 'draft' | 'standard' | 'high';
  pageRanges?: string;
  copies?: number;
  collate?: boolean;
}

// ─── AI Generation ───
export interface AIGenerationRequest {
  prompt: string;
  type: 'content' | 'rewrite' | 'translate' | 'grammar' | 'summary' | 'autofill';
  context?: Record<string, string>;
  language?: string;
  tone?: 'formal' | 'professional' | 'friendly' | 'persuasive';
}

export interface AIGenerationResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// ─── Admin Dashboard ───
export interface AdminDashboardStats {
  totalUsers: number;
  premiumUsers: number;
  totalRevenue: number;
  mrr: number;
  arr: number;
  totalDocuments: number;
  instantDownloads: number;
  activeSubscriptions: number;
  expiredUsers: number;
  dailyRevenue: { date: string; amount: number }[];
  monthlyRevenue: { month: string; amount: number }[];
  recentUsers: UserProfile[];
  documentCategories: { category: string; count: number }[];
}
