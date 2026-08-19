import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { toPaise, paiseToDecimalString } from '@/lib/money';
import { isPaymentMethodLabel, toPaymentMethodEnum, fromPaymentMethodEnum } from '@/lib/paymentMethod';

function serializePayment(p: {
  id: string;
  docketId: string;
  amount: unknown;
  method: string;
  paidAt: Date;
  notes: string | null;
  recordedBy: string;
  recorder: { fullName: string | null; email: string } | null;
  createdAt: Date;
  voided: boolean;
  voidReason: string | null;
  voidedAt: Date | null;
  voider: { fullName: string | null; email: string } | null;
}) {
  return {
    id: p.id,
    docket_id: p.docketId,
    amount: Number(p.amount),
    method: fromPaymentMethodEnum(p.method),
    paid_at: p.paidAt.toISOString().split('T')[0],
    notes: p.notes || '',
    recorded_by: p.recordedBy,
    recorded_by_name: p.recorder?.fullName || p.recorder?.email || 'Staff',
    created_at: p.createdAt.toISOString(),
    voided: p.voided,
    void_reason: p.voidReason || '',
    voided_at: p.voidedAt ? p.voidedAt.toISOString() : null,
    voided_by_name: p.voider?.fullName || p.voider?.email || '',
  };
}

/** Sums existing payments and applies the legacy-Paid rule: a docket marked
 *  "Paid" before the payment ledger existed with no payment rows is treated
 *  as fully settled rather than outstanding. */
async function summarizeDocket(id: string) {
  const docket = await prisma.cargoDocket.findUnique({
    where: { id },
    select: { grandTotal: true, paymentMode: true, status: true },
  });
  if (!docket) return null;

  const sum = await prisma.docketPayment.aggregate({
    where: { docketId: id, voided: false },
    _sum: { amount: true },
  });
  const grandTotal = Number(docket.grandTotal);
  const ledgerPaid = Number(sum._sum.amount || 0);
  const amountPaid = ledgerPaid === 0 && docket.paymentMode === 'Paid' ? grandTotal : ledgerPaid;
  const amountDue = Math.max(grandTotal - amountPaid, 0);

  return { docket, grandTotal, amountPaid, amountDue };
}

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
    const summary = await summarizeDocket(id);
    if (!summary) {
      return NextResponse.json({ error: 'LR not found.' }, { status: 404 });
    }

    const payments = await prisma.docketPayment.findMany({
      where: { docketId: id },
      orderBy: { paidAt: 'desc' },
      include: {
        recorder: { select: { fullName: true, email: true } },
        voider: { select: { fullName: true, email: true } },
      },
    });

    return NextResponse.json({
      payments: payments.map(serializePayment),
      grand_total: summary.grandTotal,
      amount_paid: summary.amountPaid,
      amount_due: summary.amountDue,
    });
  } catch (error: unknown) {
    console.error('Failed to list payments:', error);
    return NextResponse.json({ error: 'Failed to load payments' }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const user = session?.user as { id?: string } | undefined;
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const summary = await summarizeDocket(id);
    if (!summary) {
      return NextResponse.json({ error: 'LR not found.' }, { status: 404 });
    }
    if (summary.docket.status !== 'issued') {
      return NextResponse.json({ error: 'Cannot record a payment on a voided LR.' }, { status: 400 });
    }

    const body = await req.json();
    const method = String(body.method || '');
    if (!isPaymentMethodLabel(method)) {
      return NextResponse.json({ error: 'A valid payment method is required.' }, { status: 400 });
    }

    const amountPaise = toPaise(body.amount);
    if (amountPaise <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than zero.' }, { status: 400 });
    }
    const amountDuePaise = Math.round(summary.amountDue * 100);
    if (amountPaise > amountDuePaise) {
      return NextResponse.json(
        { error: `Amount exceeds the outstanding balance of ₹${summary.amountDue.toFixed(2)}.` },
        { status: 400 }
      );
    }

    const paidAt = body.paid_at ? new Date(body.paid_at) : new Date();
    if (Number.isNaN(paidAt.getTime())) {
      return NextResponse.json({ error: 'Invalid payment date.' }, { status: 400 });
    }

    const updateExpectedMode = Boolean(body.update_expected_mode) && amountPaise < amountDuePaise;

    await prisma.$transaction(async (tx) => {
      await tx.docketPayment.create({
        data: {
          docketId: id,
          amount: paiseToDecimalString(amountPaise),
          method: toPaymentMethodEnum(method),
          paidAt,
          notes: body.notes ? String(body.notes).trim() : null,
          recordedBy: user.id!,
        },
      });

      // Fully settled — flip the booking-intent label to Paid so it stops
      // showing up as To Pay / Credit even though it was paid off gradually.
      if (amountPaise === amountDuePaise) {
        await tx.cargoDocket.update({
          where: { id },
          data: { paymentMode: 'Paid' },
        });
      } else if (updateExpectedMode) {
        // Only when the caller explicitly opts in — a partial payment in one
        // mode doesn't imply the remaining balance will land the same way.
        await tx.cargoDocket.update({
          where: { id },
          data: { expectedMode: toPaymentMethodEnum(method) },
        });
      }
    });

    const updated = await summarizeDocket(id);
    return NextResponse.json(
      {
        amount_paid: updated?.amountPaid ?? 0,
        amount_due: updated?.amountDue ?? 0,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error('Failed to record payment:', error);
    return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 });
  }
}
