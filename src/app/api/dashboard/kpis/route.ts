import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

/**
 * All period boundaries are evaluated in India Standard Time, not UTC. A booking
 * made at 02:00 IST belongs to that business day, but in UTC it still reads as
 * the previous day — using UTC here would misreport "today" every night.
 */
const TZ = 'Asia/Kolkata';

/**
 * Totals are computed and frozen at write time (and historical rows were
 * corrected by the backfill migration), so these aggregates read the stored
 * columns directly rather than recalculating anything.
 *
 * The dashboard is shared data — staff and admins aggregate over the whole
 * book, not just their own dockets. Revenue reporting stays admin-only via
 * the separate, nav-gated Reports tab.
 *
 * "paid" joins the payment ledger per docket. Dockets marked "Paid" before
 * the ledger existed have no rows there — eff_paid falls back to the full
 * total for those so they don't misreport as outstanding.
 */
function docketsCte() {
  return `
  WITH paid AS (
    SELECT docket_id, SUM(amount) AS amount
    FROM "docket_payments"
    GROUP BY docket_id
  ),
  d AS (
    SELECT
      cd.status,
      cd.booking_date,
      cd.payment_mode,
      cd.delivery_status,
      cd.charged_weight_kg,
      cd.subtotal    AS eff_subtotal,
      cd.gst_amount  AS eff_gst,
      cd.grand_total AS eff_total,
      CASE
        WHEN COALESCE(paid.amount, 0) = 0 AND cd.payment_mode = 'Paid' THEN cd.grand_total
        ELSE COALESCE(paid.amount, 0)
      END AS eff_paid
    FROM "cargo_dockets" cd
    LEFT JOIN paid ON paid.docket_id = cd.id
  )
`;
}

export async function GET() {
  try {
    const session = await auth();
    const user = session?.user as { id?: string; role?: string } | undefined;

    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [totals] = await prisma.$queryRawUnsafe<
      Array<Record<string, number | null>>
    >(
      `
      ${docketsCte()}
      SELECT
        COUNT(*) FILTER (WHERE status = 'issued')::int              AS "activeCount",
        COUNT(*) FILTER (WHERE status = 'voided')::int              AS "voidedCount",

        COALESCE(SUM(eff_total)    FILTER (WHERE status = 'issued'), 0)::float8 AS "totalRevenue",
        COALESCE(SUM(eff_subtotal) FILTER (WHERE status = 'issued'), 0)::float8 AS "totalSubtotal",
        COALESCE(SUM(eff_gst)      FILTER (WHERE status = 'issued'), 0)::float8 AS "totalGST",
        COALESCE(SUM(charged_weight_kg) FILTER (WHERE status = 'issued'), 0)::float8 AS "totalWeight",

        -- Outstanding is net of whatever has already been collected against
        -- each docket, not the full grand_total of every To Pay/Credit LR.
        COALESCE(SUM(GREATEST(eff_total - eff_paid, 0)) FILTER (
          WHERE status = 'issued'
        ), 0)::float8 AS "pendingCollection",
        COALESCE(SUM(eff_paid) FILTER (WHERE status = 'issued'), 0)::float8 AS "paidCollection",
        COUNT(*) FILTER (
          WHERE status = 'issued' AND (eff_total - eff_paid) > 0.005
        )::int AS "unpaidCount",

        -- Delivery lifecycle, in fixed stages set by staff on the LR.
        COUNT(*) FILTER (
          WHERE status = 'issued' AND delivery_status <> 'Delivered'
        )::int AS "pendingDeliveries",
        COUNT(*) FILTER (
          WHERE status = 'issued' AND delivery_status = 'Delivered'
        )::int AS "completedDeliveries",

        -- Booking counts by business day / week, in IST.
        COUNT(*) FILTER (
          WHERE status = 'issued'
            AND booking_date = (now() AT TIME ZONE '${TZ}')::date
        )::int AS "bookedToday",
        COUNT(*) FILTER (
          WHERE status = 'issued'
            AND booking_date = (now() AT TIME ZONE '${TZ}')::date - INTERVAL '1 day'
        )::int AS "bookedYesterday",
        COUNT(*) FILTER (
          WHERE status = 'issued'
            AND booking_date >= date_trunc('week', (now() AT TIME ZONE '${TZ}')::date)
        )::int AS "bookedThisWeek",
        COUNT(*) FILTER (
          WHERE status = 'issued'
            AND booking_date >= date_trunc('week', (now() AT TIME ZONE '${TZ}')::date) - INTERVAL '7 days'
            AND booking_date <  date_trunc('week', (now() AT TIME ZONE '${TZ}')::date)
        )::int AS "bookedLastWeek",

        -- Revenue by calendar month, in IST.
        COALESCE(SUM(eff_total) FILTER (
          WHERE status = 'issued'
            AND booking_date >= date_trunc('month', (now() AT TIME ZONE '${TZ}')::date)
        ), 0)::float8 AS "revenueThisMonth",
        COALESCE(SUM(eff_total) FILTER (
          WHERE status = 'issued'
            AND booking_date >= date_trunc('month', (now() AT TIME ZONE '${TZ}')::date) - INTERVAL '1 month'
            AND booking_date <  date_trunc('month', (now() AT TIME ZONE '${TZ}')::date)
        ), 0)::float8 AS "revenueLastMonth"
      FROM d
    `
    );

    const [cash] = await prisma.$queryRawUnsafe<
      Array<Record<string, number>>
    >(`
      SELECT
        COALESCE(SUM(amount) FILTER (
          WHERE method = 'Cash'
            AND paid_at >= date_trunc('month', (now() AT TIME ZONE '${TZ}')::date)
        ), 0)::float8 AS "cashCollectedThisMonth",
        COALESCE(SUM(amount) FILTER (
          WHERE method = 'Cash'
            AND paid_at >= date_trunc('month', (now() AT TIME ZONE '${TZ}')::date) - INTERVAL '1 month'
            AND paid_at <  date_trunc('month', (now() AT TIME ZONE '${TZ}')::date)
        ), 0)::float8 AS "cashCollectedLastMonth"
      FROM "docket_payments"
    `);

    const [customers] = await prisma.$queryRawUnsafe<
      Array<Record<string, number>>
    >(`
      SELECT
        COUNT(*)::int AS "customerCount",
        COUNT(*) FILTER (
          WHERE (created_at AT TIME ZONE '${TZ}')::date
                >= date_trunc('month', (now() AT TIME ZONE '${TZ}')::date)
        )::int AS "customersThisMonth"
      FROM "customers"
    `);

    return NextResponse.json({ ...totals, ...cash, ...customers });
  } catch (error: unknown) {
    console.error('KPI query failed:', error);
    return NextResponse.json({ error: 'Failed to load dashboard metrics' }, { status: 500 });
  }
}
