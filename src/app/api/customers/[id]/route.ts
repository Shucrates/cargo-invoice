import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();

    const [updated] = await prisma.$queryRaw<any[]>`
      UPDATE "customers"
      SET 
        name = COALESCE(${body.name?.trim() || null}, name),
        address = COALESCE(${body.address?.trim() || null}, address),
        city = COALESCE(${body.city?.trim() || null}, city),
        pin_code = COALESCE(${body.pinCode?.trim() || body.pin_code?.trim() || null}, pin_code),
        phone = COALESCE(${body.phone?.trim() || null}, phone),
        gstin = COALESCE(${body.gstin?.trim() || null}, gstin),
        email = COALESCE(${body.email?.trim() || null}, email),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, code, name, address, city, pin_code as "pinCode", phone, gstin, email;
    `;

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    await prisma.$executeRaw`DELETE FROM "customers" WHERE id = ${id}`;

    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
