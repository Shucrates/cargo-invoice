import type { DeliveryStatus } from '@/lib/deliveryStatus';
import type { PaymentMethodLabel } from '@/lib/paymentMethod';

export type CargoDocket = {
  id: string;
  docket_no: string;
  created_by: string;
  created_by_name?: string;
  created_by_email?: string;
  status: 'issued' | 'voided';
  void_reason?: string;
  voided_at?: string;
  voided_by?: string;
  voided_by_name?: string;
  voided_by_email?: string;
  
  booking_date: string;
  transport_mode: 'Road' | 'Air' | 'Train';
  mode?: string;
  is_international: boolean;
  from_city: string;
  to_city: string;
  
  consignor_name: string;
  consignor_address: string;
  consignor_pin: string;
  consignor_phone: string;
  consignor_gstin: string;
  
  consignee_name: string;
  consignee_address: string;
  consignee_pin: string;
  consignee_phone: string;
  consignee_gstin: string;

  articles_count?: number;
  package_count: number;
  packing_method: string;
  invoice_no: string;
  invoice_number?: string;
  invoice_value: number;
  actual_weight_kg: number;
  charged_weight_kg: number;
  charged_weight?: number;
  rate_per_kg?: number;
  stat_charge?: number;
  dimensions_lhb: string;
  goods_description: string;
  eway_bill_no?: string;
  
  freight_amount: number;
  risk_charge: number;
  handling_charge: number;
  docket_charge: number;
  pickup_delivery_charge: number;
  other_charge: number;
  subtotal: number;
  gst_percentage: number;
  gst_amount: number;
  grand_total: number;
  
  payment_mode: 'Paid' | 'To Pay' | 'Credit';
  payment_method?: PaymentMethodLabel;
  expected_mode?: PaymentMethodLabel | null;
  delivery_status: DeliveryStatus;
  amount_paid: number;
  amount_due: number;
  customer_code: string;
  tracking_no?: string;
  courier_partner?: string;
  physical_docket_no?: string;
  created_at: string;
  updated_at: string;
};

/** One payment received against an LR. Multiple can accrue on one docket
 *  (partial payments); a docket's amount_paid is the sum of these. */
export type DocketPayment = {
  id: string;
  docket_id: string;
  docket_no?: string;
  customer_code?: string | null;
  amount: number;
  method: PaymentMethodLabel;
  paid_at: string;
  notes?: string;
  recorded_by: string;
  recorded_by_name?: string;
  created_at: string;
  voided: boolean;
  void_reason?: string;
  voided_at?: string | null;
  voided_by_name?: string;
};

export type Customer = {
  id: string;
  code?: string;
  name: string;
  address?: string | null;
  pinCode?: string | null;
  phone?: string | null;
  gstin?: string | null;
  email?: string | null;
  city?: string | null;
  totalBilled?: number;
  totalPaid?: number;
  outstandingAmount?: number;
  outstandingCredit?: number;
  outstandingToPay?: number;
};

export type Profile = {
  id: string;
  email: string;
  role: 'staff' | 'admin';
  full_name: string;
};

/** A partially filled LR saved for later. `data` mirrors the snake_case keys
 *  CargoDocketForm submits, but every field is optional since the draft may
 *  be missing anything not yet filled in. */
export type DocketDraft = {
  id: string;
  created_by: string;
  label: string;
  data: Record<string, any>;
  created_at: string;
  updated_at: string;
};

/** A consolidated GST tax invoice issued against one or more LRs. Totals and
 *  customer details are frozen at issue time — see prisma/schema.prisma. */
export type BillCustomLineItem = {
  id?: string;
  docket_id?: string;
  booking_date: string;
  docket_no: string;
  consignor_name?: string;
  particulars?: string;
  from_city?: string;
  to_city?: string;
  transport_mode?: 'Road' | 'Air' | 'Train';
  package_count: number;
  invoice_no?: string;
  charged_weight_kg?: number;
  amount: number;
  /** True while `amount` reflects a quotation-sheet auto-price rather than
   *  a manual edit — lets pricing keep it in sync until the user types over it. */
  amount_auto?: boolean;
};

export type Bill = {
  id: string;
  bill_no: string;
  created_by: string;
  created_by_name?: string;
  created_by_email?: string;
  invoice_date: string;
  category: string;
  doc_type: string;
  is_services: boolean;
  customer_id?: string | null;
  customer_name: string;
  customer_gstin?: string;
  customer_address?: string;
  customer_email?: string;
  customer_phone?: string;
  docket_ids: string[];
  items?: BillCustomLineItem[];
  subtotal: number;
  discount: number;
  gst_percentage?: number;
  gst_amount: number;
  round_off: number;
  grand_total: number;
  reverse_charge?: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
};

/** A half-configured bill (customer + selected LRs + invoice meta) saved for
 *  later, before it is issued as a permanent Bill. Mirrors DocketDraft. */
export type BillDraft = {
  id: string;
  created_by: string;
  label: string;
  data: Record<string, any>;
  created_at: string;
  updated_at: string;
};

/** A single operating-expense line item on an ExpenseLedger. */
export type ExpenseEntry = {
  id: string;
  ledger_id?: string;
  date: string;
  category: string;
  amount: number;
  payment_mode: string;
  ref_number?: string;
  vendor_name?: string;
  description?: string;
  created_at?: string;
};

/** A named sheet of expense entries covering one date or a date range,
 *  downloadable as CSV/PDF. Mirrors Bill: a header record with a generated
 *  number and a running total, plus a child list of entries. */
export type ExpenseLedger = {
  id: string;
  ledger_no: string;
  created_by: string;
  created_by_name?: string;
  period_start: string;
  period_end: string;
  label?: string;
  notes?: string;
  total_amount: number;
  entry_count?: number;
  entries?: ExpenseEntry[];
  created_at: string;
  updated_at: string;
};
