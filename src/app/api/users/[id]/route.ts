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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const authUser = session?.user as { role?: string } | undefined;
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const target = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      createdAt: true,
      createdDockets: {
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          docketNo: true,
          bookingDate: true,
          consignorName: true,
          consigneeName: true,
          fromCity: true,
          toCity: true,
          transportMode: true,
          paymentMode: true,
          grandTotal: true,
          status: true,
        },
      },
      bills: {
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          billNo: true,
          invoiceDate: true,
          customerName: true,
          grandTotal: true,
        },
      },
      recordedPayments: {
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          amount: true,
          method: true,
          paidAt: true,
          notes: true,
          docket: {
            select: { id: true, docketNo: true },
          },
        },
      },
      auditLogEntries: {
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          action: true,
          createdAt: true,
          docketId: true,
          docket: {
            select: { docketNo: true, consignorName: true },
          },
        },
      },
    },
  });

  if (!target) {
    return NextResponse.json({ error: 'Staff account not found' }, { status: 404 });
  }

  const lrsCount = target.createdDockets.length;
  const lrsTotal = target.createdDockets.reduce((sum: number, d) => sum + Number(d.grandTotal || 0), 0);
  const billsCount = target.bills.length;
  const billsTotal = target.bills.reduce((sum: number, b) => sum + Number(b.grandTotal || 0), 0);
  const revenueHandled = target.recordedPayments.reduce((sum: number, p) => sum + Number(p.amount || 0), 0);

  return NextResponse.json({
    user: {
      id: target.id,
      email: target.email,
      full_name: target.fullName,
      role: target.role,
      created_at: target.createdAt.toISOString(),
    },
    stats: {
      lrs_count: lrsCount,
      lrs_total: lrsTotal,
      bills_count: billsCount,
      bills_total: billsTotal,
      revenue_handled: revenueHandled,
      activity_logs_count: target.auditLogEntries.length,
    },
    dockets: target.createdDockets.map((d) => ({
      id: d.id,
      docket_no: d.docketNo,
      booking_date: d.bookingDate.toISOString(),
      consignor_name: d.consignorName,
      consignee_name: d.consigneeName,
      from_city: d.fromCity,
      to_city: d.toCity,
      transport_mode: d.transportMode,
      payment_mode: d.paymentMode,
      grand_total: Number(d.grandTotal || 0),
      status: d.status,
    })),
    bills: target.bills.map((b) => ({
      id: b.id,
      invoice_number: b.billNo,
      invoice_date: b.invoiceDate.toISOString(),
      customer_name: b.customerName,
      grand_total: Number(b.grandTotal || 0),
      payment_status: 'Issued',
    })),
    payments: target.recordedPayments.map((p) => ({
      id: p.id,
      amount: Number(p.amount || 0),
      method: p.method,
      date: p.paidAt.toISOString(),
      notes: p.notes,
      docket_no: p.docket?.docketNo || '-',
    })),
    audit_logs: target.auditLogEntries.map((a) => ({
      id: a.id,
      action: a.action,
      summary: `Action: ${a.action} on LR ${a.docket?.docketNo || a.docketId}`,
      created_at: a.createdAt.toISOString(),
      docket_id: a.docketId,
    })),
  });
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
