import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { prisma } from '@/lib/prisma';
import { requireSecret } from '@/lib/env';
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
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = String(credentials.email).toLowerCase().trim();
        const password = String(credentials.password);

        const user = await prisma.user.findUnique({
          where: { email },
        });

        // Always run a comparison so unknown emails take the same time as
        // known ones, then reject. Never log the email or the outcome.
        const isValid = await bcrypt.compare(password, user?.hashedPassword || DUMMY_HASH);

        if (!user || !user.hashedPassword || !isValid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.fullName || user.email,
          role: user.role,
        };
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  secret: process.env.AUTH_SECRET || requireSecret('NEXTAUTH_SECRET'),
});
