import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rateLimit';
import { verifyCsrf } from '@/lib/csrf';

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
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Rate limit: 100 requests per minute per IP
  const rl = rateLimit(req, { limit: 100, windowMs: 60_000, namespace: 'users-get' });
  if (!rl.ok) {
    return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 });
  }

  const session = await auth();
  const authUser = session?.user as { role?: string } | undefined;
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Fix IDOR: staff must not be able to read other users' full activity history
  if (authUser.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden: only admins can view staff account details.' }, { status: 403 });
  }

  const { id } = await params;
  const [
    target,
    dockets,
    bills,
    payments,
    auditLogs,
    auditCount,
    docketsAgg,
    billsAgg,
    paymentsAgg,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        createdAt: true,
      },
    }),
    prisma.cargoDocket.findMany({
      where: { createdBy: id },
      orderBy: { createdAt: 'desc' },
      take: 30,
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
    }),
    prisma.bill.findMany({
      where: { createdBy: id },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        billNo: true,
        invoiceDate: true,
        customerName: true,
        grandTotal: true,
      },
    }),
    prisma.docketPayment.findMany({
      where: { recordedBy: id },
      orderBy: { createdAt: 'desc' },
      take: 30,
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
    }),
    prisma.docketAuditLog.findMany({
      where: { performedBy: id },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        action: true,
        createdAt: true,
        docketId: true,
        docket: {
          select: { docketNo: true },
        },
      },
    }),
    prisma.docketAuditLog.count({
      where: { performedBy: id },
    }),
    prisma.cargoDocket.aggregate({
      where: { createdBy: id },
      _count: { id: true },
      _sum: { grandTotal: true },
    }),
    prisma.bill.aggregate({
      where: { createdBy: id },
      _count: { id: true },
      _sum: { grandTotal: true },
    }),
    prisma.docketPayment.aggregate({
      where: { recordedBy: id },
      _sum: { amount: true },
    }),
  ]);

  if (!target) {
    return NextResponse.json({ error: 'Staff account not found' }, { status: 404 });
  }

  const lrsCount = docketsAgg._count.id || 0;
  const lrsTotal = Number(docketsAgg._sum.grandTotal || 0);
  const billsCount = billsAgg._count.id || 0;
  const billsTotal = Number(billsAgg._sum.grandTotal || 0);
  const revenueHandled = Number(paymentsAgg._sum.amount || 0);
  const activityLogsCount = auditCount;

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
      activity_logs_count: activityLogsCount,
    },
    dockets: dockets.map((d) => ({
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
    bills: bills.map((b) => ({
      id: b.id,
      invoice_number: b.billNo,
      invoice_date: b.invoiceDate.toISOString(),
      customer_name: b.customerName,
      grand_total: Number(b.grandTotal || 0),
      payment_status: 'Issued',
    })),
    payments: payments.map((p) => ({
      id: p.id,
      amount: Number(p.amount || 0),
      method: p.method,
      date: p.paidAt.toISOString(),
      notes: p.notes,
      docket_no: p.docket?.docketNo || '-',
    })),
    audit_logs: auditLogs.map((a) => ({
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
  const csrf = verifyCsrf(req);
  if (!csrf.ok) {
    return NextResponse.json({ error: csrf.error }, { status: 403 });
  }
  const rl = rateLimit(req, { limit: 30, windowMs: 60_000, namespace: 'users-patch' });
  if (!rl.ok) {
    return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 });
  }

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
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrf = verifyCsrf(req);
  if (!csrf.ok) {
    return NextResponse.json({ error: csrf.error }, { status: 403 });
  }
  const rl = rateLimit(req, { limit: 10, windowMs: 60_000, namespace: 'users-delete' });
  if (!rl.ok) {
    return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 });
  }

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
