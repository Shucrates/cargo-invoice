import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  try {
    const session = await auth();
    const user = session?.user as { id?: string } | undefined;
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, entryId } = await params;
    const entry = await prisma.expenseEntry.findUnique({ where: { id: entryId } });
    if (!entry || entry.ledgerId !== id) {
      return NextResponse.json({ error: 'Expense entry not found.' }, { status: 404 });
    }

    await prisma.$transaction([
      prisma.expenseEntry.delete({ where: { id: entryId } }),
      prisma.expenseLedger.update({
        where: { id },
        data: { totalAmount: { decrement: entry.amount } },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Failed to delete expense entry:', error);
    return NextResponse.json({ error: 'Failed to delete expense entry' }, { status: 500 });
  }
}
