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
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
