import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { requireSecret, safeEqual } from '@/lib/env';

/**
 * Full database export. Two callers are allowed:
 *   1. The Vercel cron job, which presents `Authorization: Bearer $CRON_SECRET`.
 *   2. A signed-in admin triggering a manual backup from the dashboard.
 * Everyone else gets a 401 — this endpoint returns every customer and user record.
 */
async function isAuthorized(req: Request): Promise<boolean> {
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const presented = authHeader.slice('Bearer '.length);
    if (safeEqual(presented, requireSecret('CRON_SECRET'))) return true;
  }

  const session = await auth();
  return (session?.user as { role?: string } | undefined)?.role === 'admin';
}

export async function GET(req: Request) {
  try {
    if (!(await isAuthorized(req))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Auto-clean expired drafts older than 30 days during scheduled maintenance
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await Promise.all([
      prisma.docketDraft.deleteMany({ where: { createdAt: { lt: thirtyDaysAgo } } }),
      prisma.billDraft.deleteMany({ where: { createdAt: { lt: thirtyDaysAgo } } }),
    ]);

    const dockets = await prisma.cargoDocket.findMany();
    const customers = await prisma.customer.findMany();
    const users = await prisma.user.findMany({
      select: { id: true, email: true, role: true, fullName: true, createdAt: true },
    });

    const timestamp = new Date().toISOString();
    const backupPayload = {
      version: '1.0',
      timestamp,
      environment: process.env.NODE_ENV || 'production',
      metrics: {
        total_dockets: dockets.length,
        total_customers: customers.length,
        total_users: users.length,
      },
      data: {
        dockets,
        customers,
        users,
      },
    };

    return NextResponse.json(backupPayload, {
      headers: {
        'Content-Disposition': `attachment; filename="cargoflow-backup-${timestamp.split('T')[0]}.json"`,
        'Cache-Control': 'no-store, private',
      },
    });
  } catch (error: unknown) {
    console.error('Backup export failed:', error);
    return NextResponse.json({ error: 'Backup export failed' }, { status: 500 });
  }
}
