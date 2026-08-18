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

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; eventId: string }> }
) {
  try {
    const session = await auth();
    const user = session?.user as { id?: string } | undefined;
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, eventId } = await params;
    const existing = await prisma.docketTrackingEvent.findUnique({ where: { id: eventId } });
    if (!existing || existing.docketId !== id) {
      return NextResponse.json({ error: 'Tracking event not found.' }, { status: 404 });
    }

    const body = await req.json();
    const data: { status?: string; location?: string | null; description?: string | null; eventAt?: Date } = {};

    if (body.status !== undefined) {
      const status = String(body.status).trim();
      if (!isDeliveryStatus(status)) {
        return NextResponse.json(
          { error: `Status must be one of: ${DELIVERY_STATUSES.join(', ')}.` },
          { status: 400 }
        );
      }
      data.status = status;
    }
    if (body.location !== undefined) {
      data.location = body.location ? String(body.location).trim() : null;
    }
    if (body.description !== undefined) {
      data.description = body.description ? String(body.description).trim() : null;
    }
    if (body.event_at !== undefined) {
      const eventAt = new Date(body.event_at);
      if (Number.isNaN(eventAt.getTime())) {
        return NextResponse.json({ error: 'Invalid event date/time.' }, { status: 400 });
      }
      data.eventAt = eventAt;
    }

    const updated = await prisma.docketTrackingEvent.update({
      where: { id: eventId },
      data,
      include: { creator: { select: { fullName: true, email: true } } },
    });
    // event_at may have changed too, which can change which event is latest.
    await syncDeliveryStatus(id);

    return NextResponse.json(serializeEvent(updated));
  } catch (error: unknown) {
    console.error('Failed to update tracking event:', error);
    return NextResponse.json({ error: 'Failed to update tracking event' }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; eventId: string }> }
) {
  try {
    const session = await auth();
    const user = session?.user as { id?: string } | undefined;
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, eventId } = await params;
    const existing = await prisma.docketTrackingEvent.findUnique({ where: { id: eventId } });
    if (!existing || existing.docketId !== id) {
      return NextResponse.json({ error: 'Tracking event not found.' }, { status: 404 });
    }

    await prisma.docketTrackingEvent.delete({ where: { id: eventId } });
    await syncDeliveryStatus(id);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Failed to delete tracking event:', error);
    return NextResponse.json({ error: 'Failed to delete tracking event' }, { status: 500 });
  }
}
