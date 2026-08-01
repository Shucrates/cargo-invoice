import { prisma } from '../src/lib/prisma';
import bcrypt from 'bcryptjs';

async function createUser() {
  const args = process.argv.slice(2);
  const email = args[0];
  const password = args[1];
  const role = (args[2] as 'staff' | 'admin') || 'staff';
  const fullName = args[3] || email;

  if (!email || !password) {
    console.log('Usage: npx tsx scripts/create-user.ts <email> <password> [role] [fullName]');
    process.exit(1);
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email: email.toLowerCase().trim() },
    update: {
      hashedPassword,
      role,
      fullName,
    },
    create: {
      email: email.toLowerCase().trim(),
      hashedPassword,
      role,
      fullName,
    },
  });

  console.log(`✅ User successfully created/updated:`);
  console.log(`   Email: ${user.email}`);
  console.log(`   Role:  ${user.role}`);
}

createUser()
  .catch((e) => {
    console.error('❌ Error creating user:', e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
