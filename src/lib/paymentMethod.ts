import type { PaymentMethod } from '@prisma/client';

/** UI/API payment method labels, matching the `PaymentMethod` enum's `@map`'d
 * DB values — but Prisma's generated client type uses the enum member names
 * (`Bank_Transfer`), not those mapped values, so callers must convert. */
export const PAYMENT_METHODS = ['Cash', 'UPI', 'Bank Transfer'] as const;
export type PaymentMethodLabel = (typeof PAYMENT_METHODS)[number];

export function isPaymentMethodLabel(value: string): value is PaymentMethodLabel {
  return (PAYMENT_METHODS as readonly string[]).includes(value);
}

export function toPaymentMethodEnum(label: string): PaymentMethod {
  return (label === 'Bank Transfer' ? 'Bank_Transfer' : label) as PaymentMethod;
}

/** Reverses `toPaymentMethodEnum` — Prisma always returns the enum member
 * name (`Bank_Transfer`), never the `@map`'d DB value, so every read must
 * convert back to the space-containing label the UI expects. */
export function fromPaymentMethodEnum(value: string): PaymentMethodLabel {
  return (value === 'Bank_Transfer' ? 'Bank Transfer' : value) as PaymentMethodLabel;
}
