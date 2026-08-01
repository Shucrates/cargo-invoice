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
  
  package_count: number;
  packing_method: string;
  invoice_no: string;
  invoice_value: number;
  actual_weight_kg: number;
  charged_weight_kg: number;
  dimensions_lhb: string;
  goods_description: string;
  
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
  customer_code: string;
  tracking_no?: string;
  courier_partner?: string;
  created_at: string;
  updated_at: string;
};

export type Profile = {
  id: string;
  email: string;
  role: 'staff' | 'admin';
  full_name: string;
};
