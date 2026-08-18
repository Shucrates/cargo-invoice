import { NextResponse } from 'next/server';
import type { ExpenseEntry } from '@prisma/client';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

function serializeEntry(e: ExpenseEntry) {
  return {
    id: e.id,
    ledger_id: e.ledgerId,
    date: e.date.toISOString().split('T')[0],
    category: e.category,
    amount: Number(e.amount),
    payment_mode: e.paymentMode,
    ref_number: e.refNumber || '',
    vendor_name: e.vendorName || '',
    description: e.description || '',
    created_at: e.createdAt.toISOString(),
  };
}

async function loadLedgerWithEntries(id: string) {
  return prisma.expenseLedger.findUnique({
    where: { id },
    include: {
      creator: { select: { fullName: true, email: true } },
      entries: { orderBy: { date: 'asc' } },
    },
  });
}

function serializeLedger(l: NonNullable<Awaited<ReturnType<typeof loadLedgerWithEntries>>>) {
  return {
    id: l.id,
    ledger_no: l.ledgerNo,
    created_by: l.createdBy,
    created_by_name: l.creator?.fullName || l.creator?.email || 'Staff',
    period_start: l.periodStart.toISOString().split('T')[0],
    period_end: l.periodEnd.toISOString().split('T')[0],
    label: l.label || '',
    notes: l.notes || '',
    total_amount: Number(l.totalAmount),
    entries: l.entries.map(serializeEntry),
    created_at: l.createdAt.toISOString(),
    updated_at: l.updatedAt.toISOString(),
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    const user = session?.user as { id?: string } | undefined;
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const ledger = await loadLedgerWithEntries(id);
    if (!ledger) {
      return NextResponse.json({ error: 'Expense ledger not found.' }, { status: 404 });
    }

    return NextResponse.json(serializeLedger(ledger));
  } catch (error: unknown) {
    console.error('Failed to load expense ledger:', error);
    return NextResponse.json({ error: 'Failed to load expense ledger' }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    const user = session?.user as { id?: string } | undefined;
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const existing = await prisma.expenseLedger.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Expense ledger not found.' }, { status: 404 });
    }

    const body = await req.json();
    const data: { label?: string | null; notes?: string | null } = {};
    if (body.label !== undefined) data.label = body.label ? String(body.label).trim() : null;
    if (body.notes !== undefined) data.notes = body.notes ? String(body.notes).trim() : null;

    await prisma.expenseLedger.update({ where: { id }, data });

    const ledger = await loadLedgerWithEntries(id);
    return NextResponse.json(serializeLedger(ledger!));
  } catch (error: unknown) {
    console.error('Failed to update expense ledger:', error);
    return NextResponse.json({ error: 'Failed to update expense ledger' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    const user = session?.user as { id?: string } | undefined;
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const existing = await prisma.expenseLedger.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Expense ledger not found.' }, { status: 404 });
    }

    await prisma.expenseLedger.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Failed to delete expense ledger:', error);
    return NextResponse.json({ error: 'Failed to delete expense ledger' }, { status: 500 });
  }
}
