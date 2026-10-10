import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getClientIp } from '@/lib/rate-limit';

/**
 * Mask an email before it reaches a log sink: us***@domain.com
 *
 * Defined here, not in `@/lib/auth`, so the logger never imports that module.
 * `@/lib/auth` constructs NextAuth at import time, so a logger → auth import
 * both cycles and forces every test that mocks `auth` to also mock this helper.
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const visible = local.length > 2 ? local.slice(0, 2) : local[0] || '*';
  return `${visible}***@${domain}`;
}

export enum SecurityEventCategory {
  AUTH = 'auth',
  AUTHZ = 'authz',
  PAYMENT = 'payment',
  ADMIN = 'admin',
  SHARE = 'share',
  DATA_ACCESS = 'data_access',
  RATE_LIMIT = 'rate_limit',
  SYSTEM = 'system',
}

export enum SecurityEventAction {
  // Auth events
  LOGIN_SUCCESS = 'login_success',
  LOGIN_FAILURE = 'login_failure',
  LOGIN_RATE_LIMITED = 'login_rate_limited',
  OAUTH_SIGNIN_SUCCESS = 'oauth_signin_success',
  OAUTH_SIGNIN_REJECTED = 'oauth_signin_rejected',
  LOGOUT = 'logout',
  PASSWORD_RESET_REQUESTED = 'password_reset_requested',
  PASSWORD_RESET_COMPLETED = 'password_reset_completed',
  PASSWORD_RESET_FAILED = 'password_reset_failed',
  EMAIL_VERIFICATION_REQUESTED = 'email_verification_requested',
  EMAIL_VERIFICATION_COMPLETED = 'email_verification_completed',
  EMAIL_VERIFICATION_FAILED = 'email_verification_failed',
  SESSION_REVOKED = 'session_revoked',

  // Authz events
  ACCESS_DENIED = 'access_denied',
  /**
   * A successful authorization grant.
   *
   * Previously the grant path reused `ACCESS_DENIED` with `success: true`, so
   * an audit query filtering on the action returned every allowed request
   * alongside the blocked ones — the only distinguishing field was `success`,
   * which makes "count the access-denied events" wrong by construction and
   * unusable for incident response.
   */
  ACCESS_GRANTED = 'access_granted',
  CROSS_TENANT_BLOCKED = 'cross_tenant_blocked',
  INSUFFICIENT_PERMISSIONS = 'insufficient_permissions',
  ORG_SUSPENDED_BLOCKED = 'org_suspended_blocked',
  PASSWORD_VERSION_MISMATCH = 'password_version_mismatch',

  // Payment events
  WEBHOOK_RECEIVED = 'webhook_received',
  WEBHOOK_SIGNATURE_INVALID = 'webhook_signature_invalid',
  WEBHOOK_IP_BLOCKED = 'webhook_ip_blocked',
  WEBHOOK_RATE_LIMITED = 'webhook_rate_limited',
  PAYMENT_CAPTURED = 'payment_captured',
  PAYMENT_FAILED = 'payment_failed',
  SUBSCRIPTION_ACTIVATED = 'subscription_activated',
  SUBSCRIPTION_RENEWED = 'subscription_renewed',
  SUBSCRIPTION_CANCELLED = 'subscription_cancelled',
  SUBSCRIPTION_HALTED = 'subscription_halted',
  SUBSCRIPTION_EXPIRED = 'subscription_expired',
  REFUND_CREATED = 'refund_created',
  ORDER_PAID = 'order_paid',

  // Admin events
  USER_SUSPENDED = 'user_suspended',
  USER_ACTIVATED = 'user_activated',
  USER_DELETED = 'user_deleted',
  USER_ROLE_CHANGED = 'user_role_changed',
  TEMPLATE_DELETED = 'template_deleted',
  TEMPLATE_UPDATED = 'template_updated',

  // Share events
  SHARE_CREATED = 'share_created',
  SHARE_REVOKED = 'share_revoked',
  SHARE_ACCESSED = 'share_accessed',
  SHARE_DOWNLOADED = 'share_downloaded',
  SHARE_PASSWORD_FAILED = 'share_password_failed',
  SHARE_PASSWORD_RATE_LIMITED = 'share_password_rate_limited',
  SHARE_EXPIRED = 'share_expired',
  SHARE_MAX_DOWNLOADS = 'share_max_downloads',
  SHARE_DELETED_DOC_BLOCKED = 'share_deleted_doc_blocked',

  // Data access events
  DOCUMENT_CREATED = 'document_created',
  DOCUMENT_UPDATED = 'document_updated',
  DOCUMENT_DELETED = 'document_deleted',
  DOCUMENT_DUPLICATED = 'document_duplicated',
  TEMPLATE_CREATED = 'template_created',

  // Rate limit events
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',

  // System events
  CONFIG_ERROR = 'config_error',
  DB_ERROR = 'db_error',
  CSP_VIOLATION = 'csp_violation',
}

export interface SecurityEventContext {
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  organizationId?: string | null;
  userId?: string | null;
  email?: string;
  role?: string;
  metadata?: Record<string, unknown>;
}

export interface SecurityLogEntry {
  category: SecurityEventCategory;
  action: SecurityEventAction;
  success: boolean;
  message: string;
  context: SecurityEventContext;
  timestamp: Date;
  severity: 'info' | 'warn' | 'error' | 'critical';
}

/**
 * Metadata keys whose values must never reach a log sink.
 *
 * Matching is done on a normalised form (lowercased with `_`/`-` removed) so a
 * key is caught regardless of casing or separator style: `password`,
 * `Password`, `user_password`, and `userPassword` all collapse to `password`.
 * The camelCase entries below matter — a plain `_`-strip only handles
 * snake_case, which let `apiKey` through and printed the secret verbatim.
 */
const SENSITIVE_KEY_PATTERNS = [
  /password/,
  /passwd/,
  /token/,
  /secret/,
  /^auth(orization)?$/,
  /cookie/,
  /signature/,
  /^sign$/,
  /apikey/,
  /credential/,
  /privatekey/,
  /sessionid/,
  /hash$/,
  /^hash/,
];

/** Exact key names that are sensitive regardless of surrounding context. */
const sensitiveKeys = new Set([
  'password',
  'token',
  'secret',
  'authorization',
  'cookie',
  'x-razorpay-signature',
  'signature',
  'hash',
  'verificationtoken',
  'passwordhash',
  'passwordversion',
  'twofactorsecret',
]);

function isSensitiveKey(key: string): boolean {
  const lowerKey = key.toLowerCase();
  const normalized = lowerKey.replace(/[_-]/g, '');
  if (sensitiveKeys.has(lowerKey) || sensitiveKeys.has(normalized)) return true;
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(normalized));
}

function sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (isSensitiveKey(key)) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeMetadata(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function getSeverity(category: SecurityEventCategory, action: SecurityEventAction, success: boolean): 'info' | 'warn' | 'error' | 'critical' {
  if (!success) {
    if (category === SecurityEventCategory.AUTH || category === SecurityEventCategory.AUTHZ) {
      if (action === SecurityEventAction.CROSS_TENANT_BLOCKED ||
          action === SecurityEventAction.PASSWORD_VERSION_MISMATCH) {
        return 'critical';
      }
      return 'error';
    }
    if (category === SecurityEventCategory.PAYMENT && action === SecurityEventAction.WEBHOOK_SIGNATURE_INVALID) {
      return 'critical';
    }
    return 'warn';
  }
  if (category === SecurityEventCategory.AUTH && action === SecurityEventAction.LOGIN_SUCCESS) {
    return 'info';
  }
  if (category === SecurityEventCategory.PAYMENT) {
    return 'info';
  }
  if (category === SecurityEventCategory.ADMIN) {
    return 'warn';
  }
  return 'info';
}

let prismaAvailable = true;
let prismaCheckAttempted = false;

async function getPrisma() {
  if (!prismaAvailable) return null;
  if (!prismaCheckAttempted) {
    prismaCheckAttempted = true;
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      prismaAvailable = false;
      return null;
    }
  }
  return prismaAvailable ? prisma : null;
}

/**
 * Emits an info-severity security line on a channel that production builds do
 * not strip.
 *
 * `console.log` is removed by `compiler.removeConsole` in `next.config.ts`.
 * That transform targets `console.*` member expressions, so writing straight
 * to stderr bypasses it without re-enabling console removal globally and
 * without pushing routine info events onto the `warn`/`error` channels that
 * alerting rules watch.
 *
 * The logger imports Prisma and is therefore server-only, but the guard keeps
 * it from throwing if it is ever pulled into an edge bundle.
 */
function writeInfoLine(logLine: string): void {
  if (typeof process !== 'undefined' && typeof process.stderr?.write === 'function') {
    process.stderr.write(`${logLine}\n`);
    return;
  }
  console.warn(logLine);
}

export async function logSecurityEvent(entry: Omit<SecurityLogEntry, 'timestamp' | 'severity'>): Promise<void> {
  const fullEntry: SecurityLogEntry = {
    ...entry,
    timestamp: new Date(),
    severity: getSeverity(entry.category, entry.action, entry.success),
  };

  const context = {
    ...fullEntry.context,
    email: fullEntry.context.email ? maskEmail(fullEntry.context.email) : undefined,
    metadata: fullEntry.context.metadata ? sanitizeMetadata(fullEntry.context.metadata) : undefined,
  };

  const logLine = JSON.stringify({
    timestamp: fullEntry.timestamp.toISOString(),
    level: fullEntry.severity,
    category: fullEntry.category,
    action: fullEntry.action,
    success: fullEntry.success,
    message: fullEntry.message,
    context,
  });

  switch (fullEntry.severity) {
    case 'critical':
    case 'error':
      // Survives `removeConsole` (see next.config.ts `exclude`).
      console.error(logLine);
      break;
    case 'warn':
      console.warn(logLine);
      break;
    default:
      // `console.log` is REMOVED from production builds by
      // `compiler.removeConsole`, so routing `info` events through it made
      // them vanish in production: LOGIN_SUCCESS, OAUTH_SIGNIN_SUCCESS,
      // PAYMENT_CAPTURED, PAYMENT_FAILED and every SUBSCRIPTION_* event
      // produced no output at all. Verified against the compiled bundle,
      // where the `default: console.log(...)` branch is simply absent.
      //
      // Writing to stderr directly is not a compiler transform, so the line
      // is guaranteed to ship. Severity is carried in the `level` field of
      // the JSON, which is what downstream parsing actually keys on.
      writeInfoLine(logLine);
  }

  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_AUDIT_LOG === 'true') {
    const db = await getPrisma();
    if (db) {
      try {
        await db.auditLog.create({
          data: {
            organizationId: fullEntry.context.organizationId ?? 'system',
            userId: fullEntry.context.userId,
            action: fullEntry.action,
            entity: fullEntry.category,
            entityId: fullEntry.context.metadata?.entityId as string | undefined,
            description: fullEntry.message,
            // Prisma's Json input type rejects `undefined` members and plain
            // `Record<string, unknown>`, so the payload is narrowed explicitly.
            //
            // The SANITIZED metadata is persisted, not the raw one. The audit
            // table is a durable store that outlives the log aggregator, so
            // writing `...fullEntry.context.metadata` here would persist
            // plaintext tokens/passwords that `sanitizeMetadata` had already
            // redacted for the console line above.
            metadata: {
              ...(context.metadata ?? {}),
              category: fullEntry.category,
              success: fullEntry.success,
              severity: fullEntry.severity,
              requestId: fullEntry.context.requestId ?? null,
              ipAddress: fullEntry.context.ipAddress ?? null,
              userAgent: fullEntry.context.userAgent ?? null,
              // Masked, matching the console line — the audit row is PII too.
              email: context.email ?? null,
              role: fullEntry.context.role ?? null,
            } as Prisma.InputJsonObject,
            ipAddress: fullEntry.context.ipAddress,
            userAgent: fullEntry.context.userAgent,
          },
        });
      } catch (auditError) {
        console.error('[AUDIT] Failed to write audit log:', auditError);
      }
    }
  }
}

/**
 * Accepts any minimal identity shape rather than a concrete `Session['user']`:
 * NextAuth types `email` as `string | null` on the session but callers pass it
 * through unchanged, so the parameter is widened here instead of forcing every
 * call site to narrow first.
 */
export function createSecurityContext(
  request?: Request,
  guard?: {
    user?: { id?: string; email?: string | null; organizationId?: string; role?: string };
    organizationId?: string | null;
    isSuperAdmin?: boolean;
  }
): SecurityEventContext {
  const ctx: SecurityEventContext = {};

  if (request) {
    // The request id is a HEADER, not a query parameter — reading it from
    // searchParams meant every event got a fresh random id and the id emitted
    // by the middleware was never correlated into logs.
    ctx.requestId = request.headers.get('x-request-id') || crypto.randomUUID();
    // Reuse the shared extractor so log attribution follows the same trust
    // order as rate limiting: `x-real-ip` first, then the LAST
    // `x-forwarded-for` hop. Reading the first hop here would record an
    // attacker-controlled value in the audit trail.
    ctx.ipAddress = getClientIp(request);
    ctx.userAgent = request.headers.get('user-agent') || undefined;
  }

  if (guard?.user) {
    ctx.userId = guard.user.id;
    ctx.email = guard.user.email ?? undefined;
    ctx.organizationId = guard.organizationId ?? guard.user.organizationId;
    ctx.role = guard.user.role;
  }

  return ctx;
}

export async function logAuthEvent(
  action: SecurityEventAction,
  success: boolean,
  message: string,
  context: SecurityEventContext
): Promise<void> {
  await logSecurityEvent({ category: SecurityEventCategory.AUTH, action, success, message, context });
}

export async function logAuthzEvent(
  action: SecurityEventAction,
  success: boolean,
  message: string,
  context: SecurityEventContext
): Promise<void> {
  await logSecurityEvent({ category: SecurityEventCategory.AUTHZ, action, success, message, context });
}

export async function logPaymentEvent(
  action: SecurityEventAction,
  success: boolean,
  message: string,
  context: SecurityEventContext
): Promise<void> {
  await logSecurityEvent({ category: SecurityEventCategory.PAYMENT, action, success, message, context });
}

export async function logAdminEvent(
  action: SecurityEventAction,
  success: boolean,
  message: string,
  context: SecurityEventContext
): Promise<void> {
  await logSecurityEvent({ category: SecurityEventCategory.ADMIN, action, success, message, context });
}

export async function logShareEvent(
  action: SecurityEventAction,
  success: boolean,
  message: string,
  context: SecurityEventContext
): Promise<void> {
  await logSecurityEvent({ category: SecurityEventCategory.SHARE, action, success, message, context });
}

export async function logDataAccessEvent(
  action: SecurityEventAction,
  success: boolean,
  message: string,
  context: SecurityEventContext
): Promise<void> {
  await logSecurityEvent({ category: SecurityEventCategory.DATA_ACCESS, action, success, message, context });
}

export async function logRateLimitEvent(
  action: SecurityEventAction,
  success: boolean,
  message: string,
  context: SecurityEventContext
): Promise<void> {
  await logSecurityEvent({ category: SecurityEventCategory.RATE_LIMIT, action, success, message, context });
}

export async function logSystemEvent(
  action: SecurityEventAction,
  success: boolean,
  message: string,
  context: SecurityEventContext
): Promise<void> {
  await logSecurityEvent({ category: SecurityEventCategory.SYSTEM, action, success, message, context });
}