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

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const authUser = session?.user as { id?: string; role?: string } | undefined;
  if (!authUser?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (authUser.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden: only admins can edit staff accounts.' }, { status: 403 });
  }

  const { id } = await params;
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  }

  try {
    const body = await req.json();
    const data: { email?: string; fullName?: string | null; role?: 'staff' | 'admin'; hashedPassword?: string } = {};

    if (body.email !== undefined) {
      const email = String(body.email).toLowerCase().trim();
      if (!email || !email.includes('@')) {
        return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 });
      }
      data.email = email;
    }

    if (body.full_name !== undefined || body.fullName !== undefined) {
      data.fullName = String(body.full_name ?? body.fullName ?? '').trim() || null;
    }

    if (body.role !== undefined) {
      const nextRole = body.role === 'admin' ? 'admin' : 'staff';
      if (target.role === 'admin' && nextRole === 'staff') {
        const adminCount = await prisma.user.count({ where: { role: 'admin' } });
        if (adminCount <= 1) {
          return NextResponse.json({ error: 'Cannot demote the last remaining admin account.' }, { status: 400 });
        }
      }
      data.role = nextRole;
    }

    if (body.password) {
      const password = String(body.password);
      if (password.length < 8) {
        return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
      }
      data.hashedPassword = await bcrypt.hash(password, 10);
    }

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, email: true, fullName: true, role: true, createdAt: true },
    });

    return NextResponse.json(serializeUser(updated));
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err.code === 'P2002') {
      return NextResponse.json({ error: 'A user with this email already exists.' }, { status: 400 });
    }
    console.error('Failed to update staff account:', error);
    return NextResponse.json({ error: 'Failed to update staff account.' }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden: only admins can delete staff accounts.' }, { status: 403 });
  }

  const { id } = await params;

  if (id === user.id) {
    return NextResponse.json({ error: 'You cannot delete your own account.' }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
  if (!target) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  }

  if (target.role === 'admin') {
    const adminCount = await prisma.user.count({ where: { role: 'admin' } });
    if (adminCount <= 1) {
      return NextResponse.json({ error: 'Cannot delete the last remaining admin account.' }, { status: 400 });
    }
  }

  try {
    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err.code === 'P2003') {
      return NextResponse.json(
        { error: 'This account created LRs or bills and cannot be deleted while those records exist.' },
        { status: 409 }
      );
    }
    console.error('Failed to delete staff account:', error);
    return NextResponse.json({ error: 'Failed to delete staff account.' }, { status: 500 });
  }
}
