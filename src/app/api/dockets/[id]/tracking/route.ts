import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { fromPaymentModeEnum } from '@/lib/paymentMethod';

/**
 * Best-effort per-IP rate limit. This is per serverless instance and therefore
 * not a hard guarantee — it exists to blunt bulk scraping, not to be an
 * authorisation boundary. LR numbers are sequential and therefore guessable,
 * so the response below is limited to what a customer needs to follow their
 * shipment: no addresses, phones, PINs, e-way bill or invoice numbers.
 */
const RATE_LIMIT = { windowMs: 60_000, max: 20 };
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);

  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
    if (hits.size > 10_000) {
      for (const [key, value] of hits) if (now > value.resetAt) hits.delete(key);
    }
    return false;
  }

  entry.count += 1;
  return entry.count > RATE_LIMIT.max;
}

/**
 * Public-facing name masking. A customer holding the link should be able to
 * recognise their own shipment; someone who stumbles onto it should not walk
 * away with a usable customer list.
 */
function maskName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return `${parts[0].slice(0, 3)}•••`;
  return `${parts[0]} ${parts.slice(1).map((p) => `${p[0].toUpperCase()}.`).join(' ')}`;
}

function calculateEstimatedDelivery(bookingDate: Date, transportMode: string): string {
  const days = transportMode === 'Air' ? 2 : transportMode === 'Train' ? 4 : 5;
  const est = new Date(bookingDate);
  est.setDate(est.getDate() + days);
  return est.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      req.headers.get('x-real-ip') ||
      'unknown';

    if (rateLimited(ip)) {
      return NextResponse.json(
        { error: 'Too many tracking requests. Please try again shortly.' },
        { status: 429 }
      );
    }

    const { id } = await params;
    const rawReference = decodeURIComponent(id.trim());
    const cleanReference = rawReference.replace(/^#+\s*/, '').trim();

    // Allow looking up by Docket Number (e.g. LR-2026-01066, #LR-2026-01066, 1554), Tracking/Waybill Number, or UUID
    const docket = await prisma.cargoDocket.findFirst({
      where: {
        OR: [
          { id: rawReference },
          ...(cleanReference && cleanReference !== rawReference ? [{ id: cleanReference }] : []),
          { docketNo: { equals: rawReference, mode: 'insensitive' as const } },
          ...(cleanReference && cleanReference !== rawReference
            ? [{ docketNo: { equals: cleanReference, mode: 'insensitive' as const } }]
            : []),
          { trackingNo: { equals: rawReference, mode: 'insensitive' as const } },
          ...(cleanReference && cleanReference !== rawReference
            ? [{ trackingNo: { equals: cleanReference, mode: 'insensitive' as const } }]
            : []),
        ],
      },
    });

    if (!docket) {
      return NextResponse.json({ error: 'Shipment record not found' }, { status: 404 });
    }

    const checkpoints: Array<{
      status: string;
      location: string;
      datetime: string;
      description: string;
    }> = [];

    let status = 'Booked';

    // Live carrier events, when a tracking number and API key are both present.
    const apiKey = process.env.TRACKING_API_KEY;
    if (apiKey && docket.trackingNo) {
      try {
        const res = await fetch(
          `https://api.ship24.com/public/v1/trackers/search/${encodeURIComponent(docket.trackingNo)}`,
          { headers: { Authorization: `Bearer ${apiKey}` } }
        );

        if (res.ok) {
          const data = await res.json();
          const tracking = data?.data?.trackings?.[0];
          const events = tracking?.events ?? [];

          if (tracking?.shipment?.statusMilestone) {
            status = String(tracking.shipment.statusMilestone).replace(/_/g, ' ');
          }

          for (const ev of events) {
            checkpoints.push({
              status: ev.status || ev.statusMilestone || 'Checkpoint update',
              location: ev.location || 'In network',
              datetime: ev.datetime || ev.occurrenceDatetime,
              description: ev.occurrence || ev.statusCode || 'Scanned by carrier',
            });
          }
        }
      } catch (err) {
        console.error('Ship24 lookup failed:', err);
      }
    }

    // Events we can actually vouch for from our own records. We deliberately do
    // not synthesise "dispatched"/"in transit" milestones — we have no evidence
    // the shipment moved, and showing invented progress to a customer is worse
    // than showing none.
    checkpoints.push({
      status: 'Shipment booked & LR issued',
      location: `${docket.fromCity} origin terminal`,
      datetime: docket.createdAt.toISOString(),
      description: `Consignment booked. LR No: ${docket.docketNo}`,
    });

    // Checkpoints staff/admin logged manually — the source of truth for
    // status between carrier scans, or the only source when there is no
    // carrier feed at all.
    const manualEvents = await prisma.docketTrackingEvent.findMany({
      where: { docketId: docket.id },
      orderBy: { eventAt: 'desc' },
    });
    for (const ev of manualEvents) {
      checkpoints.push({
        status: ev.status,
        location: ev.location || 'In network',
        datetime: ev.eventAt.toISOString(),
        description: ev.description || ev.status,
      });
    }

    const isVoided = docket.status === 'voided';
    if (isVoided) {
      checkpoints.push({
        status: 'Shipment voided',
        location: 'Central audit desk',
        datetime: (docket.voidedAt ?? docket.updatedAt).toISOString(),
        description: 'This LR has been cancelled. Please contact us for details.',
      });
    }

    checkpoints.sort((a, b) => Date.parse(b.datetime) - Date.parse(a.datetime));

    // The most recent checkpoint (carrier scan or manual update) wins, except
    // a void always takes priority regardless of when it was recorded.
    status = isVoided ? 'Voided' : checkpoints[0]?.status || status;

    return NextResponse.json(
      {
        docket_no: docket.docketNo,
        status,
        // `false` tells the UI to label the timeline as booking-record only.
        is_live_feed: checkpoints.length > (docket.status === 'voided' ? 2 : 1),
        booking_date: docket.bookingDate.toISOString().split('T')[0],
        estimated_delivery: calculateEstimatedDelivery(docket.bookingDate, docket.transportMode),
        transport_mode: docket.transportMode,
        courier_partner: docket.courierPartner || 'Self Network',
        tracking_no: docket.trackingNo || 'N/A',
        from_city: docket.fromCity,
        to_city: docket.toCity,
        consignor_name: maskName(docket.consignorName),
        consignee_name: maskName(docket.consigneeName),
        package_count: docket.packageCount,
        charged_weight_kg: Number(docket.chargedWeightKg ?? 0),
        goods_description: docket.goodsDescription || 'General Commercial Freight',
        payment_mode: fromPaymentModeEnum(docket.paymentMode),
        checkpoints,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error: unknown) {
    console.error('Tracking lookup failed:', error);
    return NextResponse.json({ error: 'Tracking lookup failed' }, { status: 500 });
  }
}
