import type { Prisma } from '@prisma/client';

/** Derives a human label from whatever fields the bill draft has filled in so far. */
export function labelFor(data: Record<string, any>): string {
  const customer = typeof data?.customer_name === 'string' ? data.customer_name.trim() : '';
  const docketCount = Array.isArray(data?.docket_ids) ? data.docket_ids.length : 0;
  if (customer && docketCount > 0) return `${customer} (${docketCount} LR${docketCount === 1 ? '' : 's'})`;
  if (customer) return `${customer} (no LRs selected yet)`;
  return 'Untitled bill draft';
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
    label: d.label || 'Untitled bill draft',
    data: d.data,
    created_at: d.createdAt.toISOString(),
    updated_at: d.updatedAt.toISOString(),
  };
}
