import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { labelFor, serializeDraft } from '@/lib/billDraft';

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const user = session?.user as { id?: string; role?: string } | undefined;

    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const existing = await prisma.billDraft.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json({ error: 'Bill draft not found.' }, { status: 404 });
    }

    if (existing.createdBy !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const data = body && typeof body === 'object' ? body : {};

    const updated = await prisma.billDraft.update({
      where: { id },
      data: { label: labelFor(data), data },
    });

    return NextResponse.json(serializeDraft(updated));
  } catch (error: unknown) {
    console.error('Failed to update bill draft:', error);
    return NextResponse.json({ error: 'Failed to save bill draft' }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const user = session?.user as { id?: string; role?: string } | undefined;

    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const existing = await prisma.billDraft.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json({ error: 'Bill draft not found.' }, { status: 404 });
    }

    if (existing.createdBy !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await prisma.billDraft.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Failed to delete bill draft:', error);
    return NextResponse.json({ error: 'Failed to delete bill draft' }, { status: 500 });
  }
}
