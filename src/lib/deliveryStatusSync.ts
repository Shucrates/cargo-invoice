import type { DeliveryStatus as PrismaDeliveryStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { isDeliveryStatus, DELIVERY_STATUS_TO_PRISMA_ENUM } from '@/lib/deliveryStatus';

/** Keeps CargoDocket.deliveryStatus in sync with the latest tracking
 *  checkpoint. Called after any create/update/delete of a
 *  DocketTrackingEvent so the canonical field and the public tracking
 *  timeline never disagree. */
export async function syncDeliveryStatus(docketId: string) {
  const latest = await prisma.docketTrackingEvent.findFirst({
    where: { docketId },
    orderBy: { eventAt: 'desc' },
    select: { status: true },
  });

  const status = latest && isDeliveryStatus(latest.status) ? latest.status : 'Booked';

  await prisma.cargoDocket.update({
    where: { id: docketId },
    data: { deliveryStatus: DELIVERY_STATUS_TO_PRISMA_ENUM[status] as PrismaDeliveryStatus },
  });
}
