import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const docket = await prisma.cargoDocket.findUnique({
      where: { id },
      include: { creator: { select: { fullName: true } } },
    });

    if (!docket) {
      return NextResponse.json({ error: 'Docket record not found' }, { status: 404 });
    }

    const courier = docket.courierPartner || 'Self Network';
    const waybill = docket.trackingNo || docket.docketNo;
    const fromCity = docket.fromCity;
    const toCity = docket.toCity;

    const apiKey = process.env.TRACKING_API_KEY;

    // Helper for direct official portal URL
    const getOfficialCarrierUrl = (c: string, w: string) => {
      const cleanW = encodeURIComponent(w.trim());
      switch (c.toLowerCase()) {
        case 'fedex':
          return `https://www.fedex.com/fedextrack/?trknbr=${cleanW}`;
        case 'dhl':
          return `https://www.dhl.com/en/express/tracking.html?AWB=${cleanW}`;
        case 'ups':
          return `https://www.ups.com/track?tracknum=${cleanW}`;
        case 'aramex':
          return `https://www.aramex.com/express/track-results-detail?mode=0&ShipmentNumber=${cleanW}`;
        case 'blue dart':
        case 'bluedart':
          return `https://www.bluedart.com/tracking?handler=t&trackFor=0&waybillNo=${cleanW}`;
        default:
          return `https://www.google.com/search?q=track+package+${cleanW}`;
      }
    };

    if (!apiKey) {
      return NextResponse.json(
        { error: 'TRACKING_API_KEY is not configured in .env.local' },
        { status: 500 }
      );
    }

    // Step 1: Register tracker on Ship24 Global Carrier API
    const createRes = await fetch('https://api.ship24.com/public/v1/trackers', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ trackingNumber: waybill }),
    });

    let trackerId: string | null = null;

    if (createRes.ok || createRes.status === 201 || createRes.status === 409) {
      const createData = await createRes.json();
      trackerId = createData?.data?.tracker?.trackerId || createData?.data?.trackings?.[0]?.tracker?.trackerId;
    }

    // Step 2: Fetch live tracking results from Ship24 API
    if (trackerId) {
      const resultsRes = await fetch(`https://api.ship24.com/public/v1/trackers/${trackerId}/results`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });

      if (resultsRes.ok) {
        const resultsData = await resultsRes.json();
        const tracking = resultsData?.data?.trackings?.[0];

        if (tracking) {
          const milestone = tracking.shipment?.statusMilestone || 'pending';
          const statusMap: Record<string, string> = {
            pending: 'Manifested & Pending Pickup',
            info_received: 'Order Information Received',
            in_transit: 'In Transit',
            out_for_delivery: 'Out for Delivery',
            delivered: 'Delivered',
            exception: 'Delivery Exception',
          };

          const mappedStatus = statusMap[milestone] || milestone.replace(/_/g, ' ').toUpperCase();

          const apiEvents = (tracking.events || []).map((ev: any) => ({
            timestamp: ev.datetime ? new Date(ev.datetime).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Recently',
            status: ev.status || ev.occurrence || 'Checkpoint Updated',
            location: ev.location || `${fromCity} Hub`,
            description: ev.occurrence || `Event registered via ${courier}`,
          }));

          return NextResponse.json({
            id: docket.id,
            docket_no: docket.docketNo,
            courier_partner: courier,
            tracking_no: waybill,
            status: mappedStatus,
            is_live_feed: true,
            transport_mode: docket.transportMode,
            from_city: fromCity,
            to_city: toCity,
            consignor_name: docket.consignorName,
            consignee_name: docket.consigneeName,
            charged_weight_kg: Number(docket.chargedWeightKg || 0),
            official_url: getOfficialCarrierUrl(courier, waybill),
            events: apiEvents.length > 0 ? apiEvents : [
              {
                timestamp: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
                status: 'Registered on Ship24 Global Carrier Gateway',
                location: `${courier} Network`,
                description: `Waybill #${waybill} tracked live. Awaiting initial carrier scan.`,
              }
            ],
          });
        }
      }
    }

    // Step 3: Direct Waybill Lookup on Ship24 Search API
    const searchRes = await fetch(`https://api.ship24.com/public/v1/trackers/search/${encodeURIComponent(waybill)}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    if (searchRes.ok) {
      const searchData = await searchRes.json();
      const tracking = searchData?.data?.trackings?.[0];

      if (tracking) {
        const milestone = tracking.shipment?.statusMilestone || 'pending';
        const mappedStatus = milestone.replace(/_/g, ' ').toUpperCase();

        const apiEvents = (tracking.events || []).map((ev: any) => ({
          timestamp: ev.datetime ? new Date(ev.datetime).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Recently',
          status: ev.status || ev.occurrence || 'Checkpoint Updated',
          location: ev.location || `${fromCity} Hub`,
          description: ev.occurrence || `Event registered via ${courier}`,
        }));

        return NextResponse.json({
          id: docket.id,
          docket_no: docket.docketNo,
          courier_partner: courier,
          tracking_no: waybill,
          status: mappedStatus,
          is_live_feed: true,
          transport_mode: docket.transportMode,
          from_city: fromCity,
          to_city: toCity,
          consignor_name: docket.consignorName,
          consignee_name: docket.consigneeName,
          charged_weight_kg: Number(docket.chargedWeightKg || 0),
          official_url: getOfficialCarrierUrl(courier, waybill),
          events: apiEvents,
        });
      }
    }

    return NextResponse.json({
      error: `No live tracking events returned by Ship24 API for waybill ${waybill}.`,
      is_live_feed: false,
    }, { status: 404 });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
