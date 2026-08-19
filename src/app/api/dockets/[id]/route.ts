import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { computeDocketTotals, paiseToDecimalString } from '@/lib/money';
import { toPaymentMethodEnum } from '@/lib/paymentMethod';

type Snapshot = Record<string, string | number | boolean | null>;

/**
 * Edits a docket's shipment/party/charge details, correcting a staff mistake
 * after issue. Dockets are financial records locked by a DB trigger
 * (trg_prevent_docket_unauthorized_update in prisma/migrations/20260801120000_init)
 * so they can't be quietly altered — only an admin, via this endpoint, may
 * correct them, with the trigger disabled for the duration of the update
 * transaction (same pattern as the historical backfill migration) and every
 * change recorded to docket_audit_logs.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const user = session?.user as { id?: string; role?: string } | undefined;
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden: only admins can edit an issued LR.' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const existing = await prisma.cargoDocket.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'LR not found.' }, { status: 404 });
    }
    if (existing.status === 'voided') {
      return NextResponse.json({ error: 'Voided LRs cannot be edited.' }, { status: 400 });
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

    // Same recompute-from-charges rule as creation — a client-sent total is
    // never trusted, corrected or not.
    const { subtotalPaise, gstPaise, grandTotalPaise } = computeDocketTotals(body, body.gst_percentage);

    const bookingDate = new Date(body.booking_date || existing.bookingDate);
    if (Number.isNaN(bookingDate.getTime())) {
      return NextResponse.json({ error: 'Invalid booking date.' }, { status: 400 });
    }

    const gstPercentage = Number(body.gst_percentage);
    const safeGstPercentage =
      Number.isFinite(gstPercentage) && gstPercentage >= 0 && gstPercentage <= 100
        ? gstPercentage
        : 18;

    const paymentMode = body.payment_mode || existing.paymentMode;
    const paymentMethod = body.payment_method;
    const switchingToPaid = paymentMode === 'Paid' && existing.paymentMode !== 'Paid';
    if (switchingToPaid && !['Cash', 'UPI', 'Bank Transfer'].includes(paymentMethod)) {
      return NextResponse.json(
        { error: 'A payment method (Cash, UPI, or Bank Transfer) is required when marking an LR as Paid.' },
        { status: 400 }
      );
    }

    const dec = (v: Prisma.Decimal | null) => (v === null ? 0 : Number(v));

    const before: Snapshot = {
      booking_date: existing.bookingDate.toISOString().split('T')[0],
      transport_mode: existing.transportMode,
      is_international: existing.isInternational,
      from_city: existing.fromCity,
      to_city: existing.toCity,
      consignor_name: existing.consignorName,
      consignor_address: existing.consignorAddress,
      consignor_pin: existing.consignorPin,
      consignor_phone: existing.consignorPhone,
      consignor_gstin: existing.consignorGstin,
      consignee_name: existing.consigneeName,
      consignee_address: existing.consigneeAddress,
      consignee_pin: existing.consigneePin,
      consignee_phone: existing.consigneePhone,
      consignee_gstin: existing.consigneeGstin,
      package_count: existing.packageCount,
      invoice_no: existing.invoiceNo,
      invoice_value: dec(existing.invoiceValue),
      actual_weight_kg: dec(existing.actualWeightKg),
      charged_weight_kg: dec(existing.chargedWeightKg),
      goods_description: existing.goodsDescription,
      eway_bill_no: existing.ewayBillNo,
      freight_amount: dec(existing.freightAmount),
      risk_charge: dec(existing.riskCharge),
      handling_charge: dec(existing.handlingCharge),
      docket_charge: dec(existing.docketCharge),
      pickup_delivery_charge: dec(existing.pickupDeliveryCharge),
      other_charge: dec(existing.otherCharge),
      gst_percentage: dec(existing.gstPercentage),
      payment_mode: existing.paymentMode,
      customer_code: existing.customerCode,
      courier_partner: existing.courierPartner,
      tracking_no: existing.trackingNo,
      physical_docket_no: existing.physicalDocketNo,
    };

    const after: Snapshot = {
      booking_date: bookingDate.toISOString().split('T')[0],
      transport_mode: body.transport_mode || existing.transportMode,
      is_international: Boolean(body.is_international),
      from_city: body.from_city,
      to_city: body.to_city,
      consignor_name: body.consignor_name,
      consignor_address: body.consignor_address || null,
      consignor_pin: body.consignor_pin || null,
      consignor_phone: body.consignor_phone || null,
      consignor_gstin: body.consignor_gstin || null,
      consignee_name: body.consignee_name,
      consignee_address: body.consignee_address || null,
      consignee_pin: body.consignee_pin || null,
      consignee_phone: body.consignee_phone || null,
      consignee_gstin: body.consignee_gstin || null,
      package_count: Number(body.package_count || 1),
      invoice_no: body.invoice_no || null,
      invoice_value: body.invoice_value ? Number(body.invoice_value) : null,
      actual_weight_kg: body.actual_weight_kg ? Number(body.actual_weight_kg) : null,
      charged_weight_kg: body.charged_weight_kg ? Number(body.charged_weight_kg) : null,
      goods_description: body.goods_description || null,
      eway_bill_no: body.eway_bill_no || null,
      freight_amount: Number(body.freight_amount || 0),
      risk_charge: Number(body.risk_charge || 0),
      handling_charge: Number(body.handling_charge || 0),
      docket_charge: Number(body.docket_charge || 0),
      pickup_delivery_charge: Number(body.pickup_delivery_charge || 0),
      other_charge: Number(body.other_charge || 0),
      gst_percentage: safeGstPercentage,
      payment_mode: paymentMode,
      customer_code: body.customer_code || null,
      courier_partner: body.courier_partner || 'Self Network',
      tracking_no: body.tracking_no || null,
      physical_docket_no: body.physical_docket_no || null,
    };

    const changes = Object.keys(after)
      .filter((key) => String(before[key] ?? '') !== String(after[key] ?? ''))
      .map((key) => ({ field: key, from: before[key], to: after[key] }));

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'ALTER TABLE "cargo_dockets" DISABLE TRIGGER "trg_prevent_docket_unauthorized_update"'
      );

      await tx.$executeRaw`
        UPDATE "cargo_dockets" SET
          booking_date = ${bookingDate}::date,
          transport_mode = ${(body.transport_mode || existing.transportMode)}::"TransportMode",
          is_international = ${Boolean(body.is_international)},
          from_city = ${body.from_city},
          to_city = ${body.to_city},
          consignor_name = ${body.consignor_name},
          consignor_address = ${body.consignor_address || null},
          consignor_pin = ${body.consignor_pin || null},
          consignor_phone = ${body.consignor_phone || null},
          consignor_gstin = ${body.consignor_gstin || null},
          consignee_name = ${body.consignee_name},
          consignee_address = ${body.consignee_address || null},
          consignee_pin = ${body.consignee_pin || null},
          consignee_phone = ${body.consignee_phone || null},
          consignee_gstin = ${body.consignee_gstin || null},
          package_count = ${Number(body.package_count || 1)},
          packing_method = ${body.packing_method || null},
          invoice_no = ${body.invoice_no || null},
          invoice_value = ${body.invoice_value ? Number(body.invoice_value) : null},
          actual_weight_kg = ${body.actual_weight_kg ? Number(body.actual_weight_kg) : null},
          charged_weight_kg = ${body.charged_weight_kg ? Number(body.charged_weight_kg) : null},
          dimensions_lhb = ${body.dimensions_lhb || null},
          goods_description = ${body.goods_description || null},
          eway_bill_no = ${body.eway_bill_no || null},
          freight_amount = ${paiseToDecimalString(Math.round(Number(body.freight_amount || 0) * 100))}::decimal,
          risk_charge = ${paiseToDecimalString(Math.round(Number(body.risk_charge || 0) * 100))}::decimal,
          handling_charge = ${paiseToDecimalString(Math.round(Number(body.handling_charge || 0) * 100))}::decimal,
          docket_charge = ${paiseToDecimalString(Math.round(Number(body.docket_charge || 0) * 100))}::decimal,
          pickup_delivery_charge = ${paiseToDecimalString(Math.round(Number(body.pickup_delivery_charge || 0) * 100))}::decimal,
          other_charge = ${paiseToDecimalString(Math.round(Number(body.other_charge || 0) * 100))}::decimal,
          subtotal = ${paiseToDecimalString(subtotalPaise)}::decimal,
          gst_percentage = ${safeGstPercentage},
          gst_amount = ${paiseToDecimalString(gstPaise)}::decimal,
          grand_total = ${paiseToDecimalString(grandTotalPaise)}::decimal,
          payment_mode = ${paymentMode}::"PaymentMode",
          customer_code = ${body.customer_code || null},
          courier_partner = ${body.courier_partner || 'Self Network'},
          tracking_no = ${body.tracking_no || null},
          physical_docket_no = ${body.physical_docket_no || null},
          updated_at = NOW()
        WHERE id = ${id}
      `;

      await tx.$executeRawUnsafe(
        'ALTER TABLE "cargo_dockets" ENABLE TRIGGER "trg_prevent_docket_unauthorized_update"'
      );

      // Switching a To-Pay/Credit LR to Paid with no ledger history yet mirrors
      // creation's behavior. If a ledger already exists (partial payments via
      // Record Payment), leave it alone — admin edits don't second-guess it.
      if (switchingToPaid) {
        const paidSum = await tx.docketPayment.aggregate({
          where: { docketId: id },
          _sum: { amount: true },
        });
        if (Number(paidSum._sum.amount || 0) === 0) {
          await tx.docketPayment.create({
            data: {
              docketId: id,
              amount: paiseToDecimalString(grandTotalPaise),
              method: toPaymentMethodEnum(paymentMethod),
              paidAt: new Date(),
              recordedBy: user.id!,
            },
          });
        }
      }

      await tx.docketAuditLog.create({
        data: {
          docketId: id,
          action: 'edited',
          changes: changes.length ? changes : undefined,
          performedBy: user.id!,
        },
      });
    });

    return NextResponse.json({
      id,
      docket_no: existing.docketNo,
      subtotal: subtotalPaise / 100,
      gst_amount: gstPaise / 100,
      grand_total: grandTotalPaise / 100,
      gst_percentage: safeGstPercentage,
    });
  } catch (error: unknown) {
    console.error('Failed to edit docket:', error);
    return NextResponse.json({ error: 'Failed to edit LR' }, { status: 500 });
  }
}
