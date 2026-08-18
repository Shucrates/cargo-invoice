import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { isPaymentMethodLabel, toPaymentMethodEnum, fromPaymentMethodEnum } from '@/lib/paymentMethod';

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

/** Cross-docket payment ledger — primarily backs the Reports-tab Cash
 *  Transactions Log, but supports any method for a full audit trail. */
export async function GET(req: Request) {
  try {
    const session = await auth();
    const user = session?.user as { id?: string } | undefined;
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const method = searchParams.get('method')?.trim();
    const from = searchParams.get('from')?.trim();
    const to = searchParams.get('to')?.trim();
    const limit = Math.min(
      Math.max(Number(searchParams.get('limit')) || DEFAULT_LIMIT, 1),
      MAX_LIMIT
    );

    const where: Prisma.DocketPaymentWhereInput = {};
    if (method && isPaymentMethodLabel(method)) {
      where.method = toPaymentMethodEnum(method);
    }
    if (from || to) {
      where.paidAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const payments = await prisma.docketPayment.findMany({
      where,
      orderBy: { paidAt: 'desc' },
      take: limit,
      include: {
        docket: { select: { docketNo: true } },
        recorder: { select: { fullName: true, email: true } },
      },
    });

    return NextResponse.json({
      payments: payments.map((p) => ({
        id: p.id,
        docket_id: p.docketId,
        docket_no: p.docket.docketNo,
        amount: Number(p.amount),
        method: fromPaymentMethodEnum(p.method),
        paid_at: p.paidAt.toISOString().split('T')[0],
        notes: p.notes || '',
        recorded_by_name: p.recorder?.fullName || p.recorder?.email || 'Staff',
      })),
    });
  } catch (error: unknown) {
    console.error('Failed to list payments:', error);
    return NextResponse.json({ error: 'Failed to load payments' }, { status: 500 });
  }
}
