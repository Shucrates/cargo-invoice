import { NextResponse } from 'next/server';
import type { Prisma, ExpenseLedger } from '@prisma/client';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

type LedgerWithExtras = ExpenseLedger & {
  creator?: { fullName: string | null; email: string } | null;
  _count?: { entries: number };
};

function serializeLedger(l: LedgerWithExtras) {
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
    entry_count: l._count?.entries ?? 0,
    created_at: l.createdAt.toISOString(),
    updated_at: l.updatedAt.toISOString(),
  };
}

function parseDateOnly(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const d = new Date(value.includes('T') ? value : `${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(req: Request) {
  try {
    const session = await auth();
    const user = session?.user as { id?: string } | undefined;
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q')?.trim() || '';
    const from = parseDateOnly(searchParams.get('from'));
    const to = parseDateOnly(searchParams.get('to'));
    const limit = Math.min(Math.max(Number(searchParams.get('limit')) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const offset = Math.max(Number(searchParams.get('offset')) || 0, 0);

    const where: Prisma.ExpenseLedgerWhereInput = {};
    if (q) {
      where.OR = [
        { ledgerNo: { contains: q, mode: 'insensitive' } },
        { label: { contains: q, mode: 'insensitive' } },
      ];
    }
    // Overlap filter: a ledger matches if its period overlaps the requested window.
    if (from) where.periodEnd = { gte: from };
    if (to) where.periodStart = { lte: to };

    const [ledgers, total] = await Promise.all([
      prisma.expenseLedger.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          creator: { select: { fullName: true, email: true } },
          _count: { select: { entries: true } },
        },
      }),
      prisma.expenseLedger.count({ where }),
    ]);

    return NextResponse.json({
      ledgers: ledgers.map(serializeLedger),
      total,
      limit,
      offset,
      hasMore: offset + ledgers.length < total,
    });
  } catch (error: unknown) {
    console.error('Failed to list expense ledgers:', error);
    return NextResponse.json({ error: 'Failed to load expense ledgers' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    const user = session?.user as { id?: string } | undefined;
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();

    const periodStart = parseDateOnly(body.period_start);
    const periodEnd = parseDateOnly(body.period_end || body.period_start);
    if (!periodStart || !periodEnd) {
      return NextResponse.json({ error: 'A valid period start (and end) date is required.' }, { status: 400 });
    }
    if (periodEnd < periodStart) {
      return NextResponse.json({ error: 'Period end cannot be before period start.' }, { status: 400 });
    }

    const rawEntries = Array.isArray(body.entries) ? body.entries : [];
    const entries: Prisma.ExpenseEntryCreateWithoutLedgerInput[] = [];
    for (const raw of rawEntries) {
      const date = parseDateOnly(raw?.date);
      const amount = Number(raw?.amount);
      const category = String(raw?.category || '').trim();
      const paymentMode = String(raw?.payment_mode || '').trim();

      if (!date || !category || !paymentMode || !Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json({ error: 'Each entry needs a valid date, category, payment mode, and amount.' }, { status: 400 });
      }
      if (date < periodStart || date > periodEnd) {
        return NextResponse.json({ error: `Entry date ${raw.date} falls outside the ledger period.` }, { status: 400 });
      }

      entries.push({
        date,
        category,
        amount,
        paymentMode,
        refNumber: raw?.ref_number ? String(raw.ref_number).trim() : null,
        vendorName: raw?.vendor_name ? String(raw.vendor_name).trim() : null,
        description: raw?.description ? String(raw.description).trim() : null,
      });
    }

    const totalAmount = entries.reduce((sum, e) => sum + Number(e.amount), 0);

    let ledgerNo = (body.ledger_no || '').trim();
    if (!ledgerNo) {
      for (let attempt = 0; attempt < 5; attempt++) {
        let candidate: string;
        try {
          const [{ generate_expense_ledger_number: genNo }] = await prisma.$queryRaw<Array<{ generate_expense_ledger_number: string }>>`
            SELECT generate_expense_ledger_number();
          `;
          candidate = genNo;
        } catch {
          const count = await prisma.expenseLedger.count();
          const now = new Date();
          const year = now.getFullYear();
          const month = now.getMonth() + 1;
          const fyStart = month >= 4 ? year : year - 1;
          const fyLabel = `${String(fyStart % 100).padStart(2, '0')}-${String((fyStart + 1) % 100).padStart(2, '0')}`;
          candidate = `EXP/${fyLabel}/${String(count + 1 + attempt).padStart(5, '0')}`;
        }

        const existing = await prisma.expenseLedger.findUnique({ where: { ledgerNo: candidate } });
        if (!existing) {
          ledgerNo = candidate;
          break;
        }
      }
      if (!ledgerNo) {
        ledgerNo = `EXP/26-27/${Date.now().toString().slice(-5)}`;
      }
    } else {
      const existing = await prisma.expenseLedger.findUnique({ where: { ledgerNo } });
      if (existing) {
        return NextResponse.json({ error: `Ledger number ${ledgerNo} already exists.` }, { status: 409 });
      }
    }

    const ledger = await prisma.expenseLedger.create({
      data: {
        ledgerNo,
        createdBy: user.id,
        periodStart,
        periodEnd,
        label: body.label ? String(body.label).trim() : null,
        notes: body.notes ? String(body.notes).trim() : null,
        totalAmount,
        entries: entries.length > 0 ? { create: entries } : undefined,
      },
      include: {
        creator: { select: { fullName: true, email: true } },
        _count: { select: { entries: true } },
      },
    });

    return NextResponse.json(serializeLedger(ledger), { status: 201 });
  } catch (error: unknown) {
    console.error('Failed to create expense ledger:', error);
    return NextResponse.json({ error: 'Failed to create expense ledger' }, { status: 500 });
  }
}
