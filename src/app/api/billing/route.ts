import { NextResponse } from 'next/server';
import type { Prisma, Bill } from '@prisma/client';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { computeBillTotals, paiseToDecimalString } from '@/lib/money';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

type BillWithCreator = Bill & { creator?: { fullName: string | null; email: string } | null };

function serializeBill(b: BillWithCreator) {
  const decimal = (value: Prisma.Decimal | null | undefined) => (value === null || value === undefined ? 0 : Number(value));

  return {
    id: b.id,
    bill_no: b.billNo,
    created_by: b.createdBy,
    created_by_name: b.creator?.fullName || b.creator?.email || 'Staff',
    created_by_email: b.creator?.email || '',
    invoice_date: b.invoiceDate.toISOString().split('T')[0],
    category: b.category,
    doc_type: b.docType,
    is_services: b.isServices,
    customer_id: b.customerId,
    customer_name: b.customerName,
    customer_gstin: b.customerGstin || '',
    customer_address: b.customerAddress || '',
    customer_email: b.customerEmail || '',
    customer_phone: b.customerPhone || '',
    docket_ids: b.docketIds || [],
    items: (b.items as any) || [],
    subtotal: decimal(b.subtotal),
    discount: decimal(b.discount),
    gst_percentage: decimal(b.gstPercentage) || 18,
    gst_amount: decimal(b.gstAmount),
    round_off: decimal(b.roundOff),
    grand_total: decimal(b.grandTotal),
    reverse_charge: Boolean(b.reverseCharge),
    notes: b.notes || '',
    created_at: b.createdAt.toISOString(),
    updated_at: b.updatedAt.toISOString(),
  };
}

export async function GET(req: Request) {
  try {
    const session = await auth();
    const user = session?.user as { id?: string; role?: string } | undefined;

    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q')?.trim() || '';
    const limit = Math.min(
      Math.max(Number(searchParams.get('limit')) || DEFAULT_LIMIT, 1),
      MAX_LIMIT
    );
    const offset = Math.max(Number(searchParams.get('offset')) || 0, 0);

    const where: Prisma.BillWhereInput = {};

    if (q) {
      where.OR = [
        { billNo: { contains: q, mode: 'insensitive' } },
        { customerName: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [bills, total] = await Promise.all([
      prisma.bill.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: { creator: { select: { fullName: true, email: true } } },
      }),
      prisma.bill.count({ where }),
    ]);

    return NextResponse.json({
      bills: bills.map(serializeBill),
      total,
      limit,
      offset,
      hasMore: offset + bills.length < total,
    });
  } catch (error: unknown) {
    console.error('Failed to list bills:', error);
    return NextResponse.json({ error: 'Failed to load bills' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    const user = session?.user as { id?: string; role?: string } | undefined;

    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();

    const docketIds: string[] = Array.isArray(body.docket_ids) ? body.docket_ids.filter(Boolean) : [];
    const customItems = Array.isArray(body.items) ? body.items : [];

    if (docketIds.length === 0 && customItems.length === 0) {
      return NextResponse.json({ error: 'Add at least one custom line item or select an LR to bill.' }, { status: 400 });
    }

    let customer = null;
    if (body.customer_id && typeof body.customer_id === 'string' && body.customer_id.trim() !== '') {
      customer = await prisma.customer.findUnique({ where: { id: body.customer_id.trim() } }).catch(() => null);
    }

    let customerName = (body.customer_name || '').trim();
    if (!customerName && customer?.name) {
      customerName = customer.name;
    }

    // If customer name is still blank, deduce from the first selected LR
    if (!customerName && docketIds.length > 0) {
      const firstDocket = await prisma.cargoDocket.findFirst({
        where: { id: { in: docketIds } },
        select: { consignorName: true, consignorGstin: true, consignorAddress: true, consignorPhone: true },
      });
      if (firstDocket?.consignorName) {
        customerName = firstDocket.consignorName;
      }
    }

    if (!customerName) {
      customerName = 'Valued Customer';
    }

    const finalCustomerGstin = (body.customer_gstin !== undefined ? body.customer_gstin : customer?.gstin) || '';
    const finalCustomerAddress = (body.customer_address !== undefined ? body.customer_address : customer?.address) || '';
    const finalCustomerEmail = (body.customer_email !== undefined ? body.customer_email : customer?.email) || '';
    const finalCustomerPhone = (body.customer_phone !== undefined ? body.customer_phone : customer?.phone) || '';

    // If real dockets are referenced, check for validity & duplicates
    if (docketIds.length > 0) {
      const dockets = await prisma.cargoDocket.findMany({ where: { id: { in: docketIds } } });
      const voided = dockets.filter((d) => d.status === 'voided');
      if (voided.length > 0) {
        return NextResponse.json(
          { error: `Voided LRs cannot be billed: ${voided.map((d) => d.docketNo).join(', ')}` },
          { status: 400 }
        );
      }

      const alreadyBilled = await prisma.bill.findMany({
        where: { docketIds: { hasSome: docketIds } },
        select: { billNo: true, docketIds: true },
      });
      if (alreadyBilled.length > 0) {
        const dupeIds = new Set(alreadyBilled.flatMap((b) => b.docketIds).filter((id) => docketIds.includes(id)));
        const dupeNos = dockets.filter((d) => dupeIds.has(d.id)).map((d) => d.docketNo);
        return NextResponse.json(
          { error: `These LRs are already on another bill: ${dupeNos.join(', ')}` },
          { status: 409 }
        );
      }
    }

    const dateInput = body.invoice_date || new Date().toISOString().split('T')[0];
    const invoiceDate = new Date(dateInput.includes('T') ? dateInput : `${dateInput}T00:00:00.000Z`);
    if (Number.isNaN(invoiceDate.getTime())) {
      return NextResponse.json({ error: 'Invalid invoice date.' }, { status: 400 });
    }

    // Calculate or accept financial totals
    const subtotal = Number(body.subtotal) || 0;
    const discount = Number(body.discount) || 0;
    const gstPercentage = Number(body.gst_percentage ?? 18);
    const gstAmount = Number(body.gst_amount) || Math.round((subtotal - discount) * (gstPercentage / 100));
    const rawTotal = subtotal - discount + gstAmount;
    const grandTotal = body.grand_total !== undefined ? Number(body.grand_total) : Math.round(rawTotal);
    const roundOff = body.round_off !== undefined ? Number(body.round_off) : Number((grandTotal - rawTotal).toFixed(2));

    // Handle custom or generated bill number
    let billNo = (body.bill_no || '').trim();
    if (!billNo) {
      for (let attempt = 0; attempt < 5; attempt++) {
        let candidate: string;
        try {
          const [{ generate_bill_number: genNo }] = await prisma.$queryRaw<Array<{ generate_bill_number: string }>>`
            SELECT generate_bill_number();
          `;
          candidate = genNo;
        } catch {
          const count = await prisma.bill.count();
          const now = new Date();
          const year = now.getFullYear();
          const month = now.getMonth() + 1;
          const fyStart = month >= 4 ? year : year - 1;
          const fyLabel = `${String(fyStart % 100).padStart(2, '0')}-${String((fyStart + 1) % 100).padStart(2, '0')}`;
          candidate = `RCT/${fyLabel}/${String(count + 1 + attempt).padStart(5, '0')}`;
        }

        const existing = await prisma.bill.findUnique({ where: { billNo: candidate } });
        if (!existing) {
          billNo = candidate;
          break;
        }
      }

      if (!billNo) {
        billNo = `RCT/26-27/${Date.now().toString().slice(-5)}`;
      }
    } else {
      const existing = await prisma.bill.findUnique({ where: { billNo } });
      if (existing) {
        return NextResponse.json({ error: `Bill number ${billNo} already exists.` }, { status: 409 });
      }
    }

    const bill = await prisma.bill.create({
      data: {
        billNo,
        createdBy: user.id,
        invoiceDate,
        category: body.category || 'B2B',
        docType: body.doc_type || 'INV',
        isServices: body.is_services !== undefined ? Boolean(body.is_services) : true,
        customerId: customer?.id || null,
        customerName: customerName,
        customerGstin: finalCustomerGstin,
        customerAddress: finalCustomerAddress,
        customerEmail: finalCustomerEmail,
        customerPhone: finalCustomerPhone,
        docketIds,
        ...(customItems && customItems.length > 0 ? { items: customItems } : {}),
        subtotal,
        discount,
        gstPercentage,
        gstAmount,
        roundOff,
        grandTotal,
        reverseCharge: Boolean(body.reverse_charge),
        notes: body.notes || null,
      } as any,
      include: { creator: { select: { fullName: true, email: true } } },
    });

    return NextResponse.json(serializeBill(bill), { status: 201 });
  } catch (error: any) {
    console.error('Failed to issue bill:', error);
    return NextResponse.json({ error: error?.message || 'Failed to issue bill.' }, { status: 500 });
  }
}
