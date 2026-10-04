import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { prisma } from '@/lib/prisma';
import { requireSecret } from '@/lib/env';
import { rateLimit } from '@/lib/rateLimit';
import bcrypt from 'bcryptjs';
import { authConfig } from '@/auth.config';

// A dummy hash to compare against when the email is unknown, so that a failed
// lookup costs the same time as a wrong password and cannot be used to
// enumerate valid accounts.
const DUMMY_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        // Slow password guessing: 10 attempts per IP per 15 minutes. Per
        // serverless instance only, so a speed bump rather than a hard cap.
        if (request && !rateLimit(request, { limit: 10, windowMs: 15 * 60_000, namespace: 'login' }).ok) {
          console.warn('[Auth] Login rate limit hit');
          return null;
        }

        const email = String(credentials.email).toLowerCase().trim();
        const password = String(credentials.password);

        try {
          const user = await prisma.user.findUnique({
            where: { email },
          });

          if (!user || !user.hashedPassword) {
            console.warn(`[Auth] User not found: ${email}`);
            await bcrypt.compare(password, DUMMY_HASH);
            return null;
          }

          const isValid = await bcrypt.compare(password, user.hashedPassword);
          if (!isValid) {
            console.warn(`[Auth] Invalid password for: ${email}`);
            return null;
          }

          return {
            id: user.id,
            email: user.email,
            name: user.fullName || user.email,
            role: user.role,
          };
        } catch (error) {
          console.error('[Auth] Database error in authorize:', error);
          throw error;
        }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || requireSecret('NEXTAUTH_SECRET'),
  trustHost: true,
});
