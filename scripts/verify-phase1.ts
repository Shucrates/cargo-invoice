import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function runPhase1Verification() {
  console.log('===========================================================');
  console.log('🚀 RUNNING PHASE 1: INFRASTRUCTURE & DATA VERIFICATION SUITE');
  console.log('===========================================================');

  try {
    // Step 0: Fetch or create a test staff user
    let user = await prisma.user.findFirst();
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: 'verifier@rudracargo.com',
          hashedPassword: '$2a$12$testpasswordhash',
          fullName: 'System Verifier',
          role: 'staff',
        },
      });
    }

    console.log(`\n[Test 1] Testing Atomic Docket Number Sequence Parallel Concurrency...`);
    const insertPromises = Array.from({ length: 5 }).map((_, i) =>
      prisma.$queryRaw<any[]>`
        INSERT INTO "cargo_dockets" (
          "id", "docket_no", "created_by", "from_city", "to_city", "consignor_name", "consignee_name",
          "actual_weight_kg", "charged_weight_kg", "freight_amount", "subtotal", "gst_amount", "grand_total", "created_at", "updated_at"
        ) VALUES (
          gen_random_uuid()::text, generate_docket_number(), ${user.id}, 'Mumbai', 'Delhi', ${`Consignor Test ${i}`}, ${`Consignee Test ${i}`},
          10.0, 10.0, 500.0, 500.0, 90.0, 590.0, NOW(), NOW()
        )
        RETURNING "id", "docket_no";
      `
    );

    const insertedResults = await Promise.all(insertPromises);
    const createdDockets = insertedResults.map((r) => r[0]);
    const docketNos = createdDockets.map((d) => d.docket_no);

    console.log('  Created 5 parallel dockets with docket numbers:', docketNos);
    const uniqueDocketNos = new Set(docketNos);
    if (uniqueDocketNos.size === 5) {
      console.log('  ✅ CONCURRENCY TEST PASSED: All 5 parallel sequence numbers are unique and atomic!');
    } else {
      throw new Error('❌ CONCURRENCY TEST FAILED: Sequence collision detected!');
    }

    const testDocketId = createdDockets[0].id;

    console.log(`\n[Test 2] Testing Database Immutability Trigger A (DELETE Ban)...`);
    try {
      await prisma.$executeRaw`DELETE FROM "cargo_dockets" WHERE "id" = ${testDocketId};`;
      throw new Error('❌ DELETE BAN FAILED: Database allowed DELETE query!');
    } catch (err: any) {
      if (err.message?.includes('PERMANENT RECORD BAN') || err.message?.includes('P0001')) {
        console.log('  ✅ DELETE BAN PASSED: PostgreSQL trigger blocked DELETE query as expected!');
      } else {
        throw err;
      }
    }

    console.log(`\n[Test 3] Testing Database Immutability Trigger B (Financial Tampering Ban)...`);
    try {
      await prisma.$executeRaw`UPDATE "cargo_dockets" SET "grand_total" = 99999.00 WHERE "id" = ${testDocketId};`;
      throw new Error('❌ FINANCIAL IMMUTABILITY FAILED: Database allowed grand_total tampering!');
    } catch (err: any) {
      if (err.message?.includes('IMMUTABLE RECORD') || err.message?.includes('P0001')) {
        console.log('  ✅ FINANCIAL IMMUTABILITY PASSED: PostgreSQL trigger blocked grand_total tampering!');
      } else {
        throw err;
      }
    }

    console.log(`\n[Test 4] Testing Authorized Tracking Number Attachment...`);
    await prisma.$executeRaw`
      UPDATE "cargo_dockets"
      SET "courier_partner" = 'FedEx',
          "tracking_no" = '1Z9999999999999999'
      WHERE "id" = ${testDocketId};
    `;
    const updatedDocket = await prisma.cargoDocket.findUnique({ where: { id: testDocketId } });
    if (updatedDocket?.trackingNo === '1Z9999999999999999' && updatedDocket?.courierPartner === 'FedEx') {
      console.log('  ✅ AUTHORIZED TRACKING UPDATE PASSED: Tracking details updated cleanly!');
    } else {
      throw new Error('❌ AUTHORIZED TRACKING UPDATE FAILED!');
    }

    console.log(`\n===========================================================`);
    console.log('🎉 ALL PHASE 1 VERIFICATION TESTS PASSED SUCCESSFULLY!');
    console.log('===========================================================');
  } catch (error: any) {
    console.error('\n❌ PHASE 1 VERIFICATION FAILED:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runPhase1Verification();
