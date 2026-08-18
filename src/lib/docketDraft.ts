import type { Prisma } from '@prisma/client';

/** Derives a human label from whatever fields the draft has filled in so far. */
export function labelFor(data: Record<string, any>): string {
  const consignor = typeof data?.consignor_name === 'string' ? data.consignor_name.trim() : '';
  const consignee = typeof data?.consignee_name === 'string' ? data.consignee_name.trim() : '';
  if (consignor && consignee) return `${consignor} → ${consignee}`;
  if (consignor) return `${consignor} → (no consignee yet)`;
  if (consignee) return `(no consignor yet) → ${consignee}`;
  return 'Untitled draft';
}

export function serializeDraft(d: {
  id: string;
  createdBy: string;
  label: string | null;
  data: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: d.id,
    created_by: d.createdBy,
    label: d.label || 'Untitled draft',
    data: d.data,
    created_at: d.createdAt.toISOString(),
    updated_at: d.updatedAt.toISOString(),
  };
}
