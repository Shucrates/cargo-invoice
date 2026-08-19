import { NextResponse } from 'next/server';
import type { Prisma, CargoDocket } from '@prisma/client';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { computeDocketTotals, paiseToDecimalString } from '@/lib/money';
import { isPaymentMethodLabel, toPaymentMethodEnum, fromPaymentMethodEnum } from '@/lib/paymentMethod';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

type DocketWithActors = CargoDocket & {
  creator: { fullName: string | null; email: string } | null;
  voider: { fullName: string | null; email: string } | null;
};

/**
 * Maps a database row to the snake_case shape the UI consumes.
 *
 * Totals are read straight from the stored columns — they are computed and
 * frozen at write time, so this layer never recalculates them. A docket's
 * printed invoice and its dashboard figure are therefore always the same number.
 */
function serializeDocket(d: DocketWithActors, paidByDocket: Map<string, number>) {
  const decimal = (value: Prisma.Decimal | null) => (value === null ? 0 : Number(value));

  const grandTotal = decimal(d.grandTotal);
  const paidFromLedger = paidByDocket.get(d.id) ?? 0;
  // Legacy dockets marked "Paid" before the payment ledger existed have no
  // DocketPayment rows — treat them as fully settled rather than outstanding.
  const amountPaid =
    paidFromLedger === 0 && d.paymentMode === 'Paid' ? grandTotal : paidFromLedger;
  const amountDue = Math.max(grandTotal - amountPaid, 0);

  return {
    id: d.id,
    docket_no: d.docketNo,
    created_by: d.createdBy,
    created_by_name: d.creator?.fullName || d.creator?.email || 'Staff',
    created_by_email: d.creator?.email || '',
    voided_by_name: d.voider?.fullName || d.voider?.email || '',
    voided_by_email: d.voider?.email || '',

    status: d.status,
    void_reason: d.voidReason || '',

    booking_date: d.bookingDate.toISOString().split('T')[0],
    transport_mode: d.transportMode,
    is_international: d.isInternational,
    from_city: d.fromCity,
    to_city: d.toCity,

    consignor_name: d.consignorName,
    consignor_address: d.consignorAddress || '',
    consignor_pin: d.consignorPin || '',
    consignor_phone: d.consignorPhone || '',
    consignor_gstin: d.consignorGstin || '',

    consignee_name: d.consigneeName,
    consignee_address: d.consigneeAddress || '',
    consignee_pin: d.consigneePin || '',
    consignee_phone: d.consigneePhone || '',
    consignee_gstin: d.consigneeGstin || '',

    package_count: d.packageCount,
    packing_method: d.packingMethod || '',
    invoice_no: d.invoiceNo || '',
    invoice_value: decimal(d.invoiceValue),
    actual_weight_kg: decimal(d.actualWeightKg),
    charged_weight_kg: decimal(d.chargedWeightKg),
    dimensions_lhb: d.dimensionsLhb || '',
    goods_description: d.goodsDescription || '',
    eway_bill_no: d.ewayBillNo || '',

    freight_amount: decimal(d.freightAmount),
    risk_charge: decimal(d.riskCharge),
    handling_charge: decimal(d.handlingCharge),
    docket_charge: decimal(d.docketCharge),
    pickup_delivery_charge: decimal(d.pickupDeliveryCharge),
    other_charge: decimal(d.otherCharge),
    subtotal: decimal(d.subtotal),
    gst_percentage: decimal(d.gstPercentage),
    gst_amount: decimal(d.gstAmount),
    grand_total: decimal(d.grandTotal),

    payment_mode: d.paymentMode,
    expected_mode: d.expectedMode ? fromPaymentMethodEnum(d.expectedMode) : null,
    delivery_status: d.deliveryStatus,
    amount_paid: amountPaid,
    amount_due: amountDue,
    customer_code: d.customerCode || '',
    tracking_no: d.trackingNo || '',
    courier_partner: d.courierPartner || 'Self Network',
    physical_docket_no: d.physicalDocketNo || '',

    created_at: d.createdAt.toISOString(),
    updated_at: d.updatedAt.toISOString(),
  };
}

export async function GET(req: Request) {
  try {
    const session = await auth();
    const user = session?.user as { id?: string; role?: string } | undefined;

    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q')?.trim() || '';
    const paymentMode = searchParams.get('paymentMode')?.trim();
    const transportMode = searchParams.get('transportMode')?.trim();
    const statusParam = searchParams.get('status')?.trim();
    const customerCode = searchParams.get('customerCode')?.trim();

    const limit = Math.min(
      Math.max(Number(searchParams.get('limit')) || DEFAULT_LIMIT, 1),
      MAX_LIMIT
    );
    const offset = Math.max(Number(searchParams.get('offset')) || 0, 0);

    // All LRs are shared across staff and admins alike.
    const where: Prisma.CargoDocketWhereInput = {};

    if (q) {
      where.OR = [
        { docketNo: { contains: q, mode: 'insensitive' } },
        { physicalDocketNo: { contains: q, mode: 'insensitive' } },
        { consignorName: { contains: q, mode: 'insensitive' } },
        { consigneeName: { contains: q, mode: 'insensitive' } },
        { fromCity: { contains: q, mode: 'insensitive' } },
        { toCity: { contains: q, mode: 'insensitive' } },
        { trackingNo: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (paymentMode && ['Paid', 'To Pay', 'Credit'].includes(paymentMode)) {
      where.paymentMode = paymentMode as Prisma.CargoDocketWhereInput['paymentMode'];
    }

    if (transportMode && ['Road', 'Air', 'Train'].includes(transportMode)) {
      where.transportMode = transportMode as Prisma.CargoDocketWhereInput['transportMode'];
    }

    if (statusParam && ['issued', 'voided'].includes(statusParam)) {
      where.status = statusParam as Prisma.CargoDocketWhereInput['status'];
    }

    if (customerCode) {
      where.customerCode = customerCode;
    }

    const [dockets, total] = await Promise.all([
      prisma.cargoDocket.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          creator: { select: { fullName: true, email: true } },
          voider: { select: { fullName: true, email: true } },
        },
      }),
      prisma.cargoDocket.count({ where }),
    ]);

    const paidSums = dockets.length
      ? await prisma.docketPayment.groupBy({
          by: ['docketId'],
          where: { docketId: { in: dockets.map((d) => d.id) }, voided: false },
          _sum: { amount: true },
        })
      : [];
    const paidByDocket = new Map(paidSums.map((p) => [p.docketId, Number(p._sum.amount || 0)]));

    return NextResponse.json({
      dockets: dockets.map((d) => serializeDocket(d, paidByDocket)),
      total,
      limit,
      offset,
      hasMore: offset + dockets.length < total,
    });
  } catch (error: unknown) {
    console.error('Failed to list dockets:', error);
    return NextResponse.json({ error: 'Failed to load dockets' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    const user = session?.user as { id?: string } | undefined;

    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { id: true } });
    if (!dbUser) {
      return NextResponse.json({ error: 'User session is invalid or user no longer exists. Please re-login.' }, { status: 401 });
    }

    const body = await req.json();

    if (!body.consignor_name?.trim() || !body.consignee_name?.trim()) {
      return NextResponse.json(
        { error: 'Consignor and consignee names are required.' },
        { status: 400 }
      );
    }
    if (!body.from_city?.trim() || !body.to_city?.trim()) {
      return NextResponse.json(
        { error: 'Origin and destination cities are required.' },
        { status: 400 }
      );
    }

    // Totals are always recomputed here from the individual charges. Whatever
    // subtotal/gst/grand_total the client sent is ignored — a tampered or stale
    // client must never be able to set the amount on a tax invoice.
    const { subtotalPaise, gstPaise, grandTotalPaise } = computeDocketTotals(body, body.gst_percentage);

    const bookingDate = new Date(body.booking_date || Date.now());
    if (Number.isNaN(bookingDate.getTime())) {
      return NextResponse.json({ error: 'Invalid booking date.' }, { status: 400 });
    }

    const gstPercentage = Number(body.gst_percentage);
    const safeGstPercentage =
      Number.isFinite(gstPercentage) && gstPercentage >= 0 && gstPercentage <= 100
        ? gstPercentage
        : 18;

    const paymentMode = body.payment_mode || 'To Pay';
    const paymentMethod = body.payment_method;
    if (paymentMode === 'Paid' && !['Cash', 'UPI', 'Bank Transfer'].includes(paymentMethod)) {
      return NextResponse.json(
        { error: 'A payment method (Cash, UPI, or Bank Transfer) is required when marking an LR as Paid.' },
        { status: 400 }
      );
    }

    const expectedMode = body.expected_mode;
    if ((paymentMode === 'To Pay' || paymentMode === 'Credit') && !isPaymentMethodLabel(expectedMode)) {
      return NextResponse.json(
        { error: 'An expected payment mode is required for To Pay or Credit LRs.' },
        { status: 400 }
      );
    }

    const [inserted] = await prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<Array<{ id: string; docket_no: string }>>`
      INSERT INTO "cargo_dockets" (
        id, docket_no, created_by, booking_date, transport_mode, is_international,
        from_city, to_city, consignor_name, consignor_address, consignor_pin, consignor_phone, consignor_gstin,
        consignee_name, consignee_address, consignee_pin, consignee_phone, consignee_gstin,
        package_count, packing_method, invoice_no, invoice_value, actual_weight_kg, charged_weight_kg,
        dimensions_lhb, goods_description, eway_bill_no, freight_amount, risk_charge, handling_charge, docket_charge,
        pickup_delivery_charge, other_charge, subtotal, gst_percentage, gst_amount, grand_total,
        payment_mode, expected_mode, customer_code, courier_partner, tracking_no, physical_docket_no, created_at, updated_at
      ) VALUES (
        gen_random_uuid()::text, generate_docket_number(), ${user.id}, ${bookingDate}::date,
        ${body.transport_mode || 'Road'}::"TransportMode", ${Boolean(body.is_international)},
        ${body.from_city}, ${body.to_city}, ${body.consignor_name}, ${body.consignor_address || null},
        ${body.consignor_pin || null}, ${body.consignor_phone || null}, ${body.consignor_gstin || null},
        ${body.consignee_name}, ${body.consignee_address || null}, ${body.consignee_pin || null},
        ${body.consignee_phone || null}, ${body.consignee_gstin || null}, ${Number(body.package_count || 1)},
        ${body.packing_method || null}, ${body.invoice_no || null},
        ${body.invoice_value ? Number(body.invoice_value) : null},
        ${body.actual_weight_kg ? Number(body.actual_weight_kg) : null},
        ${body.charged_weight_kg ? Number(body.charged_weight_kg) : null},
        ${body.dimensions_lhb || null}, ${body.goods_description || null}, ${body.eway_bill_no || null},
        ${paiseToDecimalString(Math.round(Number(body.freight_amount || 0) * 100))}::decimal,
        ${paiseToDecimalString(Math.round(Number(body.risk_charge || 0) * 100))}::decimal,
        ${paiseToDecimalString(Math.round(Number(body.handling_charge || 0) * 100))}::decimal,
        ${paiseToDecimalString(Math.round(Number(body.docket_charge || 0) * 100))}::decimal,
        ${paiseToDecimalString(Math.round(Number(body.pickup_delivery_charge || 0) * 100))}::decimal,
        ${paiseToDecimalString(Math.round(Number(body.other_charge || 0) * 100))}::decimal,
        ${paiseToDecimalString(subtotalPaise)}::decimal,
        ${safeGstPercentage},
        ${paiseToDecimalString(gstPaise)}::decimal,
        ${paiseToDecimalString(grandTotalPaise)}::decimal,
        ${paymentMode}::"PaymentMode",
        ${isPaymentMethodLabel(expectedMode) ? expectedMode : null}::"PaymentMethod",
        ${body.customer_code || null},
        ${body.courier_partner || 'Self Network'}, ${body.tracking_no || null},
        ${body.physical_docket_no || null},
        NOW(), NOW()
      )
      RETURNING id, docket_no;
    `;

      if (paymentMode === 'Paid') {
        await tx.docketPayment.create({
          data: {
            docketId: row.id,
            amount: paiseToDecimalString(grandTotalPaise),
            method: toPaymentMethodEnum(paymentMethod),
            paidAt: bookingDate,
            recordedBy: user.id!,
          },
        });
      }

      await tx.docketAuditLog.create({
        data: {
          docketId: row.id,
          action: 'created',
          performedBy: user.id!,
        },
      });

      return [row];
    });

    // Return the authoritative totals so the client prints exactly what was stored.
    return NextResponse.json(
      {
        ...inserted,
        subtotal: subtotalPaise / 100,
        gst_amount: gstPaise / 100,
        grand_total: grandTotalPaise / 100,
        gst_percentage: safeGstPercentage,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error('Error creating docket:', error);
    const message = error instanceof Error ? error.message : 'Failed to create docket';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
