/**
 * Money handling for cargo dockets.
 *
 * All arithmetic happens in integer paise. Rupee amounts arriving as floats
 * (`1234.56`) cannot represent every two-decimal value exactly, so summing them
 * drifts; converting to paise first makes every operation exact. Postgres stores
 * these columns as NUMERIC(10,2), which is itself exact — the drift was only
 * ever introduced in the JavaScript layer.
 */

/** Individual chargeable lines on a docket, in rupees as entered by the user. */
export interface DocketCharges {
  freight_amount?: unknown;
  fuel_charge?: unknown;
  clearing_charge?: unknown;
  air_service_charge?: unknown;
  risk_charge?: unknown;
  handling_charge?: unknown;
  docket_charge?: unknown;
  pickup_delivery_charge?: unknown;
  other_charge?: unknown;
  transport_mode?: unknown;
}

export interface DocketTotals {
  subtotalPaise: number;
  serviceChargePaise: number;
  serviceChargeRate: number;
  gstPaise: number;
  grandTotalPaise: number;
}

/**
 * Parses a user-supplied rupee amount into integer paise.
 * Returns 0 for blank, non-numeric, negative, or non-finite input.
 */
export function toPaise(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;

  const rupees = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(rupees) || rupees < 0) return 0;

  // Scale then round: `Math.round` fixes the representation error that makes
  // e.g. 1234.565 * 100 land on 123456.49999999999.
  return Math.round(rupees * 100);
}

/** Converts integer paise back to a rupee number for display. */
export function fromPaise(paise: number): number {
  return paise / 100;
}

/** Converts integer paise to the fixed 2-decimal string the database column expects. */
export function paiseToDecimalString(paise: number): string {
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(Math.round(paise));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Formats integer paise as Indian-grouped rupees, e.g. ₹1,23,456.78. */
export function formatPaise(paise: number): string {
  return `₹${fromPaise(paise).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * The single source of truth for docket totals. Both the API and the booking
 * form call this, so a quote shown to the customer and the row written to the
 * database can never disagree.
 *
 * Charges include Freight, Fuel, Clearing, optional manual Air Service Charge,
 * Risk, Handling, Docket, Pickup/Delivery, and Other charges.
 * GST is rounded half-up to the nearest paise on the subtotal as a whole.
 */
export function computeDocketTotals(
  charges: DocketCharges,
  gstPercentage: unknown,
  transportMode?: unknown
): DocketTotals {
  const mode = transportMode ?? charges.transport_mode;
  const isAir = mode === 'Air';
  const airServiceChargeVal = isAir ? (charges.air_service_charge || 0) : (charges.air_service_charge || 0);

  const subtotalPaise =
    toPaise(charges.freight_amount) +
    toPaise(charges.fuel_charge) +
    toPaise(charges.clearing_charge) +
    toPaise(airServiceChargeVal) +
    toPaise(charges.risk_charge) +
    toPaise(charges.handling_charge) +
    toPaise(charges.docket_charge) +
    toPaise(charges.pickup_delivery_charge) +
    toPaise(charges.other_charge);

  const serviceChargePaise = toPaise(airServiceChargeVal);
  const serviceChargeRate = 0;

  const rate = Number(gstPercentage);
  const gstRate = Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : 18;

  const gstPaise = Math.round((subtotalPaise * gstRate) / 100);

  return {
    subtotalPaise,
    serviceChargePaise,
    serviceChargeRate,
    gstPaise,
    grandTotalPaise: subtotalPaise + gstPaise,
  };
}

export interface BillTotals {
  subtotalPaise: number;
  gstPaise: number;
  discountPaise: number;
  roundOffPaise: number;
  grandTotalPaise: number;
}

/**
 * The single source of truth for consolidated bill totals. Sums the taxable
 * value (subtotal, pre-GST) of every docket included on the bill, applies a
 * flat 18% GST and an optional discount, then rounds to the nearest rupee —
 * matching how the bill preview and PDF must always agree with what was
 * actually stored.
 */
export function computeBillTotals(docketSubtotalsPaise: number[], discount: unknown): BillTotals {
  const subtotalPaise = docketSubtotalsPaise.reduce((sum, p) => sum + p, 0);
  const gstPaise = Math.round(subtotalPaise * 0.18);
  const discountPaise = toPaise(discount);

  const netBeforeRoundingPaise = subtotalPaise + gstPaise - discountPaise;
  const grandTotalPaise = Math.round(netBeforeRoundingPaise / 100) * 100;
  const roundOffPaise = grandTotalPaise - netBeforeRoundingPaise;

  return { subtotalPaise, gstPaise, discountPaise, roundOffPaise, grandTotalPaise };
}
