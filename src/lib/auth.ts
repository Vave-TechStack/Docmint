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
    async authorize(credentials) {
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
    },
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
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
        token.organizationId = (user as any).organizationId;
        token.organizationName = (user as any).organizationName;
        token.role = (user as any).role || 'USER';
        token.emailVerified = (user as any).emailVerified;
      }
      // For OAuth sign-ins, fetch organization from DB
      if (account && account.provider !== 'credentials') {
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email! },
          include: { organization: true },
        });
        if (dbUser) {
          token.organizationId = dbUser.organizationId;
          token.organizationName = dbUser.organization.name;
          token.role = dbUser.role;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        (session.user as any).organizationId = token.organizationId;
        (session.user as any).organizationName = token.organizationName;
        (session.user as any).role = token.role || 'USER';
        (session.user as any).emailVerified = token.emailVerified;
      }
      return session;
    },
    async signIn({ user, account, profile }) {
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
    },
    async redirect({ url, baseUrl }) {
      // Allows relative callback URLs and same-origin redirects
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      if (new URL(url).origin === baseUrl) return url;
      return baseUrl;
    },
  },
});
  } catch (err) {
    console.error('[AUTH] NextAuth initialization failed:', err);
    throw err;
  }
})();

export const { handlers, auth, signIn, signOut } = authConfig;

// ─── Type Augmentation for Custom Session Fields ───
declare module 'next-auth' {
  interface User {
    organizationId?: string;
    organizationSlug?: string;
    organizationName?: string;
    role?: string;
  }
  interface Session {
    user: {
      id: string;
      organizationId: string;
      organizationSlug: string;
      organizationName: string;
      role: string;
    } & DefaultSession['user'];
  }
}
