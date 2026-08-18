import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { DELIVERY_STATUSES, isDeliveryStatus } from '@/lib/deliveryStatus';
import { syncDeliveryStatus } from '@/lib/deliveryStatusSync';

function serializeEvent(e: {
  id: string;
  docketId: string;
  status: string;
  location: string | null;
  description: string | null;
  eventAt: Date;
  createdBy: string;
  creator: { fullName: string | null; email: string } | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: e.id,
    docket_id: e.docketId,
    status: e.status,
    location: e.location || '',
    description: e.description || '',
    event_at: e.eventAt.toISOString(),
    created_by: e.createdBy,
    created_by_name: e.creator?.fullName || e.creator?.email || 'Staff',
    created_at: e.createdAt.toISOString(),
    updated_at: e.updatedAt.toISOString(),
  };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const user = session?.user as { id?: string } | undefined;
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const events = await prisma.docketTrackingEvent.findMany({
      where: { docketId: id },
      orderBy: { eventAt: 'desc' },
      include: { creator: { select: { fullName: true, email: true } } },
    });

    return NextResponse.json({ events: events.map(serializeEvent) });
  } catch (error: unknown) {
    console.error('Failed to list tracking events:', error);
    return NextResponse.json({ error: 'Failed to load tracking events' }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const user = session?.user as { id?: string } | undefined;
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const docket = await prisma.cargoDocket.findUnique({ where: { id }, select: { id: true } });
    if (!docket) {
      return NextResponse.json({ error: 'LR not found.' }, { status: 404 });
    }

    const body = await req.json();
    const status = String(body.status || '').trim();
    if (!isDeliveryStatus(status)) {
      return NextResponse.json(
        { error: `Status must be one of: ${DELIVERY_STATUSES.join(', ')}.` },
        { status: 400 }
      );
    }

    const eventAt = body.event_at ? new Date(body.event_at) : new Date();
    if (Number.isNaN(eventAt.getTime())) {
      return NextResponse.json({ error: 'Invalid event date/time.' }, { status: 400 });
    }

    const event = await prisma.docketTrackingEvent.create({
      data: {
        docketId: id,
        status,
        location: body.location ? String(body.location).trim() : null,
        description: body.description ? String(body.description).trim() : null,
        eventAt,
        createdBy: user.id,
      },
      include: { creator: { select: { fullName: true, email: true } } },
    });
    await syncDeliveryStatus(id);

    return NextResponse.json(serializeEvent(event), { status: 201 });
  } catch (error: unknown) {
    console.error('Failed to create tracking event:', error);
    return NextResponse.json({ error: 'Failed to save tracking event' }, { status: 500 });
  }
}
