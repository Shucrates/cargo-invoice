import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash('password123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@rudracargo.com' },
    update: { hashedPassword },
    create: {
      email: 'admin@rudracargo.com',
      hashedPassword,
      role: 'admin',
      fullName: 'Rudra System Admin',
    },
  });

  const staff = await prisma.user.upsert({
    where: { email: 'test@rudracargo.com' },
    update: { hashedPassword },
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
