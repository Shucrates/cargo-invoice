import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/** Public liveness probe. Reports only whether the database answers — never
 * row contents or configuration, since this route is unauthenticated. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Health check failed:', error);
    return NextResponse.json({ status: 'error' }, { status: 503 });
  }
}
