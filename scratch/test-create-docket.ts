import { PrismaClient } from '@prisma/client';
import { computeDocketTotals, paiseToDecimalString } from '../src/lib/money';
import { toPaymentMethodEnum } from '../src/lib/paymentMethod';

const prisma = new PrismaClient();

async function testCreateDocket() {
  try {
    const user = await prisma.user.findFirst();
    if (!user) {
      console.log('No user found!');
      return;
    }
    console.log('Testing with user ID:', user.id);

    const body: any = {
      booking_date: '2026-08-14',
      transport_mode: 'Road',
      from_city: 'Mumbai',
      to_city: 'Delhi',
      consignor_name: 'Acme',
      consignee_name: 'Vijay Sales',
      package_count: 1,
      invoice_value: 0,
      actual_weight_kg: 0,
      charged_weight_kg: 0,
      freight_amount: 2300,
      docket_charge: 150,
      gst_percentage: 18,
      payment_mode: 'Paid',
      payment_method: 'Cash',
    };

    const { subtotalPaise, gstPaise, grandTotalPaise } = computeDocketTotals(body, body.gst_percentage);
    const bookingDate = new Date(body.booking_date);
    const safeGstPercentage = 18;
    const paymentMode = 'Paid';
    const paymentMethod = 'Cash';

    const [inserted] = await prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<Array<{ id: string; docket_no: string }>>`
      INSERT INTO "cargo_dockets" (
        id, docket_no, created_by, booking_date, transport_mode, is_international,
        from_city, to_city, consignor_name, consignor_address, consignor_pin, consignor_phone, consignor_gstin,
        consignee_name, consignee_address, consignee_pin, consignee_phone, consignee_gstin,
        package_count, packing_method, invoice_no, invoice_value, actual_weight_kg, charged_weight_kg,
        dimensions_lhb, goods_description, freight_amount, risk_charge, handling_charge, docket_charge,
        pickup_delivery_charge, other_charge, subtotal, gst_percentage, gst_amount, grand_total,
        payment_mode, customer_code, courier_partner, tracking_no, physical_docket_no, created_at, updated_at
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
        ${body.dimensions_lhb || null}, ${body.goods_description || null},
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
        ${paymentMode}::"PaymentMode", ${body.customer_code || null},
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

    console.log('Successfully created test docket:', inserted);
  } catch (err) {
    console.error('Error in testCreateDocket:', err);
  } finally {
    await prisma.$disconnect();
  }
}

testCreateDocket();
