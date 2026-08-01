import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user || !(session.user as any).id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();

    if (!body.void_reason || typeof body.void_reason !== 'string' || !body.void_reason.trim()) {
      return NextResponse.json(
        { error: 'A valid void_reason is required to void a docket.' },
        { status: 400 }
      );
    }

    const userId = (session.user as any).id;

    // Update only status, void_reason, voided_at, voided_by (matching DB trigger rules)
    const updated = await prisma.cargoDocket.update({
      where: { id },
      data: {
        status: 'voided',
        voidReason: body.void_reason.trim(),
        voidedAt: new Date(),
        voidedBy: userId,
      },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
