import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

/** Creation, edits, and voids for one LR — visible to any signed-in user
 *  (both roles), so staff can see when/why an admin corrected their entry. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const user = session?.user as { id?: string } | undefined;
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const entries = await prisma.docketAuditLog.findMany({
      where: { docketId: id },
      orderBy: { createdAt: 'desc' },
      include: { performer: { select: { fullName: true, email: true } } },
    });

    return NextResponse.json({
      entries: entries.map((e) => ({
        id: e.id,
        action: e.action,
        changes: (e.changes as Array<{ field: string; from: unknown; to: unknown }> | null) || [],
        performed_by_name: e.performer?.fullName || e.performer?.email || 'Staff',
        created_at: e.createdAt.toISOString(),
      })),
    });
  } catch (error: unknown) {
    console.error('Failed to load audit log:', error);
    return NextResponse.json({ error: 'Failed to load activity log' }, { status: 500 });
  }
}
