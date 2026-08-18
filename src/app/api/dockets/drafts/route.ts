import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { labelFor, serializeDraft } from '@/lib/docketDraft';

export async function GET() {
  try {
    const session = await auth();
    const user = session?.user as { id?: string; role?: string } | undefined;

    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Auto-clean expired drafts older than 30 days
    await prisma.docketDraft.deleteMany({
      where: { createdAt: { lt: thirtyDaysAgo } },
    });

    const where: Prisma.DocketDraftWhereInput = {
      createdAt: { gte: thirtyDaysAgo },
      createdBy: user.id,
    };

    const drafts = await prisma.docketDraft.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json({ drafts: drafts.map(serializeDraft) });
  } catch (error: unknown) {
    console.error('Failed to list drafts:', error);
    return NextResponse.json({ error: 'Failed to load drafts' }, { status: 500 });
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
    const data = body && typeof body === 'object' ? body : {};

    const draft = await prisma.docketDraft.create({
      data: {
        createdBy: user.id,
        label: labelFor(data),
        data,
      },
    });

    return NextResponse.json(serializeDraft(draft), { status: 201 });
  } catch (error: unknown) {
    console.error('Failed to create draft:', error);
    return NextResponse.json({ error: 'Failed to save draft' }, { status: 500 });
  }
}
