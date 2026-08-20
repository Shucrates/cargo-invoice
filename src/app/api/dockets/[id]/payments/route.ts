import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { toPaymentMethodEnum, isPaymentMethodLabel, fromPaymentMethodEnum } from '@/lib/paymentMethod';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    const user = session?.user as { id?: string } | undefined;
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();

    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'A valid payment amount greater than zero is required.' }, { status: 400 });
    }

    const method = body.method;
    if (!method || !isPaymentMethodLabel(method)) {
      return NextResponse.json({ error: 'A valid payment method (Cash, UPI, Bank Transfer, Cheque, Card, or Other) is required.' }, { status: 400 });
    }

    const [docket] = await prisma.$queryRaw<any[]>`
      SELECT id, docket_no, grand_total::float8 as grand_total FROM "cargo_dockets" WHERE id = ${id}
    `;

    if (!docket) {
      return NextResponse.json({ error: 'LR not found.' }, { status: 404 });
    }

    const enumMethod = toPaymentMethodEnum(method);
    const paymentDate = body.paidAt ? new Date(body.paidAt) : new Date();

    const [inserted] = await prisma.$queryRaw<any[]>`
      INSERT INTO "docket_payments" (
        "id", "docket_id", "amount", "method", "paid_at", "notes", "recorded_by", "created_at", "voided"
      ) VALUES (
        gen_random_uuid()::text,
        ${id},
        ${amount}::decimal,
        ${enumMethod}::"PaymentMethod",
        ${paymentDate}::date,
        ${body.notes?.trim() || `Payment received for ${docket.docket_no}`},
        ${user.id},
        NOW(),
        false
      )
      RETURNING id, docket_id, amount::float8 as amount, method, paid_at;
    `;

    return NextResponse.json({
      success: true,
      payment: {
        ...inserted,
        method: fromPaymentMethodEnum(inserted.method),
        docketNo: docket.docket_no,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
