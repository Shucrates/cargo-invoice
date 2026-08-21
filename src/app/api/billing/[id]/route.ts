import { NextResponse } from 'next/server';
import type { Prisma, Bill, CargoDocket } from '@prisma/client';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

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

/** Minimal docket shape needed to re-render a past bill's line items. */
function serializeDocketLine(d: CargoDocket) {
  const decimal = (value: Prisma.Decimal | null) => (value === null ? 0 : Number(value));

  return {
    id: d.id,
    docket_no: d.docketNo,
    status: d.status,
    booking_date: d.bookingDate.toISOString().split('T')[0],
    transport_mode: d.transportMode,
    from_city: d.fromCity,
    to_city: d.toCity,
    consignor_name: d.consignorName,
    package_count: d.packageCount,
    invoice_no: d.invoiceNo || '',
    charged_weight_kg: decimal(d.chargedWeightKg),
    subtotal: decimal(d.subtotal),
    grand_total: decimal(d.grandTotal),
    payment_mode: d.paymentMode,
    expected_mode: d.expectedMode,
  };
}

async function loadOwnedBill(id: string) {
  const bill = await prisma.bill.findUnique({
    where: { id },
    include: { creator: { select: { fullName: true, email: true } } },
  });
  return bill;
}

export async function GET(
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
    const bill = await loadOwnedBill(id);
    if (!bill) {
      return NextResponse.json({ error: 'Bill not found.' }, { status: 404 });
    }

    const dockets = await prisma.cargoDocket.findMany({ where: { id: { in: bill.docketIds || [] } } });
    const serializedDbDockets = dockets.map(serializeDocketLine);

    // Merge manual items if present
    const customItems: any[] = Array.isArray(bill.items) ? (bill.items as any[]) : [];
    const manualDockets = customItems.map((item, idx) => ({
      id: item.id || `manual-${idx}`,
      docket_no: item.docket_no || `ITEM-${idx + 1}`,
      status: 'issued',
      booking_date: item.booking_date || bill.invoiceDate.toISOString().split('T')[0],
      transport_mode: 'Road',
      from_city: item.from_city || '',
      to_city: item.to_city || '',
      consignor_name: item.consignor_name || item.particulars || '',
      package_count: Number(item.package_count) || 1,
      invoice_no: item.invoice_no || '',
      charged_weight_kg: Number(item.charged_weight_kg) || 0,
      subtotal: Number(item.amount) || 0,
      grand_total: Number(item.amount) || 0,
    }));

    const allLines = serializedDbDockets.length > 0 ? serializedDbDockets : manualDockets;

    return NextResponse.json({
      ...serializeBill(bill),
      dockets: allLines,
    });
  } catch (error: unknown) {
    console.error('Failed to load bill:', error);
    return NextResponse.json({ error: 'Failed to load bill' }, { status: 500 });
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
    const bill = await loadOwnedBill(id);
    if (!bill) {
      return NextResponse.json({ error: 'Bill not found.' }, { status: 404 });
    }

    await prisma.bill.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Failed to delete bill:', error);
    return NextResponse.json({ error: 'Failed to delete bill' }, { status: 500 });
  }
}
