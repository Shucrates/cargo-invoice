import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();

    if (!body.tracking_no || typeof body.tracking_no !== 'string' || !body.tracking_no.trim()) {
      return NextResponse.json(
        { error: 'A valid tracking / waybill number is required.' },
        { status: 400 }
      );
    }

    const courierPartner = body.courier_partner || 'Self Network';
    const trackingNo = body.tracking_no.trim();

    // Use raw SQL update to bypass Prisma Client in-memory runtime schema validation
    await prisma.$executeRaw`
      UPDATE "cargo_dockets"
      SET "courier_partner" = ${courierPartner},
          "tracking_no" = ${trackingNo},
          "updated_at" = NOW()
      WHERE "id" = ${id};
    `;

    return NextResponse.json({
      id,
      courier_partner: courierPartner,
      tracking_no: trackingNo,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
