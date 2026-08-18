import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

function serializeUser(u: { id: string; email: string; fullName: string | null; role: string; createdAt: Date }) {
  return {
    id: u.id,
    email: u.email,
    full_name: u.fullName,
    role: u.role,
    created_at: u.createdAt.toISOString(),
  };
}

export async function GET() {
  const session = await auth();
  const user = session?.user as { role?: string } | undefined;
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden: only admins can view staff accounts.' }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    select: { id: true, email: true, fullName: true, role: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json(users.map(serializeUser));
}

export async function POST(req: Request) {
  const session = await auth();
  const user = session?.user as { role?: string } | undefined;
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden: only admins can create staff accounts.' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const email = String(body.email || '').toLowerCase().trim();
    const password = String(body.password || '');
    const fullName = String(body.full_name || body.fullName || '').trim() || null;
    const role = body.role === 'admin' ? 'admin' : 'staff';

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const created = await prisma.user.create({
      data: { email, hashedPassword, fullName, role },
      select: { id: true, email: true, fullName: true, role: true, createdAt: true },
    });

    return NextResponse.json(serializeUser(created), { status: 201 });
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err.code === 'P2002') {
      return NextResponse.json({ error: 'A user with this email already exists.' }, { status: 400 });
    }
    console.error('Failed to create staff account:', error);
    return NextResponse.json({ error: 'Failed to create staff account.' }, { status: 500 });
  }
}
