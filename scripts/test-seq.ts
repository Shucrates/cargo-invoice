import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testSeq() {
  const res = await prisma.$queryRaw<any[]>`SELECT generate_docket_number() as num;`;
  console.log('Result from generate_docket_number():', res);
}

testSeq().catch(console.error).finally(() => prisma.$disconnect());
