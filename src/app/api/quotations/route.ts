import { NextResponse } from 'next/server';
import type { Prisma, QuotationSheet } from '@prisma/client';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

type SheetWithCreator = QuotationSheet & { creator?: { fullName: string | null; email: string } | null };

export function serializeQuotationSheet(s: SheetWithCreator) {
  return {
    id: s.id,
    created_by: s.createdBy,
    created_by_name: s.creator?.fullName || s.creator?.email || 'Staff',
    name: s.name,
    sheet_type: s.sheetType,
    origin_city: s.originCity,
    is_default: s.isDefault,
    min_qty_kg: Number(s.minQtyKg),
    rates: (s.rates as any) || [],
    notes: (s.notes as any) || [],
    created_at: s.createdAt.toISOString(),
    updated_at: s.updatedAt.toISOString(),
  };
}

export async function GET(req: Request) {
  try {
    const session = await auth();
    const user = session?.user as { id?: string } | undefined;
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const sheetType = searchParams.get('sheet_type')?.trim();
    const originCity = searchParams.get('origin_city')?.trim();

    const where: Prisma.QuotationSheetWhereInput = {};
    if (sheetType) where.sheetType = sheetType;
    if (originCity) where.originCity = { equals: originCity, mode: 'insensitive' };

    const sheets = await prisma.quotationSheet.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: { creator: { select: { fullName: true, email: true } } },
    });

    return NextResponse.json({ sheets: sheets.map(serializeQuotationSheet) });
  } catch (error: unknown) {
    console.error('Failed to list quotation sheets:', error);
    return NextResponse.json({ error: 'Failed to load quotation sheets' }, { status: 500 });
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

    const name = (body.name || '').trim();
    const sheetType = (body.sheet_type || '').trim();
    if (!name) {
      return NextResponse.json({ error: 'Sheet name is required.' }, { status: 400 });
    }
    if (sheetType !== 'ROAD_RAIL' && sheetType !== 'AIR') {
      return NextResponse.json({ error: 'sheet_type must be ROAD_RAIL or AIR.' }, { status: 400 });
    }

    const rates = Array.isArray(body.rates) ? body.rates : [];
    const notes = Array.isArray(body.notes) ? body.notes : [];
    const minQtyKg = Number(body.min_qty_kg) || 0;
    const makeDefault = Boolean(body.is_default);
    const originCity = (body.origin_city || 'Mumbai').trim() || 'Mumbai';

    const sheet = await prisma.$transaction(async (tx) => {
      if (makeDefault) {
        await tx.quotationSheet.updateMany({
          where: { sheetType, originCity: { equals: originCity, mode: 'insensitive' }, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.quotationSheet.create({
        data: {
          createdBy: user.id!,
          name,
          sheetType,
          originCity,
          isDefault: makeDefault,
          minQtyKg,
          rates,
          notes,
        },
        include: { creator: { select: { fullName: true, email: true } } },
      });
    });

    return NextResponse.json(serializeQuotationSheet(sheet), { status: 201 });
  } catch (error: unknown) {
    console.error('Failed to create quotation sheet:', error);
    return NextResponse.json({ error: 'Failed to create quotation sheet' }, { status: 500 });
  }
}
