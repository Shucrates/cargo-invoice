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
    WHERE NOT voided
    GROUP BY docket_id
  ),
  d AS (
    SELECT
      cd.status,
      cd.booking_date,
      cd.payment_mode,
      cd.expected_mode,
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

const ADMIN_ONLY_KPIS = [
  'totalRevenue',
  'totalSubtotal',
  'totalGST',
  'pendingCollection',
  'paidCollection',
  'cashExpectedThisMonth',
  'missingExpectedModeCount',
  'missingExpectedModeAmount',
  'revenueThisMonth',
  'revenueLastMonth',
  'cashCollectedThisMonth',
  'cashCollectedLastMonth',
];

type KpiTimeframe = 'week' | 'month' | 'year' | 'all';
const TIMEFRAMES: KpiTimeframe[] = ['week', 'month', 'year', 'all'];

/** Number of equal time slices the KPI sparklines are drawn from. */
const TREND_BUCKETS = 7;
/** Weeks of daily booking counts the Shipments Volume chart can page back through. */
const BOOKING_HISTORY_WEEKS = 12;

/** Today's date in IST as YYYY-MM-DD. */
function todayIST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}

/** First day (YYYY-MM-DD, IST) of the selected period; null for "all". */
function timeframeStart(timeframe: KpiTimeframe, today: string): string | null {
  const [y, m, d] = today.split('-').map(Number);
  if (timeframe === 'year') return `${y}-01-01`;
  if (timeframe === 'month') return `${y}-${String(m).padStart(2, '0')}-01`;
  if (timeframe === 'week') {
    const date = new Date(Date.UTC(y, m - 1, d));
    const dow = date.getUTCDay();
    date.setUTCDate(date.getUTCDate() - (dow === 0 ? 6 : dow - 1));
    return date.toISOString().slice(0, 10);
  }
  return null;
}

/** Spreads per-bucket rows from SQL into a fixed-length, zero-filled array. */
function toSeries(rows: Array<{ bucket: number; value: number }>): number[] {
  const series = new Array<number>(TREND_BUCKETS).fill(0);
  for (const r of rows) {
    if (r.bucket >= 0 && r.bucket < TREND_BUCKETS) series[r.bucket] = Number(r.value) || 0;
  }
  return series;
}

/**
 * KPIs scoped to the dashboard's selected timeframe, plus sparkline series
 * split into equal time slices across that period. Everything is aggregated
 * in SQL over the whole book — never over a paginated page of dockets.
 */
async function timeframeKpis(timeframe: KpiTimeframe, userId: string) {
  const today = todayIST();
  let start = timeframeStart(timeframe, today);
  if (!start) {
    const [row] = await prisma.$queryRawUnsafe<Array<{ first: string | null }>>(
      `SELECT to_char(MIN(booking_date), 'YYYY-MM-DD') AS first FROM "cargo_dockets"`
    );
    start = row?.first && row.first < today ? row.first : today;
  }

  // Bucket index for a date column: 0..6 across [start, today].
  const bucketOf = (col: string) =>
    `LEAST(${TREND_BUCKETS - 1}, GREATEST(0, FLOOR(((${col}) - $1::date) * ${TREND_BUCKETS}.0 / (($2::date - $1::date) + 1))))::int`;

  const [totals] = await prisma.$queryRawUnsafe<Array<Record<string, number>>>(
    `
    ${docketsCte()}
    SELECT
      COUNT(*) FILTER (WHERE status = 'issued')::int AS "activeCount",
      COUNT(*) FILTER (WHERE status = 'voided')::int AS "voidedCount",
      COUNT(*) FILTER (WHERE status = 'issued' AND delivery_status <> 'Delivered')::int AS "pendingDeliveries",
      COUNT(*) FILTER (WHERE status = 'issued' AND delivery_status = 'Delivered')::int AS "completedDeliveries",
      COUNT(*) FILTER (WHERE status = 'issued' AND delivery_status IN ('In Transit', 'Out for Delivery'))::int AS "inTransit",
      COALESCE(SUM(eff_total)    FILTER (WHERE status = 'issued'), 0)::float8 AS "revenue",
      COALESCE(SUM(eff_subtotal) FILTER (WHERE status = 'issued'), 0)::float8 AS "subtotal",
      COALESCE(SUM(eff_gst)      FILTER (WHERE status = 'issued'), 0)::float8 AS "gst",
      COALESCE(SUM(GREATEST(eff_total - eff_paid, 0)) FILTER (WHERE status = 'issued'), 0)::float8 AS "outstanding",
      COUNT(*) FILTER (WHERE status = 'issued' AND (eff_total - eff_paid) > 0.005)::int AS "unpaidCount",
      COALESCE(SUM(GREATEST(eff_total - eff_paid, 0)) FILTER (
        WHERE status = 'issued' AND payment_mode IN ('To Pay', 'Credit') AND expected_mode = 'Cash'
      ), 0)::float8 AS "cashExpected"
    FROM d
    WHERE booking_date BETWEEN $1::date AND $2::date
    `,
    start,
    today
  );

  const [cash] = await prisma.$queryRawUnsafe<Array<Record<string, number>>>(
    `
    SELECT
      COALESCE(SUM(amount), 0)::float8 AS "cashCollected",
      COALESCE(SUM(amount) FILTER (WHERE recorded_by = $3::text), 0)::float8 AS "myCashCollected"
    FROM "docket_payments"
    WHERE NOT voided AND method = 'Cash' AND paid_at BETWEEN $1::date AND $2::date
    `,
    start,
    today,
    userId
  );

  const docketTrends = await prisma.$queryRawUnsafe<
    Array<{ bucket: number; pending: number; completed: number; transit: number; outstanding: number }>
  >(
    `
    ${docketsCte()}
    SELECT
      ${bucketOf('booking_date')} AS bucket,
      COUNT(*) FILTER (WHERE delivery_status <> 'Delivered')::int AS pending,
      COUNT(*) FILTER (WHERE delivery_status = 'Delivered')::int AS completed,
      COUNT(*) FILTER (WHERE delivery_status IN ('In Transit', 'Out for Delivery'))::int AS transit,
      COALESCE(SUM(GREATEST(eff_total - eff_paid, 0)), 0)::float8 AS outstanding
    FROM d
    WHERE status = 'issued' AND booking_date BETWEEN $1::date AND $2::date
    GROUP BY 1
    `,
    start,
    today
  );

  const cashTrends = await prisma.$queryRawUnsafe<Array<{ bucket: number; cash: number; mine: number }>>(
    `
    SELECT
      ${bucketOf('paid_at')} AS bucket,
      COALESCE(SUM(amount), 0)::float8 AS cash,
      COALESCE(SUM(amount) FILTER (WHERE recorded_by = $3::text), 0)::float8 AS mine
    FROM "docket_payments"
    WHERE NOT voided AND method = 'Cash' AND paid_at BETWEEN $1::date AND $2::date
    GROUP BY 1
    `,
    start,
    today,
    userId
  );

  return {
    timeframe,
    startDate: start,
    endDate: today,
    ...totals,
    ...cash,
    trends: {
      pending: toSeries(docketTrends.map((r) => ({ bucket: r.bucket, value: r.pending }))),
      completed: toSeries(docketTrends.map((r) => ({ bucket: r.bucket, value: r.completed }))),
      inTransit: toSeries(docketTrends.map((r) => ({ bucket: r.bucket, value: r.transit }))),
      outstanding: toSeries(docketTrends.map((r) => ({ bucket: r.bucket, value: r.outstanding }))),
      cash: toSeries(cashTrends.map((r) => ({ bucket: r.bucket, value: r.cash }))),
      myCash: toSeries(cashTrends.map((r) => ({ bucket: r.bucket, value: r.mine }))),
    },
  };
}

/** Money fields inside the timeframe block that staff must not see. */
const ADMIN_ONLY_TIMEFRAME_KPIS = ['revenue', 'subtotal', 'gst', 'outstanding', 'unpaidCount', 'cashExpected', 'cashCollected'];
const ADMIN_ONLY_TRENDS = ['outstanding', 'cash'];

export async function GET(req: Request) {
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

        -- Projected, not confirmed — a customer's stated intent at booking
        -- time, never to be summed with actually-collected cash.
        COALESCE(SUM(GREATEST(eff_total - eff_paid, 0)) FILTER (
          WHERE status = 'issued' AND payment_mode IN ('To Pay', 'Credit') AND expected_mode = 'Cash'
        ), 0)::float8 AS "cashExpectedThisMonth",
        COUNT(*) FILTER (
          WHERE status = 'issued' AND payment_mode IN ('To Pay', 'Credit') AND expected_mode IS NULL
        )::int AS "missingExpectedModeCount",
        COALESCE(SUM(GREATEST(eff_total - eff_paid, 0)) FILTER (
          WHERE status = 'issued' AND payment_mode IN ('To Pay', 'Credit') AND expected_mode IS NULL
        ), 0)::float8 AS "missingExpectedModeAmount",

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
    >(
      `
      SELECT
        COALESCE(SUM(amount) FILTER (
          WHERE method = 'Cash'
            AND paid_at >= date_trunc('month', (now() AT TIME ZONE '${TZ}')::date)
        ), 0)::float8 AS "cashCollectedThisMonth",
        COALESCE(SUM(amount) FILTER (
          WHERE method = 'Cash'
            AND paid_at >= date_trunc('month', (now() AT TIME ZONE '${TZ}')::date) - INTERVAL '1 month'
            AND paid_at <  date_trunc('month', (now() AT TIME ZONE '${TZ}')::date)
        ), 0)::float8 AS "cashCollectedLastMonth",
        COALESCE(SUM(amount) FILTER (
          WHERE method = 'Cash'
            AND recorded_by = $1::text
            AND paid_at >= (now() AT TIME ZONE '${TZ}')::date
        ), 0)::float8 AS "myCashCollectedToday",
        COALESCE(SUM(amount) FILTER (
          WHERE method = 'Cash'
            AND recorded_by = $1::text
            AND paid_at >= date_trunc('week', (now() AT TIME ZONE '${TZ}')::date)
        ), 0)::float8 AS "myCashCollectedThisWeek"
      FROM "docket_payments"
      WHERE NOT voided
      `,
      user.id
    );

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

    const timeframeParam = new URL(req.url).searchParams.get('timeframe') as KpiTimeframe | null;
    const timeframe: KpiTimeframe = timeframeParam && TIMEFRAMES.includes(timeframeParam) ? timeframeParam : 'month';
    const period: Record<string, unknown> & { trends: Record<string, number[]> } = await timeframeKpis(timeframe, user.id);

    // Chart series: revenue for the last 6 calendar months and daily booking
    // counts for the last BOOKING_HISTORY_WEEKS weeks, both in IST.
    const revenueByMonth = await prisma.$queryRawUnsafe<Array<{ month: string; revenue: number }>>(
      `
      SELECT to_char(booking_date, 'YYYY-MM') AS month, COALESCE(SUM(grand_total), 0)::float8 AS revenue
      FROM "cargo_dockets"
      WHERE status = 'issued'
        AND booking_date >= date_trunc('month', (now() AT TIME ZONE '${TZ}')::date) - INTERVAL '5 months'
      GROUP BY 1
      `
    );
    const bookingsByDay = await prisma.$queryRawUnsafe<Array<{ day: string; count: number }>>(
      `
      SELECT to_char(booking_date, 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
      FROM "cargo_dockets"
      WHERE booking_date >= date_trunc('week', (now() AT TIME ZONE '${TZ}')::date) - INTERVAL '${(BOOKING_HISTORY_WEEKS - 1) * 7} days'
      GROUP BY 1
      `
    );

    const result: Record<string, unknown> = {
      ...totals,
      ...cash,
      ...customers,
      period,
      revenueByMonth: Object.fromEntries(revenueByMonth.map((r) => [r.month, Number(r.revenue)])),
      bookingsByDay: Object.fromEntries(bookingsByDay.map((r) => [r.day, Number(r.count)])),
    };
    // Company-wide money totals are admin-only; staff keep counts and their
    // own cash figures.
    if (user.role !== 'admin') {
      for (const key of ADMIN_ONLY_KPIS) delete result[key];
      for (const key of ADMIN_ONLY_TIMEFRAME_KPIS) delete period[key];
      for (const key of ADMIN_ONLY_TRENDS) delete period.trends[key];
      delete result.revenueByMonth;
    }
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('KPI query failed:', error);
    return NextResponse.json({ error: 'Failed to load dashboard metrics' }, { status: 500 });
  }
}
