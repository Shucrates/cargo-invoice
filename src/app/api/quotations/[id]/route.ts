import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { serializeQuotationSheet } from '../route';

async function loadSheet(id: string) {
  return prisma.quotationSheet.findUnique({
    where: { id },
    include: { creator: { select: { fullName: true, email: true } } },
  });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    const user = session?.user as { id?: string } | undefined;
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const sheet = await loadSheet(id);
    if (!sheet) {
      return NextResponse.json({ error: 'Quotation sheet not found.' }, { status: 404 });
    }

    return NextResponse.json(serializeQuotationSheet(sheet));
  } catch (error: unknown) {
    console.error('Failed to load quotation sheet:', error);
    return NextResponse.json({ error: 'Failed to load quotation sheet' }, { status: 500 });
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
    const existing = await loadSheet(id);
    if (!existing) {
      return NextResponse.json({ error: 'Quotation sheet not found.' }, { status: 404 });
    }

    const body = await req.json();
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return NextResponse.json({ error: 'Sheet name is required.' }, { status: 400 });
      data.name = name;
    }
    if (body.origin_city !== undefined) {
      const originCity = String(body.origin_city).trim();
      if (!originCity) return NextResponse.json({ error: 'Origin city is required.' }, { status: 400 });
      data.originCity = originCity;
    }
    if (body.min_qty_kg !== undefined) data.minQtyKg = Number(body.min_qty_kg) || 0;
    if (body.rates !== undefined) data.rates = Array.isArray(body.rates) ? body.rates : [];
    if (body.notes !== undefined) data.notes = Array.isArray(body.notes) ? body.notes : [];

    const sheet = await prisma.$transaction(async (tx) => {
      if (body.is_default !== undefined) {
        if (body.is_default) {
          const originCityForDefault = typeof data.originCity === 'string' ? data.originCity : existing.originCity;
          await tx.quotationSheet.updateMany({
            where: {
              sheetType: existing.sheetType,
              originCity: { equals: originCityForDefault, mode: 'insensitive' },
              isDefault: true,
              id: { not: id },
            },
            data: { isDefault: false },
          });
        }
        data.isDefault = Boolean(body.is_default);
      }
      return tx.quotationSheet.update({
        where: { id },
        data,
        include: { creator: { select: { fullName: true, email: true } } },
      });
    });

    return NextResponse.json(serializeQuotationSheet(sheet));
  } catch (error: unknown) {
    console.error('Failed to update quotation sheet:', error);
    return NextResponse.json({ error: 'Failed to update quotation sheet' }, { status: 500 });
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
    const existing = await loadSheet(id);
    if (!existing) {
      return NextResponse.json({ error: 'Quotation sheet not found.' }, { status: 404 });
    }

    await prisma.quotationSheet.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Failed to delete quotation sheet:', error);
    return NextResponse.json({ error: 'Failed to delete quotation sheet' }, { status: 500 });
  }
}
