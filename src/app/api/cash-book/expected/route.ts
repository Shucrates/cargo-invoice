import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { isPaymentMethodLabel } from '@/lib/paymentMethod';

/**
 * Projected — not yet received. "Cash Expected/Pending" and its siblings for
 * other modes: the sum of outstanding balance on issued To Pay/Credit LRs
 * whose customer stated a matching expected_mode at booking time. This must
 * never be summed with the confirmed `/api/payments` ledger on the client.
 *
 * Legacy LRs with no expected_mode are excluded from the projection (never
 * guessed) and surfaced instead via missingExpectedModeCount/Amount.
 */
export async function GET(req: Request) {
  try {
    const session = await auth();
    const user = session?.user as { id?: string; role?: string } | undefined;
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: admin only.' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const dateFrom = searchParams.get('dateFrom')?.trim();
    const dateTo = searchParams.get('dateTo')?.trim();
    const staff = searchParams.get('staff')?.trim();
    const customerCode = searchParams.get('customerCode')?.trim();
    const modeParam = searchParams.get('mode')?.trim();
    const mode = modeParam && isPaymentMethodLabel(modeParam) ? modeParam : 'Cash';

    const [totals] = await prisma.$queryRawUnsafe<
      Array<Record<string, number>>
    >(
      `
      WITH paid AS (
        SELECT docket_id, SUM(amount) AS amount
        FROM "docket_payments"
        WHERE NOT voided
        GROUP BY docket_id
      ),
      d AS (
        SELECT
          cd.created_by,
          cd.expected_mode,
          GREATEST(cd.grand_total - COALESCE(paid.amount, 0), 0) AS balance
        FROM "cargo_dockets" cd
        LEFT JOIN paid ON paid.docket_id = cd.id
        WHERE cd.status = 'issued'
          AND cd.payment_mode IN ('To Pay', 'Credit')
          AND ($1::date IS NULL OR cd.booking_date >= $1::date)
          AND ($2::date IS NULL OR cd.booking_date <= $2::date)
          AND ($3::text IS NULL OR cd.created_by = $3::text)
          AND ($4::text IS NULL OR cd.customer_code = $4::text)
      )
      SELECT
        COALESCE(SUM(balance) FILTER (WHERE expected_mode = $5::"PaymentMethod"), 0)::float8 AS "totalExpected",
        COUNT(*) FILTER (WHERE expected_mode IS NULL)::int AS "missingExpectedModeCount",
        COALESCE(SUM(balance) FILTER (WHERE expected_mode IS NULL), 0)::float8 AS "missingExpectedModeAmount"
      FROM d
      `,
      dateFrom || null,
      dateTo || null,
      staff || null,
      customerCode || null,
      mode
    );

    const byStaff = await prisma.$queryRawUnsafe<
      Array<{ created_by: string; name: string; amount: number }>
    >(
      `
      WITH paid AS (
        SELECT docket_id, SUM(amount) AS amount
        FROM "docket_payments"
        WHERE NOT voided
        GROUP BY docket_id
      )
      SELECT
        cd.created_by,
        COALESCE(u.full_name, u.email, 'Staff') AS name,
        SUM(GREATEST(cd.grand_total - COALESCE(paid.amount, 0), 0))::float8 AS amount
      FROM "cargo_dockets" cd
      LEFT JOIN paid ON paid.docket_id = cd.id
      LEFT JOIN "users" u ON u.id = cd.created_by
      WHERE cd.status = 'issued'
        AND cd.payment_mode IN ('To Pay', 'Credit')
        AND cd.expected_mode = $5::"PaymentMethod"
        AND ($1::date IS NULL OR cd.booking_date >= $1::date)
        AND ($2::date IS NULL OR cd.booking_date <= $2::date)
        AND ($3::text IS NULL OR cd.created_by = $3::text)
        AND ($4::text IS NULL OR cd.customer_code = $4::text)
      GROUP BY cd.created_by, u.full_name, u.email
      ORDER BY amount DESC
      `,
      dateFrom || null,
      dateTo || null,
      staff || null,
      customerCode || null,
      mode
    );

    return NextResponse.json({
      mode,
      total_expected: totals?.totalExpected ?? 0,
      missing_expected_mode_count: totals?.missingExpectedModeCount ?? 0,
      missing_expected_mode_amount: totals?.missingExpectedModeAmount ?? 0,
      by_staff: byStaff.map((row) => ({
        staff_id: row.created_by,
        staff_name: row.name,
        amount: Number(row.amount),
      })),
    });
  } catch (error: unknown) {
    console.error('Cash-book expected query failed:', error);
    return NextResponse.json({ error: 'Failed to load expected cash figures.' }, { status: 500 });
  }
}
