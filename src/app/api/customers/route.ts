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
        WHERE NOT voided
        GROUP BY docket_id
      ),
      docket_match AS (
        SELECT
          cd.id,
          cd.grand_total,
          cd.payment_mode,
          c.id AS customer_id,
          COALESCE(
            CASE
              WHEN COALESCE(paid.amount, 0) = 0 AND cd.payment_mode = 'Paid' THEN cd.grand_total
              ELSE paid.amount
            END,
            0
          ) AS paid_amount
        FROM "cargo_dockets" cd
        CROSS JOIN "customers" c
        LEFT JOIN paid ON paid.docket_id = cd.id
        WHERE cd.status = 'issued'
          AND (cd.customer_code = c.code OR LOWER(cd.consignor_name) = LOWER(c.name))
      )
      SELECT
        c.id, c.code, c.name, c.contact_person as "contactPerson", c.address, c.city, c.pin_code as "pinCode", c.phone, c.gstin, c.email,
        c.payment_terms_days as "paymentTermsDays", c.credit_limit::float8 as "creditLimit", c.notes,
        c.created_at as "createdAt", c.updated_at as "updatedAt",
        COALESCE(SUM(dm.grand_total), 0)::float8 AS "totalBilled",
        COALESCE(SUM(dm.paid_amount), 0)::float8 AS "totalPaid",
        GREATEST(COALESCE(SUM(dm.grand_total), 0) - COALESCE(SUM(dm.paid_amount), 0), 0)::float8 AS "outstandingAmount",
        COALESCE(SUM(CASE WHEN dm.payment_mode = 'Credit' THEN GREATEST(dm.grand_total - dm.paid_amount, 0) ELSE 0 END), 0)::float8 AS "outstandingCredit",
        COALESCE(SUM(CASE WHEN dm.payment_mode = 'To Pay' THEN GREATEST(dm.grand_total - dm.paid_amount, 0) ELSE 0 END), 0)::float8 AS "outstandingToPay"
      FROM "customers" c
      LEFT JOIN docket_match dm ON dm.customer_id = c.id
      GROUP BY c.id, c.code, c.name, c.contact_person, c.address, c.city, c.pin_code, c.phone, c.gstin, c.email, c.payment_terms_days, c.credit_limit, c.notes, c.created_at, c.updated_at
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
        "id", "code", "name", "contact_person", "address", "city", "pin_code", "phone", "gstin", "email",
        "payment_terms_days", "credit_limit", "notes", "created_at", "updated_at"
      ) VALUES (
        gen_random_uuid()::text,
        ${code},
        ${body.name.trim()},
        ${body.contactPerson?.trim() || body.contact_person?.trim() || null},
        ${body.address?.trim() || null},
        ${body.city?.trim() || null},
        ${body.pinCode?.trim() || body.pin_code?.trim() || null},
        ${body.phone?.trim() || null},
        ${body.gstin?.trim() || null},
        ${body.email?.trim() || null},
        ${body.paymentTermsDays ? Number(body.paymentTermsDays) : 30},
        ${body.creditLimit ? Number(body.creditLimit) : 500000},
        ${body.notes?.trim() || null},
        NOW(),
        NOW()
      )
      RETURNING id, code, name, contact_person as "contactPerson", address, city, pin_code as "pinCode", phone, gstin, email, payment_terms_days as "paymentTermsDays", credit_limit::float8 as "creditLimit", notes;
    `;

    return NextResponse.json(inserted, { status: 201 });
  } catch (error: any) {
    if (error.code === 'P2002' || error.message?.includes('unique constraint') || error.message?.includes('customers_code_key')) {
      return NextResponse.json({ error: 'A customer with this code already exists.' }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
