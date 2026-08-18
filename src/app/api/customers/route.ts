import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // "billed"/"paid" are aggregated over issued LRs matched by customer_code,
    // net of whatever the payment ledger already collected against each one
    // (legacy dockets marked Paid before the ledger existed count as settled).
    const customers = await prisma.$queryRaw<any[]>`
      WITH paid AS (
        SELECT docket_id, SUM(amount) AS amount
        FROM "docket_payments"
        GROUP BY docket_id
      ),
      docket_agg AS (
        SELECT
          cd.customer_code,
          SUM(cd.grand_total) AS total_billed,
          SUM(
            CASE
              WHEN COALESCE(paid.amount, 0) = 0 AND cd.payment_mode = 'Paid' THEN cd.grand_total
              ELSE COALESCE(paid.amount, 0)
            END
          ) AS total_paid
        FROM "cargo_dockets" cd
        LEFT JOIN paid ON paid.docket_id = cd.id
        WHERE cd.status = 'issued' AND cd.customer_code IS NOT NULL
        GROUP BY cd.customer_code
      )
      SELECT
        c.id, c.code, c.name, c.address, c.city, c.pin_code as "pinCode", c.phone, c.gstin, c.email,
        c.created_at as "createdAt", c.updated_at as "updatedAt",
        COALESCE(da.total_billed, 0)::float8 AS "totalBilled",
        COALESCE(da.total_paid, 0)::float8 AS "totalPaid",
        GREATEST(COALESCE(da.total_billed, 0) - COALESCE(da.total_paid, 0), 0)::float8 AS "outstandingAmount"
      FROM "customers" c
      LEFT JOIN docket_agg da ON da.customer_code = c.code
      ORDER BY c.name ASC
    `;

    return NextResponse.json(customers);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    if (!body.name || !body.name.trim()) {
      return NextResponse.json({ error: 'Customer name is required.' }, { status: 400 });
    }

    const countRes = await prisma.$queryRaw<any[]>`SELECT COUNT(*)::int as count FROM "customers"`;
    const count = countRes[0]?.count || 0;
    const code = body.code?.trim() || `CUST-${1001 + count}`;

    const [inserted] = await prisma.$queryRaw<any[]>`
      INSERT INTO "customers" (
        "id", "code", "name", "address", "city", "pin_code", "phone", "gstin", "email", "created_at", "updated_at"
      ) VALUES (
        gen_random_uuid()::text,
        ${code},
        ${body.name.trim()},
        ${body.address?.trim() || null},
        ${body.city?.trim() || null},
        ${body.pinCode?.trim() || body.pin_code?.trim() || null},
        ${body.phone?.trim() || null},
        ${body.gstin?.trim() || null},
        ${body.email?.trim() || null},
        NOW(),
        NOW()
      )
      RETURNING id, code, name, address, city, pin_code as "pinCode", phone, gstin, email;
    `;

    return NextResponse.json(inserted, { status: 201 });
  } catch (error: any) {
    if (error.code === 'P2002' || error.message?.includes('unique constraint') || error.message?.includes('customers_code_key')) {
      return NextResponse.json({ error: 'A customer with this code already exists.' }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
