import { prisma } from '../src/lib/prisma';

async function main() {
  console.log('Adding charge columns to cargo_dockets if not exists...');
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "cargo_dockets"
    ADD COLUMN IF NOT EXISTS "fuel_charge" DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS "clearing_charge" DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS "air_service_charge" DECIMAL(10, 2) NOT NULL DEFAULT 0.00;
  `);
  console.log('Successfully updated cargo_dockets table columns.');
}

main()
  .catch((e) => {
    console.error('Error updating DB table:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
