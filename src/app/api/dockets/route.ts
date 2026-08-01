import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const dockets = await prisma.cargoDocket.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        creator: { select: { fullName: true, email: true } },
        voider: { select: { fullName: true, email: true } },
      },
    });

    // Format Decimal numbers and relations for client compatibility
    const formatted = dockets.map((d) => ({
      ...d,
      created_by_name: d.creator?.fullName || d.creator?.email || 'Staff',
      created_by_email: d.creator?.email || '',
      voided_by_name: d.voider?.fullName || d.voider?.email || '',
      voided_by_email: d.voider?.email || '',
      invoice_value: d.invoiceValue ? Number(d.invoiceValue) : 0,
      actual_weight_kg: d.actualWeightKg ? Number(d.actualWeightKg) : 0,
      charged_weight_kg: d.chargedWeightKg ? Number(d.chargedWeightKg) : 0,
      freight_amount: Number(d.freightAmount),
      risk_charge: Number(d.riskCharge),
      handling_charge: Number(d.handlingCharge),
      docket_charge: Number(d.docketCharge),
      pickup_delivery_charge: Number(d.pickupDeliveryCharge),
      other_charge: Number(d.otherCharge),
      subtotal: Number(d.subtotal),
      gst_percentage: Number(d.gstPercentage),
      gst_amount: Number(d.gstAmount),
      grand_total: Number(d.grandTotal),
      booking_date: d.bookingDate.toISOString().split('T')[0],
      docket_no: d.docketNo,
      transport_mode: d.transportMode,
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
      invoice_no: d.invoiceNo || '',
      goods_description: d.goodsDescription || '',
      payment_mode: d.paymentMode,
      status: d.status,
      void_reason: d.voidReason || '',
      tracking_no: d.trackingNo || '',
      courier_partner: d.courierPartner || 'Self Network',
      created_at: d.createdAt.toISOString(),
      updated_at: d.updatedAt.toISOString(),
    }));

    return NextResponse.json(formatted);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user || !(session.user as any).id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const userId = (session.user as any).id;

    const paymentModeEnum = body.payment_mode || 'To Pay';
    const courierPartner = body.courier_partner || 'Self Network';
    const trackingNo = body.tracking_no || null;

    // Single atomic raw query: generates sequential docket number & inserts record in 1 statement
    const [inserted] = await prisma.$queryRaw<any[]>`
      INSERT INTO "cargo_dockets" (
        id,
        docket_no,
        created_by,
        booking_date,
        transport_mode,
        is_international,
        from_city,
        to_city,
        consignor_name,
        consignor_address,
        consignor_pin,
        consignor_phone,
        consignor_gstin,
        consignee_name,
        consignee_address,
        consignee_pin,
        consignee_phone,
        consignee_gstin,
        package_count,
        packing_method,
        invoice_no,
        invoice_value,
        actual_weight_kg,
        charged_weight_kg,
        dimensions_lhb,
        goods_description,
        freight_amount,
        risk_charge,
        handling_charge,
        docket_charge,
        pickup_delivery_charge,
        other_charge,
        subtotal,
        gst_percentage,
        gst_amount,
        grand_total,
        payment_mode,
        customer_code,
        tracking_no,
        courier_partner,
        created_at,
        updated_at
      ) VALUES (
        gen_random_uuid()::text,
        generate_docket_number(),
        ${userId},
        ${body.booking_date}::date,
        ${body.transport_mode}::"TransportMode",
        ${body.is_international ?? false},
        ${body.from_city},
        ${body.to_city},
        ${body.consignor_name},
        ${body.consignor_address || null},
        ${body.consignor_pin || null},
        ${body.consignor_phone || null},
        ${body.consignor_gstin || null},
        ${body.consignee_name},
        ${body.consignee_address || null},
        ${body.consignee_pin || null},
        ${body.consignee_phone || null},
        ${body.consignee_gstin || null},
        ${body.package_count || 1},
        ${body.packing_method || null},
        ${body.invoice_no || null},
        ${body.invoice_value || null},
        ${body.actual_weight_kg || null},
        ${body.charged_weight_kg || null},
        ${body.dimensions_lhb || null},
        ${body.goods_description || null},
        ${body.freight_amount || 0},
        ${body.risk_charge || 0},
        ${body.handling_charge || 0},
        ${body.docket_charge || 0},
        ${body.pickup_delivery_charge || 0},
        ${body.other_charge || 0},
        ${body.subtotal || 0},
        ${body.gst_percentage || 18},
        ${body.gst_amount || 0},
        ${body.grand_total || 0},
        ${paymentModeEnum}::"PaymentMode",
        ${body.customer_code || null},
        ${trackingNo},
        ${courierPartner},
        NOW(),
        NOW()
      )
      RETURNING *;
    `;

    return NextResponse.json(inserted, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
