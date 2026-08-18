import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const rows = await prisma.$queryRawUnsafe('SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY started_at');
console.log(JSON.stringify(rows, null, 2));
const tables = await prisma.$queryRawUnsafe(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`);
console.log(JSON.stringify(tables, null, 2));
await prisma.$disconnect();
