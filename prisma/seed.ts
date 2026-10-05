import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Never ship a known password. The seed only creates these accounts if they
  // are missing; it does not reset passwords on existing ones.
  const seedPassword = process.env.SEED_USER_PASSWORD;
  if (!seedPassword || seedPassword.length < 12) {
    throw new Error('Set SEED_USER_PASSWORD (at least 12 characters) before running the seed.');
  }
  const hashedPassword = await bcrypt.hash(seedPassword, 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@rudracargo.com' },
    update: {},
    create: {
      email: 'admin@rudracargo.com',
      hashedPassword,
      role: 'admin',
      fullName: 'Rudra System Admin',
    },
  });

  const staff = await prisma.user.upsert({
    where: { email: 'test@rudracargo.com' },
    update: {},
    create: {
      email: 'test@rudracargo.com',
      hashedPassword,
      role: 'staff',
      fullName: 'Rudra Staff Member',
    },
  });

  console.log('Seed completed successfully:');
  console.log(' - Admin:', admin.email);
  console.log(' - Staff:', staff.email);

  console.log('Seeding real Indian corporate customers...');
  const { REAL_INDIAN_CUSTOMERS } = await import('./seedCustomers');
  for (const c of REAL_INDIAN_CUSTOMERS) {
    await prisma.customer.upsert({
      where: { code: c.code },
      update: c,
      create: c,
    });
  }
  console.log(` - Customers: ${REAL_INDIAN_CUSTOMERS.length} authentic Indian brands configured.`);
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
