import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const cols = await prisma.$queryRawUnsafe(`SELECT column_name FROM information_schema.columns WHERE table_name='cargo_dockets' ORDER BY column_name`);
console.log('cargo_dockets cols:', JSON.stringify(cols));
const enums = await prisma.$queryRawUnsafe(`SELECT typname FROM pg_type WHERE typtype='e' ORDER BY typname`);
console.log('enums:', JSON.stringify(enums));
const billCols = await prisma.$queryRawUnsafe(`SELECT column_name FROM information_schema.columns WHERE table_name='cargo_dockets' AND column_name IN ('subtotal','gst_amount')`);
console.log('backfill cols check:', JSON.stringify(billCols));
await prisma.$disconnect();
