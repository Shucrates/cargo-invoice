import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const userCount = await prisma.user.count();
    const users = await prisma.user.findMany({ select: { email: true, role: true } });
    return NextResponse.json({
      status: 'ok',
      database: 'connected',
      userCount,
      users,
      env: {
        hasAuthSecret: !!(process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET),
        hasNextAuthUrl: !!process.env.NEXTAUTH_URL,
        hasDatabaseUrl: !!process.env.DATABASE_URL,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        status: 'error',
        database: 'failed',
        error: error?.message || String(error),
        env: {
          hasAuthSecret: !!(process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET),
          hasNextAuthUrl: !!process.env.NEXTAUTH_URL,
          hasDatabaseUrl: !!process.env.DATABASE_URL,
        },
      },
      { status: 500 }
    );
  }
}
