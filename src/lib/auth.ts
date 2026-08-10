import NextAuth, { DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import Microsoft from 'next-auth/providers/microsoft-entra-id';
import type { Provider } from 'next-auth/providers';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

/**
 * DocMint NextAuth v5 Configuration
 * 
 * OAuth Provider Redirect URLs (add these to your provider dashboards):
 * 
 * Google Cloud Console:
 *   Authorized redirect URI → http://localhost:3000/api/auth/callback/google
 * 
 * Microsoft Azure Portal (App Registration):
 *   Redirect URI → http://localhost:3000/api/auth/callback/microsoft-entra-id
 * 
 * Note: DocMint uses NextAuth.js (not Supabase Auth).
 * Redirect URLs must be configured in the OAuth provider's dashboard
 * (Google Cloud / Microsoft Azure), NOT in Supabase's settings.
 * 
 * Update the URLs when deploying to production
 * (replace localhost:3000 with your production URL).
 */

// ─── Conditionally build providers list ───
const providers: Provider[] = [
  // ─── Email/Password Authentication ───
  Credentials({
    name: 'credentials',
    credentials: {
      email: { label: 'Email', type: 'email' },
      password: { label: 'Password', type: 'password' },
    },
    authorize: authorizeCallback,
  }),
];

// ─── Google OAuth (only if configured) ───
if (process.env.GOOGLE_CLIENT_ID) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      allowDangerousEmailAccountLinking: true,
    })
  );
}

// ─── Microsoft Entra ID (only if configured) ───
if (process.env.MICROSOFT_CLIENT_ID) {
  providers.push(
    Microsoft({
      clientId: process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
      allowDangerousEmailAccountLinking: true,
      // Note: tenantId is configured in the Azure AD app registration itself
    }) as Provider
  );
}

// ─── Extracted Callbacks (exported for testing) ───

/**
 * Authorize callback for the Credentials provider.
 * Validates email/password against the database.
 * Returns a User object on success, or null on failure.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function authorizeCallback(credentials: any): Promise<any> {
  if (!credentials?.email || !credentials?.password) {
    console.error('[AUTH] Missing credentials:', JSON.stringify(credentials));
    return null;
  }

  const email = credentials.email as string;
  const password = credentials.password as string;
  console.log('[AUTH] Attempting login for:', email);

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { organization: true },
    });

    if (!user) {
      console.error('[AUTH] User not found:', email);
      return null;
    }
    
    if (!user.passwordHash) {
      console.error('[AUTH] No password hash for user:', email);
      return null;
    }

    if (!user.isActive) {
      console.error('[AUTH] User is inactive:', email);
      return null;
    }

    console.log('[AUTH] User found, checking password...');
    const isValid = await bcrypt.compare(password, user.passwordHash);
    
    if (!isValid) {
      console.error('[AUTH] Invalid password for:', email);
      return null;
    }

    console.log('[AUTH] Password valid! Logging in:', email);
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      organizationId: user.organizationId,
      organizationName: user.organization.name,
      role: user.role,
      emailVerified: user.emailVerified?.toISOString() || null,
    };
  } catch (err) {
    console.error('[AUTH] Prisma error in authorize callback:', err);
    return null;
  }
}



/**
 * SignIn callback — controls whether a user is allowed to sign in.
 * Credentials sign-ins are always allowed (already validated in authorize).
 * OAuth sign-ins check existing user and update profile data.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function signInCallback({ user, account }: any): Promise<boolean> {
  // Always allow credentials sign-ins (they're already validated in authorize)
  if (account?.provider === 'credentials') return true;

  // For OAuth, check if email is already registered
  if (account?.provider === 'google' || account?.provider === 'microsoft-entra-id') {
    // If user doesn't exist yet, allow sign up
    if (!user.email) return false;
    const existing = await prisma.user.findUnique({ where: { email: user.email } });
    if (existing) {
      // Update the existing user's image/name if provided by OAuth
      await prisma.user.update({
        where: { email: user.email },
        data: {
          image: user.image || existing.image,
          name: user.name || existing.name,
        },
      });
    }
    return true;
  }

  return false;
}

/**
 * Redirect callback — controls where the user is redirected after sign-in/sign-out.
 * Allows relative callback URLs and same-origin redirects.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function redirectCallback({ url, baseUrl }: any): string {
  // Allows relative callback URLs and same-origin redirects
  if (url.startsWith('/')) return `${baseUrl}${url}`;
  if (new URL(url).origin === baseUrl) return url;
  return baseUrl;
}



/**
 * JWT callback — called whenever a JSON Web Token is created or updated.
 * Adds custom organization fields from the user to the token.
 * For OAuth sign-ins, fetches organization details from the database.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function jwtCallback({ token, user, account }: any): Promise<any> {
  try {
    if (!token) return token;
    if (user) {
      const customUser = user;
      token.id = customUser.id || token.sub;
      token.organizationId = customUser.organizationId;
      token.organizationName = customUser.organizationName;
      token.role = customUser.role || 'USER';
      token.emailVerified = customUser.emailVerified;
    }
    // For OAuth sign-ins, fetch organization from DB
    if (account && account.provider !== 'credentials' && token?.email) {
      try {
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email as string },
          include: { organization: true },
        });
        if (dbUser) {
          token.organizationId = dbUser.organizationId;
          token.organizationName = dbUser.organization?.name;
          token.role = dbUser.role;
        }
      } catch (dbErr) {
        console.error('[AUTH] DB error in jwtCallback:', dbErr);
      }
    }
  } catch (err) {
    console.error('[AUTH] Error in jwtCallback:', err);
  }
  return token;
}

/**
 * Session callback — called whenever a session is checked.
 * Maps custom organization fields from the JWT token to the session object
 * so they are available on the client side.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sessionCallback({ session, token }: any): Promise<any> {
  try {
    if (session && session.user && token) {
      session.user.id = (token.id as string) || (token.sub as string) || '';
      session.user.organizationId = token.organizationId as string | undefined;
      session.user.organizationName = token.organizationName as string | undefined;
      session.user.role = (token.role as string) || 'USER';
      session.user.emailVerified = token.emailVerified;
    }
  } catch (err) {
    console.error('[AUTH] Error in sessionCallback:', err);
  }
  return session;
}

// Wrap NextAuth config to log the actual error if initialization fails
const authConfig = (() => {
  try {
    return NextAuth({
      trustHost: true,
      secret: process.env.AUTH_SECRET,
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
    signOut: '/',
    error: '/login',
    verifyRequest: '/verify-email',
    newUser: '/dashboard',
  },
  providers,
  callbacks: {
    jwt: jwtCallback,
    session: sessionCallback,
    signIn: signInCallback,
    redirect: redirectCallback,
  },
});
  } catch (err) {
    console.error('[AUTH] NextAuth initialization failed:', err);
    throw err;
  }
})();

export const { handlers, auth, signIn, signOut } = authConfig;

// ─── Type Augmentation for Custom Auth Fields ───
declare module 'next-auth' {
  interface User {
    organizationId?: string;
    organizationSlug?: string;
    organizationName?: string;
    role?: string;
    emailVerified?: string | null;
  }
  interface Session {
    user: {
      id: string;
      organizationId?: string;
      organizationSlug?: string;
      organizationName?: string;
      role?: string;
      mobile?: string;
      emailVerified?: string | null;
    } & DefaultSession['user'];
  }
}


