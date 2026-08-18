import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function runPhase6Verification() {
  console.log('===========================================================');
  console.log('🚀 RUNNING PHASE 6: SEARCH & MULTI-PARAM FILTER SUITE');
  console.log('===========================================================');

  try {
    const user = await prisma.user.findFirst();
    if (!user) throw new Error('User required for verification');

    const uniquePartyName = `UniqueParty-${Date.now().toString().slice(-4)}`;

    // 1. Create a docket with unique party name
    await prisma.$queryRaw<any[]>`
      INSERT INTO "cargo_dockets" (
        id, docket_no, created_by, from_city, to_city, consignor_name, consignee_name,
        actual_weight_kg, charged_weight_kg, freight_amount, subtotal, gst_amount, grand_total,
        payment_mode, status, created_at, updated_at
      ) VALUES (
        gen_random_uuid()::text, generate_docket_number(), ${user.id}, 'Kolkata', 'Patna',
        ${uniquePartyName}, 'East Bengal Distributors', 15.0, 15.0, 800.0, 800.0, 144.0, 944.0,
        'Paid'::"PaymentMode", 'issued'::"Status", NOW(), NOW()
      );
    `;

    // 2. Perform Multi-Parameter Database Search
    const searchResults = await prisma.cargoDocket.findMany({
      where: {
        OR: [
          { consignorName: { contains: uniquePartyName, mode: 'insensitive' } },
          { consigneeName: { contains: uniquePartyName, mode: 'insensitive' } },
        ],
        paymentMode: 'Paid',
      },
    });

    console.log(`\n[Test 1] Multi-Parameter Search Test:`);
    console.log(`  Search Query: "${uniquePartyName}" | Filter: PaymentMode = "Paid"`);
    console.log(`  Matching Records Found: ${searchResults.length}`);

    if (searchResults.length === 1 && searchResults[0].consignorName === uniquePartyName) {
      console.log(`  ✅ MULTI-PARAM SEARCH PASSED: Target record correctly returned!`);
    } else {
      throw new Error(`❌ MULTI-PARAM SEARCH FAILED!`);
    }

    console.log(`\n===========================================================`);
    console.log('🎉 ALL PHASE 6 VERIFICATION TESTS PASSED SUCCESSFULLY!');
    console.log('===========================================================');
  } catch (error: any) {
    console.error('\n❌ PHASE 6 VERIFICATION FAILED:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runPhase6Verification();
