import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

/**
 * Voids a payment. The payment ledger is append-only — this is the only
 * mutation path for an existing row, and it is restricted to admins.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  try {
    const session = await auth();
    const user = session?.user as { id?: string; role?: string } | undefined;

    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden: only admins can void a payment.' },
        { status: 403 }
      );
    }

    const { id, paymentId } = await params;
    const body = await req.json();

    const voidReason = typeof body.void_reason === 'string' ? body.void_reason.trim() : '';
    if (!voidReason) {
      return NextResponse.json(
        { error: 'A valid void_reason is required to void a payment.' },
        { status: 400 }
      );
    }

    const existing = await prisma.docketPayment.findUnique({
      where: { id: paymentId },
      select: { id: true, docketId: true, voided: true },
    });

    if (!existing || existing.docketId !== id) {
      return NextResponse.json({ error: 'Payment not found.' }, { status: 404 });
    }

    if (existing.voided) {
      return NextResponse.json(
        { error: 'This payment has already been voided.' },
        { status: 409 }
      );
    }

    // Conditional update: if a concurrent request voided this payment between
    // the check above and here, updateMany matches zero rows instead of
    // overwriting the original void audit trail.
    const result = await prisma.$transaction(async (tx) => {
      const voided = await tx.docketPayment.updateMany({
        where: { id: paymentId, voided: false },
        data: {
          voided: true,
          voidReason,
          voidedAt: new Date(),
          voidedBy: user.id,
        },
      });

      if (voided.count > 0) {
        await tx.docketAuditLog.create({
          data: {
            docketId: id,
            action: 'payment_voided',
            changes: [{ field: 'void_reason', from: null, to: voidReason }],
            performedBy: user.id!,
          },
        });
      }

      return voided;
    });

    if (result.count === 0) {
      return NextResponse.json(
        { error: 'This payment has already been voided.' },
        { status: 409 }
      );
    }

    const updated = await prisma.docketPayment.findUnique({ where: { id: paymentId } });
    return NextResponse.json(updated);
  } catch (error: unknown) {
    console.error('Void payment failed:', error);
    return NextResponse.json({ error: 'Failed to void payment.' }, { status: 500 });
  }
}
