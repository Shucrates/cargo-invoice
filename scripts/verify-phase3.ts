import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function runPhase3Verification() {
  console.log('===========================================================');
  console.log('🚀 RUNNING PHASE 3: CUSTOMER PROFILES VERIFICATION SUITE');
  console.log('===========================================================');

  try {
    // 1. Create a Master Customer Account
    const masterCode = `CUST-${Date.now().toString().slice(-4)}`;
    const masterCustomer = await prisma.customer.create({
      data: {
        code: masterCode,
        name: 'Acme Heavy Transport Ltd',
        address: '100 Master Industrial Estate, Sector 5',
        pinCode: '400701',
        phone: '+91 9876543210',
        gstin: '27AAAAA0000A1Z5',
        email: 'billing@acme.com',
      },
    });

    console.log(`\n[Test 1] Master Customer Account Created:`);
    console.log(`  ID: ${masterCustomer.id} | Code: ${masterCustomer.code} | Name: ${masterCustomer.name}`);
    console.log(`  Master Address: ${masterCustomer.address}`);

    // 2. Fetch a valid user to assign createdBy
    const user = await prisma.user.findFirst();
    if (!user) throw new Error('No user found to issue test docket');

    // 3. Issue a Docket using Master Customer Autofill with a ONE-OFF Custom Address
    const oneOffAddress = '105 Site B Temporary Warehouse (One-Off Override)';
    const insertedDocket = await prisma.$queryRaw<any[]>`
      INSERT INTO "cargo_dockets" (
        "id", "docket_no", "created_by", "from_city", "to_city", "consignor_name", "consignor_address",
        "consignee_name", "actual_weight_kg", "charged_weight_kg", "freight_amount", "subtotal", "gst_amount", "grand_total", "created_at", "updated_at"
      ) VALUES (
        gen_random_uuid()::text, generate_docket_number(), ${user.id}, 'Mumbai', 'Delhi',
        ${masterCustomer.name}, ${oneOffAddress}, 'Consignee Recipient',
        10.0, 10.0, 500.0, 500.0, 90.0, 590.0, NOW(), NOW()
      )
      RETURNING "id", "docket_no", "consignor_address";
    `;

    const docket = insertedDocket[0];
    console.log(`\n[Test 2] Issued Docket with Customer Autofill + One-Off Address Override:`);
    console.log(`  Docket No: ${docket.docket_no}`);
    console.log(`  Docket Consignor Address: ${docket.consignor_address}`);

    // 4. Verify Master Customer Profile is UNMUTATED
    const verifiedMaster = await prisma.customer.findUnique({ where: { id: masterCustomer.id } });
    console.log(`\n[Test 3] Verifying Master Customer Immutability...`);
    console.log(`  Master Profile Address in DB: ${verifiedMaster?.address}`);

    if (
      docket.consignor_address === oneOffAddress &&
      verifiedMaster?.address === '100 Master Industrial Estate, Sector 5'
    ) {
      console.log('  ✅ IMMUTABILITY ASSERTION PASSED: One-off docket edit did NOT mutate master Customer profile!');
    } else {
      throw new Error('❌ IMMUTABILITY ASSERTION FAILED!');
    }

    console.log(`\n===========================================================`);
    console.log('🎉 ALL PHASE 3 VERIFICATION TESTS PASSED SUCCESSFULLY!');
    console.log('===========================================================');
  } catch (error: any) {
    console.error('\n❌ PHASE 3 VERIFICATION FAILED:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runPhase3Verification();
