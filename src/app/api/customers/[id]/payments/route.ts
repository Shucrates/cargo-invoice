import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { toPaymentMethodEnum, isPaymentMethodLabel } from '@/lib/paymentMethod';

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

    const [customer] = await prisma.$queryRaw<any[]>`
      SELECT id, code, name FROM "customers" WHERE id = ${id}
    `;

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found.' }, { status: 404 });
    }

    // Find all credit LRs for this customer ordered by booking_date ASC (oldest first)
    const dockets = await prisma.$queryRaw<any[]>`
      WITH paid AS (
        SELECT docket_id, SUM(amount) AS amount
        FROM "docket_payments"
        WHERE NOT voided
        GROUP BY docket_id
      )
      SELECT
        cd.id,
        cd.docket_no,
        cd.grand_total::float8 AS grand_total,
        COALESCE(paid.amount, 0)::float8 AS total_paid,
        GREATEST(cd.grand_total - COALESCE(paid.amount, 0), 0)::float8 AS outstanding_amount
      FROM "cargo_dockets" cd
      LEFT JOIN paid ON paid.docket_id = cd.id
      WHERE cd.status = 'issued'
        AND cd.payment_mode = 'Credit'
        AND (cd.customer_code = ${customer.code} OR LOWER(cd.consignor_name) = LOWER(${customer.name}))
        AND (cd.grand_total - COALESCE(paid.amount, 0)) > 0.01
      ORDER BY cd.booking_date ASC, cd.created_at ASC
    `;

    if (dockets.length === 0) {
      return NextResponse.json({ error: 'No outstanding credit LRs found for this customer.' }, { status: 400 });
    }

    let remainingToAllocate = amount;
    let allocatedTotal = 0;
    const paymentDate = body.paidAt ? new Date(body.paidAt) : new Date();
    const enumMethod = toPaymentMethodEnum(method);
    const notesText = body.notes?.trim() || `Bulk payment received from ${customer.name}`;

    const createdPayments: any[] = [];

    for (const d of dockets) {
      if (remainingToAllocate <= 0.001) break;

      const allocateForThisLR = Math.min(remainingToAllocate, d.outstanding_amount);
      if (allocateForThisLR <= 0) continue;

      const [payment] = await prisma.$queryRaw<any[]>`
        INSERT INTO "docket_payments" (
          "id", "docket_id", "amount", "method", "paid_at", "notes", "recorded_by", "created_at", "voided"
        ) VALUES (
          gen_random_uuid()::text,
          ${d.id},
          ${allocateForThisLR}::decimal,
          ${enumMethod}::"PaymentMethod",
          ${paymentDate}::date,
          ${notesText},
          ${user.id},
          NOW(),
          false
        )
        RETURNING id, docket_id, amount::float8 as amount, method, paid_at;
      `;

      createdPayments.push({
        ...payment,
        docketNo: d.docket_no,
      });

      remainingToAllocate -= allocateForThisLR;
      allocatedTotal += allocateForThisLR;
    }

    return NextResponse.json({
      success: true,
      allocatedTotal,
      remainingUnallocated: Math.max(0, remainingToAllocate),
      payments: createdPayments,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
