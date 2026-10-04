import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { requireSecret, safeEqual } from '@/lib/env';

/**
 * Two callers are allowed:
 *   1. The Vercel cron job (`Authorization: Bearer $CRON_SECRET`), which runs
 *      draft cleanup only. Its response body is discarded by Vercel, so building
 *      a full export for it would be wasted work, not a backup.
 *   2. A signed-in admin, who receives a full JSON export as a download.
 * Everyone else gets a 401 — the export contains every customer and user record.
 */
async function getCaller(req: Request): Promise<'cron' | 'admin' | null> {
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const presented = authHeader.slice('Bearer '.length);
    if (safeEqual(presented, requireSecret('CRON_SECRET'))) return 'cron';
  }

  const session = await auth();
  return (session?.user as { role?: string } | undefined)?.role === 'admin' ? 'admin' : null;
}

export async function GET(req: Request) {
  try {
    const caller = await getCaller(req);
    if (!caller) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (caller === 'cron') {
      // Scheduled maintenance: drop drafts untouched for 30 days.
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const [docketDrafts, billDrafts] = await Promise.all([
        prisma.docketDraft.deleteMany({ where: { createdAt: { lt: thirtyDaysAgo } } }),
        prisma.billDraft.deleteMany({ where: { createdAt: { lt: thirtyDaysAgo } } }),
      ]);
      return NextResponse.json({
        deletedDocketDrafts: docketDrafts.count,
        deletedBillDrafts: billDrafts.count,
      });
    }

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
