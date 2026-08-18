import type { BadgeProps } from '@/components/ui/badge';

/** Fixed LR delivery lifecycle, in order. Must match the `DeliveryStatus`
 * enum values in prisma/schema.prisma exactly. */
export const DELIVERY_STATUSES = [
  'Booked',
  'Picked Up',
  'In Transit',
  'Arrived at Hub',
  'Out for Delivery',
  'Delivered',
  'Delayed',
  'Exception',
] as const;

export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export function isDeliveryStatus(value: string): value is DeliveryStatus {
  return (DELIVERY_STATUSES as readonly string[]).includes(value);
}

/** Prisma's generated `DeliveryStatus` enum keys (e.g. `Picked_Up`) differ
 * from the `@map`'d display labels above (e.g. `Picked Up`) — the Prisma
 * client only accepts the key, never the mapped DB value. Convert before
 * writing to `CargoDocket.deliveryStatus`. */
export const DELIVERY_STATUS_TO_PRISMA_ENUM: Record<DeliveryStatus, string> = {
  Booked: 'Booked',
  'Picked Up': 'Picked_Up',
  'In Transit': 'In_Transit',
  'Arrived at Hub': 'Arrived_At_Hub',
  'Out for Delivery': 'Out_For_Delivery',
  Delivered: 'Delivered',
  Delayed: 'Delayed',
  Exception: 'Exception',
};

export function deliveryStatusBadgeVariant(status: string): NonNullable<BadgeProps['variant']> {
  switch (status) {
    case 'Delivered':
      return 'success';
    case 'Out for Delivery':
      return 'warning';
    case 'Delayed':
    case 'Exception':
      return 'destructive';
    case 'Booked':
      return 'secondary';
    default:
      return 'info';
  }
}
