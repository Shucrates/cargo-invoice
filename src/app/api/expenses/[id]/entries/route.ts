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

function parseDateOnly(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const d = new Date(value.includes('T') ? value : `${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    const user = session?.user as { id?: string } | undefined;
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const ledger = await prisma.expenseLedger.findUnique({ where: { id } });
    if (!ledger) {
      return NextResponse.json({ error: 'Expense ledger not found.' }, { status: 404 });
    }

    const body = await req.json();
    const date = parseDateOnly(body.date);
    const amount = Number(body.amount);
    const category = String(body.category || '').trim();
    const paymentMode = String(body.payment_mode || '').trim();

    if (!date || !category || !paymentMode || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'A valid date, category, payment mode, and amount are required.' }, { status: 400 });
    }
    if (date < ledger.periodStart || date > ledger.periodEnd) {
      return NextResponse.json({ error: 'Entry date falls outside the ledger period.' }, { status: 400 });
    }

    const [entry] = await prisma.$transaction([
      prisma.expenseEntry.create({
        data: {
          ledgerId: id,
          date,
          category,
          amount,
          paymentMode,
          refNumber: body.ref_number ? String(body.ref_number).trim() : null,
          vendorName: body.vendor_name ? String(body.vendor_name).trim() : null,
          description: body.description ? String(body.description).trim() : null,
        },
      }),
      prisma.expenseLedger.update({
        where: { id },
        data: { totalAmount: { increment: amount } },
      }),
    ]);

    return NextResponse.json(serializeEntry(entry), { status: 201 });
  } catch (error: unknown) {
    console.error('Failed to add expense entry:', error);
    return NextResponse.json({ error: 'Failed to add expense entry' }, { status: 500 });
  }
}
