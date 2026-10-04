import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { fromPaymentMethodEnum } from '@/lib/paymentMethod';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const [customer] = await prisma.$queryRaw<any[]>`
      SELECT
        c.id, c.code, c.name, c.contact_person as "contactPerson", c.address, c.city,
        c.pin_code as "pinCode", c.phone, c.gstin, c.email,
        c.payment_terms_days as "paymentTermsDays", c.credit_limit::float8 as "creditLimit", c.notes,
        c.created_at as "createdAt", c.updated_at as "updatedAt"
      FROM "customers" c
      WHERE c.id = ${id}
    `;

    if (!customer) {
      return NextResponse.json({ error: 'Customer profile not found.' }, { status: 404 });
    }

    // Fetch all LRs for this customer
    const docketsRaw = await prisma.$queryRaw<any[]>`
      WITH paid AS (
        SELECT docket_id, SUM(amount) AS amount
        FROM "docket_payments"
        WHERE NOT voided
        GROUP BY docket_id
      )
      SELECT
        cd.id,
        cd.docket_no,
        cd.booking_date as "booking_date",
        cd.from_city,
        cd.to_city,
        cd.consignor_name,
        cd.consignor_address,
        cd.consignor_pin,
        cd.consignor_phone,
        cd.consignor_gstin,
        cd.consignee_name,
        cd.consignee_address,
        cd.consignee_pin,
        cd.consignee_phone,
        cd.consignee_gstin,
        cd.package_count,
        cd.packing_method,
        cd.invoice_no,
        cd.invoice_value::float8 as invoice_value,
        cd.actual_weight_kg::float8 as actual_weight_kg,
        cd.charged_weight_kg::float8 as charged_weight_kg,
        cd.dimensions_lhb,
        cd.goods_description,
        cd.eway_bill_no,
        cd.freight_amount::float8 as freight_amount,
        cd.fuel_charge::float8 as fuel_charge,
        cd.clearing_charge::float8 as clearing_charge,
        cd.air_service_charge::float8 as air_service_charge,
        cd.risk_charge::float8 as risk_charge,
        cd.handling_charge::float8 as handling_charge,
        cd.docket_charge::float8 as docket_charge,
        cd.pickup_delivery_charge::float8 as pickup_delivery_charge,
        cd.other_charge::float8 as other_charge,
        cd.subtotal::float8 as subtotal,
        cd.gst_percentage::float8 as gst_percentage,
        cd.gst_amount::float8 as gst_amount,
        cd.transport_mode,
        cd.payment_mode,
        cd.expected_mode,
        cd.delivery_status,
        cd.customer_code,
        cd.tracking_no,
        cd.courier_partner,
        cd.physical_docket_no,
        cd.grand_total::float8 AS grand_total,
        COALESCE(
          CASE
            WHEN COALESCE(paid.amount, 0) = 0 AND cd.payment_mode = 'Paid' THEN cd.grand_total
            ELSE paid.amount
          END,
          0
        )::float8 AS total_paid,
        GREATEST(
          cd.grand_total - COALESCE(
            CASE
              WHEN COALESCE(paid.amount, 0) = 0 AND cd.payment_mode = 'Paid' THEN cd.grand_total
              ELSE paid.amount
            END,
            0
          ),
          0
        )::float8 AS outstanding_amount,
        cd.status,
        cd.created_at as "created_at",
        cd.updated_at as "updated_at"
      FROM "cargo_dockets" cd
      LEFT JOIN paid ON paid.docket_id = cd.id
      WHERE cd.customer_code = ${customer.code} OR LOWER(cd.consignor_name) = LOWER(${customer.name})
      ORDER BY cd.booking_date DESC, cd.created_at DESC
    `;

    // Compute financial summary
    let totalBilled = 0;
    let totalPaid = 0;
    let creditModeOutstanding = 0;
    let outstandingToPay = 0;

    const dockets = docketsRaw.map((d) => {
      totalBilled += d.grand_total || 0;
      totalPaid += d.total_paid || 0;
      if (d.payment_mode === 'Credit') {
        creditModeOutstanding += d.outstanding_amount || 0;
      } else if (d.payment_mode === 'To Pay') {
        outstandingToPay += d.outstanding_amount || 0;
      }
      return {
        ...d,
        expected_mode: d.expected_mode ? fromPaymentMethodEnum(d.expected_mode) : null,
      };
    });

    const outstandingCredit = Math.max(0, totalBilled - totalPaid);

    // Fetch payments log
    const paymentsRaw = await prisma.$queryRaw<any[]>`
      SELECT
        dp.id,
        dp.docket_id,
        cd.docket_no,
        dp.amount::float8 as amount,
        dp.method,
        dp.paid_at as "paid_at",
        dp.notes,
        dp.created_at as "created_at",
        u.full_name as "recorded_by_name"
      FROM "docket_payments" dp
      JOIN "cargo_dockets" cd ON cd.id = dp.docket_id
      LEFT JOIN "users" u ON u.id = dp.recorded_by
      WHERE NOT dp.voided AND (cd.customer_code = ${customer.code} OR LOWER(cd.consignor_name) = LOWER(${customer.name}))
      ORDER BY dp.paid_at DESC, dp.created_at DESC
    `;

    const payments = paymentsRaw.map((p) => ({
      ...p,
      method: fromPaymentMethodEnum(p.method),
    }));

    return NextResponse.json({
      ...customer,
      totalBilled,
      totalPaid,
      outstandingAmount: outstandingCredit,
      outstandingCredit,
      creditModeOutstanding,
      outstandingToPay,
      totalOutstanding: outstandingCredit,
      totalLRCount: dockets.length,
      dockets,
      payments,
    });
  } catch (error: any) {
    console.error('Failed to load customer:', error);
    return NextResponse.json({ error: 'Failed to load customer' }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();

    const [updated] = await prisma.$queryRaw<any[]>`
      UPDATE "customers"
      SET 
        name = COALESCE(${body.name?.trim() || null}, name),
        contact_person = ${body.contactPerson !== undefined ? body.contactPerson?.trim() || null : null},
        address = COALESCE(${body.address?.trim() || null}, address),
        city = COALESCE(${body.city?.trim() || null}, city),
        pin_code = COALESCE(${body.pinCode?.trim() || body.pin_code?.trim() || null}, pin_code),
        phone = COALESCE(${body.phone?.trim() || null}, phone),
        gstin = COALESCE(${body.gstin?.trim() || null}, gstin),
        email = COALESCE(${body.email?.trim() || null}, email),
        payment_terms_days = COALESCE(${body.paymentTermsDays ? Number(body.paymentTermsDays) : null}, payment_terms_days),
        credit_limit = COALESCE(${body.creditLimit !== undefined ? Number(body.creditLimit) : null}, credit_limit),
        notes = ${body.notes !== undefined ? body.notes?.trim() || null : null},
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, code, name, contact_person as "contactPerson", address, city, pin_code as "pinCode", phone, gstin, email, payment_terms_days as "paymentTermsDays", credit_limit::float8 as "creditLimit", notes;
    `;

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('Failed to update customer:', error);
    return NextResponse.json({ error: 'Failed to update customer' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    const user = session?.user as { id?: string; role?: string } | undefined;
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can delete customers.' }, { status: 403 });
    }

    const { id } = await params;
    await prisma.$executeRaw`DELETE FROM "customers" WHERE id = ${id}`;

    return NextResponse.json({ success: true, id });
  } catch (error: unknown) {
    console.error('Failed to delete customer:', error);
    return NextResponse.json({ error: 'Failed to delete customer' }, { status: 500 });
  }
}
