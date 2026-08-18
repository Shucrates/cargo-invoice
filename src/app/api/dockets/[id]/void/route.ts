import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

/**
 * Voids a docket. Voiding is a financial correction on an immutable record, so
 * it is restricted to admins and is only ever allowed once per docket.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const user = session?.user as { id?: string; role?: string } | undefined;

    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden: only admins can void a docket.' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await req.json();

    const voidReason = typeof body.void_reason === 'string' ? body.void_reason.trim() : '';
    if (!voidReason) {
      return NextResponse.json(
        { error: 'A valid void_reason is required to void a docket.' },
        { status: 400 }
      );
    }

    const existing = await prisma.cargoDocket.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Docket not found.' }, { status: 404 });
    }

    if (existing.status === 'voided') {
      return NextResponse.json(
        { error: 'This docket has already been voided.' },
        { status: 409 }
      );
    }

    // Conditional update: if a concurrent request voided this docket between the
    // check above and here, updateMany matches zero rows instead of overwriting
    // the original void audit trail.
    const result = await prisma.$transaction(async (tx) => {
      const voided = await tx.cargoDocket.updateMany({
        where: { id, status: 'issued' },
        data: {
          status: 'voided',
          voidReason,
          voidedAt: new Date(),
          voidedBy: user.id,
        },
      });

      if (voided.count > 0) {
        await tx.docketAuditLog.create({
          data: {
            docketId: id,
            action: 'voided',
            changes: [{ field: 'void_reason', from: null, to: voidReason }],
            performedBy: user.id!,
          },
        });
      }

      return voided;
    });

    if (result.count === 0) {
      return NextResponse.json(
        { error: 'This docket has already been voided.' },
        { status: 409 }
      );
    }

    const updated = await prisma.cargoDocket.findUnique({ where: { id } });
    return NextResponse.json(updated);
  } catch (error: unknown) {
    console.error('Void docket failed:', error);
    return NextResponse.json({ error: 'Failed to void docket.' }, { status: 500 });
  }
}
