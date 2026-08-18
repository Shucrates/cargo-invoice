import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function runPhase4Verification() {
  console.log('===========================================================');
  console.log('🚀 RUNNING PHASE 4: CORE DOCKET/INVOICE VERIFICATION SUITE');
  console.log('===========================================================');

  try {
    const user = await prisma.user.findFirst({ where: { role: 'admin' } });
    if (!user) throw new Error('Admin user required for Phase 4 verification');

    const physicalNo = `BOOKLET-${Date.now().toString().slice(-4)}`;

    // 1. Test Physical Docket Number Insertion
    const inserted = await prisma.$queryRaw<any[]>`
      INSERT INTO "cargo_dockets" (
        id, docket_no, created_by, from_city, to_city, consignor_name, consignee_name,
        actual_weight_kg, charged_weight_kg, freight_amount, subtotal, gst_amount, grand_total,
        physical_docket_no, status, created_at, updated_at
      ) VALUES (
        gen_random_uuid()::text, generate_docket_number(), ${user.id}, 'Mumbai', 'Ahmedabad',
        'Shreeji Cottons', 'Surat Processing Pvt Ltd', 25.0, 25.0, 1200.0, 1200.0, 216.0, 1416.0,
        ${physicalNo}, 'issued'::"Status", NOW(), NOW()
      )
      RETURNING id, docket_no, physical_docket_no, status;
    `;

    const docket = inserted[0];
    console.log(`\n[Test 1] Physical Paper Docket Created Successfully:`);
    console.log(`  Docket ID: ${docket.id}`);
    console.log(`  System Docket No: ${docket.docket_no}`);
    console.log(`  Physical Paper LR No: ${docket.physical_docket_no}`);

    if (docket.physical_docket_no !== physicalNo) {
      throw new Error(`Physical Docket No mismatch! Expected ${physicalNo}, got ${docket.physical_docket_no}`);
    }
    console.log(`  ✅ PHYSICAL DOCKET NO VERIFIED: Stored and retrieved cleanly!`);

    // 2. Test Unambiguous Voiding & Audit Trail Registration
    const voidReason = 'Consignment cancelled prior to truck departure.';
    await prisma.cargoDocket.update({
      where: { id: docket.id },
      data: {
        status: 'voided',
        voidReason: voidReason,
        voidedBy: user.id,
        voidedAt: new Date(),
      },
    });

    const voidedDocket = await prisma.cargoDocket.findUnique({
      where: { id: docket.id },
      include: { voider: { select: { fullName: true, email: true } } },
    });

    console.log(`\n[Test 2] Void Audit Trail Registration:`);
    console.log(`  Status in DB: ${voidedDocket?.status}`);
    console.log(`  Void Reason: "${voidedDocket?.voidReason}"`);
    console.log(`  Voided By: ${voidedDocket?.voider?.email}`);

    if (voidedDocket?.status === 'voided' && voidedDocket?.voidReason === voidReason) {
      console.log(`  ✅ VOID AUDIT VERIFIED: Status set to voided with audit trail!`);
    } else {
      throw new Error(`❌ VOID AUDIT FAILED!`);
    }

    console.log(`\n===========================================================`);
    console.log('🎉 ALL PHASE 4 VERIFICATION TESTS PASSED SUCCESSFULLY!');
    console.log('===========================================================');
  } catch (error: any) {
    console.error('\n❌ PHASE 4 VERIFICATION FAILED:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runPhase4Verification();
