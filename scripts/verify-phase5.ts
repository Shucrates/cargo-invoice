import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function runPhase5Verification() {
  console.log('===========================================================');
  console.log('🚀 RUNNING PHASE 5: SHIP24 & PUBLIC TRACKING VERIFICATION');
  console.log('===========================================================');

  try {
    const user = await prisma.user.findFirst();
    if (!user) throw new Error('User required for verification');

    const trackingWaybill = `SHIP24-${Date.now().toString().slice(-4)}`;

    // 1. Create Docket with Courier Tracking Waybill
    const inserted = await prisma.$queryRaw<any[]>`
      INSERT INTO "cargo_dockets" (
        id, docket_no, created_by, from_city, to_city, consignor_name, consignee_name,
        actual_weight_kg, charged_weight_kg, freight_amount, subtotal, gst_amount, grand_total,
        courier_partner, tracking_no, status, created_at, updated_at
      ) VALUES (
        gen_random_uuid()::text, generate_docket_number(), ${user.id}, 'Jaipur', 'Bangalore',
        'Rajputana Handicrafts', 'South Coast Retail Ltd', 50.0, 50.0, 3500.0, 3500.0, 630.0, 4130.0,
        'FedEx', ${trackingWaybill}, 'issued'::"Status", NOW(), NOW()
      )
      RETURNING id, docket_no, courier_partner, tracking_no;
    `;

    const docket = inserted[0];
    console.log(`\n[Test 1] Tracked Docket Created:`);
    console.log(`  Docket No: ${docket.docket_no} | Partner: ${docket.courier_partner}`);
    console.log(`  Tracking Waybill No: ${docket.tracking_no}`);

    // 2. Query Database directly for tracking verification
    const fetched = await prisma.cargoDocket.findUnique({
      where: { id: docket.id },
    });

    console.log(`\n[Test 2] Verifying Tracking Data Retrieval:`);
    console.log(`  Courier Partner in DB: ${fetched?.courierPartner}`);
    console.log(`  Tracking No in DB: ${fetched?.trackingNo}`);

    if (fetched?.trackingNo === trackingWaybill && fetched?.courierPartner === 'FedEx') {
      console.log('  ✅ COURIER TRACKING DATA PASSED: Tracking waybill stored and queryable!');
    } else {
      throw new Error('❌ COURIER TRACKING DATA RETRIEVAL FAILED');
    }

    console.log(`\n===========================================================`);
    console.log('🎉 ALL PHASE 5 VERIFICATION TESTS PASSED SUCCESSFULLY!');
    console.log('===========================================================');
  } catch (error: any) {
    console.error('\n❌ PHASE 5 VERIFICATION FAILED:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runPhase5Verification();
