'use client';

import { useState, useEffect, useMemo, useRef, useImperativeHandle, forwardRef } from 'react';
import { generateInvoicePDF, QuotationRateItem } from '@/lib/pdfGenerator';
import type { QuotationSheetDTO } from '@/components/QuotationView';
import { computeDocketTotals, fromPaise } from '@/lib/money';
import { PAYMENT_METHODS, type PaymentMethodLabel } from '@/lib/paymentMethod';
import { getCompanySettings } from '@/lib/companyConfig';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CityInput } from '@/components/ui/city-input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Check, ArrowRight, Save, X, ChevronDown, Truck, Plane, TrainFront, Download, Search } from 'lucide-react';
import { RUDRA_LOGO_BASE64 } from '@/lib/logoData';
import { DELIVERY_STATUSES } from '@/lib/deliveryStatus';

interface CargoDocketFormProps {
  onCreated?: () => void;
  onBack?: () => void;
  /** Draft being resumed, if any. Hydrates the form once on mount. */
  draftId?: string | null;
  initialData?: Record<string, any> | null;
  /** Fired after a successful manual "Save as Draft". */
  onDraftSaved?: () => void;
  /** Admin-only correction: when set, this is an existing issued LR being
   *  edited (PATCH `/api/dockets/{id}`) rather than a new one being created. */
  editDocketId?: string | null;
}

/** Imperative handle so a parent can check for unsaved changes and trigger a
 *  draft save before navigating away, without lifting all form state up. */
export interface CargoDocketFormHandle {
  isDirty: boolean;
  saveAsDraft: () => Promise<boolean>;
}

const CargoDocketForm = forwardRef<CargoDocketFormHandle, CargoDocketFormProps>(function CargoDocketForm(
  { onCreated, onBack, draftId, initialData, onDraftSaved, editDocketId },
  ref
) {
  const isEditing = Boolean(editDocketId);
  const defaultOriginCity = getCompanySettings().defaultOriginCity || 'Mumbai';

  const [loading, setLoading] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(draftId ?? null);

  useEffect(() => {
    fetch('/api/customers')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setCustomers(data))
      .catch((err) => console.error(err));
  }, []);

  // Quotation sheets, used to auto-price freight from origin city + destination
  // + transport mode. Fetched once; the docket form never edits these.
  const [quotationSheets, setQuotationSheets] = useState<QuotationSheetDTO[]>([]);
  // Origin cities already used in quotation sheets, surfaced first in city autocomplete.
  const knownCities = useMemo(() => quotationSheets.map((s) => s.origin_city).filter(Boolean), [quotationSheets]);
  useEffect(() => {
    fetch('/api/quotations')
      .then((res) => (res.ok ? res.json() : { sheets: [] }))
      .then((data) => setQuotationSheets(data.sheets || []))
      .catch((err) => console.error('Failed to load quotation sheets:', err));
  }, []);

  /** Picks the sheet to price from: prefer the Default sheet whose origin
   *  city matches the LR's "From" city, falling back to the Default sheet
   *  for this transport mode regardless of city (single-city installs). */
  function pickSheet(sheetType: 'ROAD_RAIL' | 'AIR', originCity: string): QuotationSheetDTO | null {
    const ofType = quotationSheets.filter((s) => s.sheet_type === sheetType);
    const cityMatch = ofType.filter((s) => s.origin_city.trim().toLowerCase() === originCity.trim().toLowerCase());
    return cityMatch.find((s) => s.is_default) || cityMatch[0] || ofType.find((s) => s.is_default) || null;
  }

  // Form State — lazily seeded from initialData when resuming a draft, so a
  // hydration effect (and its timing headaches) isn't needed.
  const [bookingDate, setBookingDate] = useState(initialData?.booking_date || new Date().toISOString().split('T')[0]);
  const [transportMode, setTransportMode] = useState<'Road' | 'Air' | 'Train'>(initialData?.transport_mode || 'Road');
  const [isInternational, setIsInternational] = useState<boolean>(Boolean(initialData?.is_international));
  const [fromCity, setFromCity] = useState(initialData?.from_city || defaultOriginCity);
  const [toCity, setToCity] = useState(initialData?.to_city || '');
  const [courierPartner, setCourierPartner] = useState<string>(initialData?.courier_partner || 'Self Network');
  const [trackingNo, setTrackingNo] = useState<string>(initialData?.tracking_no || '');
  const [physicalDocketNo, setPhysicalDocketNo] = useState<string>(initialData?.physical_docket_no || '');
  const [customerCode, setCustomerCode] = useState<string>(initialData?.customer_code || '');
  const [consignorName, setConsignorName] = useState(initialData?.consignor_name || '');
  const [consignorAddress, setConsignorAddress] = useState(initialData?.consignor_address || '');
  const [consignorPin, setConsignorPin] = useState(initialData?.consignor_pin || '');
  const [consignorPhone, setConsignorPhone] = useState(initialData?.consignor_phone || '');
  const [consignorGstin, setConsignorGstin] = useState(initialData?.consignor_gstin || '');

  // Consignee
  const [consigneeName, setConsigneeName] = useState(initialData?.consignee_name || '');
  const [consigneeAddress, setConsigneeAddress] = useState(initialData?.consignee_address || '');
  const [consigneePin, setConsigneePin] = useState(initialData?.consignee_pin || '');
  const [consigneePhone, setConsigneePhone] = useState(initialData?.consignee_phone || '');
  const [consigneeGstin, setConsigneeGstin] = useState(initialData?.consignee_gstin || '');

  // Goods
  const [packageCount, setPackageCount] = useState(Number(initialData?.package_count) || 1);
  const [packingMethod, setPackingMethod] = useState(initialData?.packing_method || 'Box');
  const [invoiceNo, setInvoiceNo] = useState(initialData?.invoice_no || '');
  const [invoiceValue, setInvoiceValue] = useState(Number(initialData?.invoice_value) || 0);
  const [actualWeightKg, setActualWeightKg] = useState(Number(initialData?.actual_weight_kg) || 0);
  const [chargedWeightKg, setChargedWeightKg] = useState(Number(initialData?.charged_weight_kg) || 0);
  const [goodsDescription, setGoodsDescription] = useState(initialData?.goods_description || '');
  const [ewayBillNo, setEwayBillNo] = useState(initialData?.eway_bill_no || '');

  // Charges
  const [freightAmount, setFreightAmount] = useState(Number(initialData?.freight_amount) || 0);
  // True while freightAmount reflects the default quotation sheet's rate
  // rather than a manual edit — lets the auto-price effect keep it in sync
  // as city/mode/weight change, but stop the moment the user types over it.
  const [freightAutoPriced, setFreightAutoPriced] = useState(false);
  const [freightHint, setFreightHint] = useState<string>('');
  const [handlingCharge, setHandlingCharge] = useState(Number(initialData?.handling_charge) || 0);
  const [riskCharge, setRiskCharge] = useState(Number(initialData?.risk_charge) || 0);
  const [docketCharge, setDocketCharge] = useState(
    initialData?.docket_charge !== undefined ? Number(initialData.docket_charge) || 0 : 150
  );
  const [pickupDeliveryCharge, setPickupDeliveryCharge] = useState(Number(initialData?.pickup_delivery_charge) || 0);
  const [otherCharge, setOtherCharge] = useState(Number(initialData?.other_charge) || 0);
  const [gstPercentage, setGstPercentage] = useState(
    initialData?.gst_percentage !== undefined ? Number(initialData.gst_percentage) || 0 : 18
  );
  const [paymentMode, setPaymentMode] = useState<'Paid' | 'To Pay' | 'Credit'>(initialData?.payment_mode || 'To Pay');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodLabel | ''>(
    initialData?.payment_method || ''
  );
  const [expectedMode, setExpectedMode] = useState<PaymentMethodLabel | ''>(
    initialData?.expected_mode || ''
  );

  // Auto-price freight from the default quotation sheet: match toCity against
  // a rate row for this transport mode, bill for the actual charged weight,
  // and only ever overwrite freightAmount while it's still auto-priced (never
  // clobber a manual edit). No match -> falls back to manual entry untouched.
  useEffect(() => {
    const sheetType: 'ROAD_RAIL' | 'AIR' = transportMode === 'Air' ? 'AIR' : 'ROAD_RAIL';
    const sheet = pickSheet(sheetType, fromCity || defaultOriginCity);
    if (!sheet || !toCity.trim()) {
      if (freightAutoPriced) setFreightHint('');
      return;
    }

    const wantMode = transportMode === 'Road' ? 'BY ROAD' : transportMode === 'Train' ? 'BY RAIL' : 'BY AIR';
    const rates: QuotationRateItem[] = sheet.rates || [];
    const match = rates.find(
      (r) => r.destination.trim().toUpperCase() === toCity.trim().toUpperCase() && r.mode === wantMode
    );

    if (!match) {
      setFreightHint(`No value mentioned in quotation sheet "${sheet.name}" for ${toCity.trim()} — enter freight manually.`);
      return;
    }

    const billableKg = chargedWeightKg || 0;
    if (billableKg <= 0) {
      setFreightHint(`₹${match.ratePerKg}/kg available from "${sheet.name}" — enter weight to auto-price.`);
      return;
    }

    const computed = Math.round(match.ratePerKg * billableKg);
    if (freightAutoPriced || freightAmount === 0) {
      setFreightAmount(computed);
      setFreightAutoPriced(true);
    }
    setFreightHint(
      `Auto-priced from "${sheet.name}": ₹${match.ratePerKg}/kg × ${billableKg}kg = ₹${computed}${freightAutoPriced || freightAmount === 0 ? '' : ' (edit to override)'}`
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toCity, fromCity, transportMode, chargedWeightKg, quotationSheets]);

  // Live preview totals. Uses the same helper as submit and as the API, so the
  // number the user sees on the review step is exactly what gets stored.
  const previewTotals = computeDocketTotals(
    {
      freight_amount: freightAmount,
      handling_charge: handlingCharge,
      risk_charge: riskCharge,
      docket_charge: docketCharge,
      pickup_delivery_charge: pickupDeliveryCharge,
      other_charge: otherCharge,
      transport_mode: transportMode,
    },
    gstPercentage,
    transportMode
  );
  const subtotal = fromPaise(previewTotals.subtotalPaise);
  const serviceCharge = fromPaise(previewTotals.serviceChargePaise);
  const gstAmount = fromPaise(previewTotals.gstPaise);
  const grandTotal = fromPaise(previewTotals.grandTotalPaise);

  // Snapshot of every field a draft (or the final submit) needs, keyed the
  // same way the dockets API expects. Reused for dirty-checking, "Save as
  // Draft", and the final submit payload so they can never drift apart.
  const getFormSnapshot = () => ({
    booking_date: bookingDate,
    transport_mode: transportMode,
    from_city: fromCity,
    to_city: toCity,
    consignor_name: consignorName,
    consignor_address: consignorAddress,
    consignor_pin: consignorPin,
    consignor_phone: consignorPhone,
    consignor_gstin: consignorGstin,
    consignee_name: consigneeName,
    consignee_address: consigneeAddress,
    consignee_pin: consigneePin,
    consignee_phone: consigneePhone,
    consignee_gstin: consigneeGstin,
    package_count: packageCount,
    packing_method: packingMethod || 'Box',
    invoice_no: invoiceNo,
    invoice_value: invoiceValue,
    actual_weight_kg: actualWeightKg,
    charged_weight_kg: chargedWeightKg,
    goods_description: goodsDescription,
    eway_bill_no: ewayBillNo,
    freight_amount: freightAmount,
    handling_charge: handlingCharge,
    risk_charge: riskCharge,
    docket_charge: docketCharge,
    pickup_delivery_charge: pickupDeliveryCharge,
    other_charge: otherCharge,
    gst_percentage: gstPercentage,
    payment_mode: paymentMode,
    payment_method: paymentMode === 'Paid' ? paymentMethod || undefined : undefined,
    expected_mode: paymentMode !== 'Paid' ? expectedMode || undefined : undefined,
    courier_partner: courierPartner,
    tracking_no: trackingNo,
    physical_docket_no: physicalDocketNo,
    customer_code: customerCode,
    is_international: isInternational,
  });

  // Captured once on mount (from initialData, or blank defaults for a new LR)
  // so later renders can tell whether anything has actually changed.
  const pristineSnapshotRef = useRef<string>(JSON.stringify(getFormSnapshot()));
  const isDirty = JSON.stringify(getFormSnapshot()) !== pristineSnapshotRef.current;

  // Always-fresh refs for the beforeunload handler below, which is registered
  // once and must never read stale closure state.
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  const snapshotRef = useRef(getFormSnapshot);
  snapshotRef.current = getFormSnapshot;

  const saveAsDraft = async (): Promise<boolean> => {
    try {
      const snapshot = getFormSnapshot();
      const url = currentDraftId ? `/api/dockets/drafts/${currentDraftId}` : '/api/dockets/drafts';
      const res = await fetch(url, {
        method: currentDraftId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
      });
      if (!res.ok) return false;
      const saved = await res.json();
      setCurrentDraftId(saved.id);
      pristineSnapshotRef.current = JSON.stringify(snapshot);
      return true;
    } catch (err) {
      console.error('Failed to save draft:', err);
      return false;
    }
  };

  useImperativeHandle(ref, () => ({ isDirty, saveAsDraft }));

  // Native browser warning on reload/close while dirty, plus a best-effort
  // silent draft snapshot via sendBeacon so a hard reload doesn't lose work
  // even if the user dismisses that warning.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!isDirtyRef.current) return;
      e.preventDefault();
      e.returnValue = '';
      try {
        const blob = new Blob([JSON.stringify(snapshotRef.current())], { type: 'application/json' });
        navigator.sendBeacon('/api/dockets/drafts', blob);
      } catch (err) {
        console.error('Failed to beacon draft snapshot:', err);
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  const handleSaveDraft = async () => {
    setDraftSaving(true);
    const ok = await saveAsDraft();
    setDraftSaving(false);
    setMsg(ok ? { type: 'success', text: 'Draft saved.' } : { type: 'error', text: 'Failed to save draft.' });
    if (ok && onDraftSaved) onDraftSaved();
  };

  /** Inline validation before submit */
  const validateForm = (): boolean => {
    if (!consignorName.trim() || !consigneeName.trim()) {
      setMsg({ type: 'error', text: 'Consignor Name and Consignee Name are required.' });
      return false;
    }
    if (!fromCity.trim()) setFromCity(defaultOriginCity);
    if (!toCity.trim()) setToCity('Delhi');
    if (paymentMode === 'Paid' && !paymentMethod) {
      setMsg({ type: 'error', text: 'Select how the payment was received (Cash, UPI, Bank Transfer, Cheque, Card, or Other).' });
      return false;
    }
    if (paymentMode !== 'Paid' && !expectedMode) {
      setMsg({ type: 'error', text: 'Select the expected payment mode.' });
      return false;
    }
    setMsg(null);
    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    setLoading(true);
    setMsg(null);

    const { subtotalPaise, serviceChargePaise, gstPaise, grandTotalPaise } = computeDocketTotals(
      {
        freight_amount: freightAmount,
        handling_charge: handlingCharge,
        risk_charge: riskCharge,
        docket_charge: docketCharge,
        pickup_delivery_charge: pickupDeliveryCharge,
        other_charge: otherCharge,
        transport_mode: transportMode,
      },
      gstPercentage,
      transportMode
    );

    const calcSubtotal = fromPaise(subtotalPaise);
    const calcGstAmount = fromPaise(gstPaise);
    const calcGrandTotal = fromPaise(grandTotalPaise);

    const newDocketPayload = {
      ...getFormSnapshot(),
      subtotal: calcSubtotal,
      gst_amount: calcGstAmount,
      grand_total: calcGrandTotal,
    };

    try {
      const res = await fetch(isEditing ? `/api/dockets/${editDocketId}` : '/api/dockets', {
        method: isEditing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newDocketPayload),
      });

      const data = await res.json();

      if (!res.ok) {
        setMsg({ type: 'error', text: data.error || (isEditing ? 'Failed to save changes.' : 'Failed to issue docket.') });
      } else if (isEditing) {
        setMsg({ type: 'success', text: 'LR updated successfully.' });
        pristineSnapshotRef.current = JSON.stringify(getFormSnapshot());
        if (onCreated) onCreated();
      } else {
        const issuedDocketNo = data.docket_no || data.docketNo;
        // Clean up the draft before surfacing the PostIssueSheet
        if (currentDraftId) {
          fetch(`/api/dockets/drafts/${currentDraftId}`, { method: 'DELETE' }).catch(() => {});
        }
        pristineSnapshotRef.current = JSON.stringify(getFormSnapshot());
        // Show PostIssueSheet — user explicitly chooses to Download or Email
        setIssuedDocket({ id: data.id, docket_no: issuedDocketNo, data: { ...newDocketPayload, created_by: data.created_by || data.createdBy } });
      }
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'An error occurred.' });
    } finally {
      setLoading(false);
    }
  };

  // ─── Step-based flow ─────────────────────────────────────────────────────
  type LRStep = 'consignor' | 'consignee' | 'route' | 'shipment' | 'transport' | 'charges' | 'payment';
  const STEPS: LRStep[] = ['consignor', 'consignee', 'route', 'shipment', 'transport', 'charges', 'payment'];
  const STEP_LABELS: Record<LRStep, string> = {
    consignor: 'Consignor',
    consignee: 'Consignee',
    route: 'Route & Date',
    shipment: 'Shipment',
    transport: 'Transport',
    charges: 'Charges',
    payment: 'Payment',
  };

  const company = getCompanySettings();

  const [currentStep, setCurrentStep] = useState<LRStep>('consignor');
  const [consignorMode, setConsignorMode] = useState<'select' | 'new'>('select');
  const [consigneeMode, setConsigneeMode] = useState<'select' | 'new'>('select');
  const [consignorOpen, setConsignorOpen] = useState(false);
  const [consigneeOpen, setConsigneeOpen] = useState(false);
  const [consignorSearch, setConsignorSearch] = useState('');
  const [consigneeSearch, setConsigneeSearch] = useState('');
  const [issuedDocket, setIssuedDocket] = useState<{ id: string; docket_no: string; data: any } | null>(null);
  const [emailTo, setEmailTo] = useState('');
  const [emailSent, setEmailSent] = useState(false);

  /** Per-step zoom: scale + transform-origin to focus the preview on the relevant section */
  const PREVIEW_ZONES: Record<LRStep, { scale: number; ox: string; oy: string }> = {
    consignor:  { scale: 2.8, ox: '22%', oy: '27%'  },
    consignee:  { scale: 2.8, ox: '22%', oy: '40%'  },
    route:      { scale: 3.2, ox: '47%', oy: '13%'  },
    shipment:   { scale: 2.8, ox: '74%', oy: '26%'  },
    transport:  { scale: 3.5, ox: '55%', oy: '3%'   },
    charges:    { scale: 2.5, ox: '74%', oy: '56%'  },
    payment:    { scale: 3.2, ox: '22%', oy: '52%'  },
  };

  const stepIndex = STEPS.indexOf(currentStep);

  const validateCurrentStep = (): boolean => {
    setMsg(null);
    if (currentStep === 'consignor' && !consignorName.trim()) {
      setMsg({ type: 'error', text: 'Consignor name is required.' });
      return false;
    }
    if (currentStep === 'consignee' && !consigneeName.trim()) {
      setMsg({ type: 'error', text: 'Consignee name is required.' });
      return false;
    }
    if (currentStep === 'route') {
      if (!fromCity.trim()) setFromCity(defaultOriginCity);
      if (!toCity.trim()) { setMsg({ type: 'error', text: 'Destination city is required.' }); return false; }
    }
    if (currentStep === 'payment') {
      if (paymentMode === 'Paid' && !paymentMethod) {
        setMsg({ type: 'error', text: 'Select how payment was received.' }); return false;
      }
      if (paymentMode !== 'Paid' && !expectedMode) {
        setMsg({ type: 'error', text: 'Select the expected payment mode.' }); return false;
      }
    }
    return true;
  };

  const goNext = () => {
    if (!validateCurrentStep()) return;
    const next = STEPS[stepIndex + 1];
    if (next) setCurrentStep(next);
  };

  const goBack = () => {
    const prev = STEPS[stepIndex - 1];
    if (prev) setCurrentStep(prev);
    setMsg(null);
  };

  // ─── LR Document Preview (1-to-1 Match with Downloaded PDF) ──────────────
  const borderCol = '#94A3B8';
  const labelCol = '#475569';
  const inkCol = '#0F172A';

  function numberToWords(num: number): string {
    const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    if (!num || num === 0) return 'Zero Rupees Only';
    const inWords = (n: number): string => {
      if (n < 20) return a[n];
      if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : '');
      if (n < 1000) return a[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' ' + inWords(n % 100) : '');
      if (n < 100000) return inWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 !== 0 ? ' ' + inWords(n % 1000) : '');
      if (n < 10000000) return inWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 !== 0 ? ' ' + inWords(n % 100000) : '');
      return inWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 !== 0 ? ' ' + inWords(n % 10000000) : '');
    };
    return inWords(Math.floor(num)) + ' Rupees Only';
  }

  const Skel = ({ w = 70 }: { w?: number }) => (
    <span className="inline-block bg-slate-200 rounded animate-pulse align-middle" style={{ width: w, height: 7 }} />
  );

  const DV = ({ v, size = 8, sw = 70, bold = true }: { v?: string | number | null; size?: number; sw?: number; bold?: boolean }) => {
    const val = v !== undefined && v !== null && v !== '' && Number(v) !== 0 ? String(v) : null;
    return val
      ? <span style={{ fontSize: size, color: inkCol, fontWeight: bold ? 700 : 500 }}>{val}</span>
      : <Skel w={sw} />;
  };

  const renderPinBoxes = (pin: string) => {
    const digits = (pin || '').padEnd(6, ' ').slice(0, 6).split('');
    return (
      <span style={{ display: 'inline-flex', gap: 1, verticalAlign: 'middle', marginLeft: 2 }}>
        {digits.map((d, i) => (
          <span
            key={i}
            style={{
              display: 'inline-block',
              width: 7,
              height: 7,
              border: `0.4px solid ${borderCol}`,
              textAlign: 'center',
              lineHeight: '7px',
              fontSize: 5,
              fontWeight: 700,
              color: inkCol,
              background: '#fff',
            }}
          >
            {d.trim()}
          </span>
        ))}
      </span>
    );
  };

  const cell: React.CSSProperties = {
    border: `0.4px solid ${borderCol}`, padding: '1.2px 2px', fontSize: 5.5,
    color: labelCol, fontWeight: 700, verticalAlign: 'top', lineHeight: 1.2,
  };

  /** Step Zoom Configurations for smooth section camera focus in live preview */
  const STEP_ZOOM_TARGETS: Record<LRStep, { origin: string; scale: number; name: string }> = {
    consignor: { origin: '0% 20%', scale: 2.35, name: 'Consignor' },
    consignee: { origin: '0% 42%', scale: 2.35, name: 'Consignee' },
    route:     { origin: '100% 0%', scale: 2.35, name: 'Route & Date' },
    shipment:  { origin: '88% 26%', scale: 2.3, name: 'Goods & Packages' },
    transport: { origin: '90% 0%', scale: 2.35, name: 'Transport Mode' },
    charges:   { origin: '100% 58%', scale: 1.85, name: 'Charges & Freight' },
    payment:   { origin: '45% 80%', scale: 2.2, name: 'Payment & Terms' },
  };

  const [autoZoom, setAutoZoom] = useState<boolean>(true);

  /** Accent ring highlight for the section currently being edited */
  const highlight = (step: LRStep): React.CSSProperties =>
    currentStep === step
      ? { outline: `2px solid #0A2030`, outlineOffset: -1, borderRadius: 1, transition: 'outline 0.25s' }
      : { transition: 'outline 0.25s' };

  const renderLRDocumentPreview = (customDocketNo?: string, noHighlight: boolean = false, disableZoom: boolean = false) => {
    const docNo = customDocketNo || (isEditing ? (editDocketId?.slice(0, 8) ?? '—') : 'LR-2026-01053');
    const zoomTarget = (!disableZoom && autoZoom && !noHighlight) ? STEP_ZOOM_TARGETS[currentStep] : null;

    return (
      <div
        style={{
          background: '#fff',
          border: `1px solid ${borderCol}`,
          fontFamily: 'inherit',
          width: '100%',
          aspectRatio: '297/210',
          position: 'relative',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.25)',
          transformOrigin: zoomTarget ? zoomTarget.origin : '50% 50%',
          transform: zoomTarget ? `scale(${zoomTarget.scale})` : 'scale(1)',
          transition: 'transform 0.6s cubic-bezier(0.16, 1, 0.3, 1), transform-origin 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
          willChange: 'transform, transform-origin',
        }}
      >
        {/* TOP BAR */}
        <div
          style={{
            borderBottom: `0.4px solid ${borderCol}`,
            display: 'flex',
            alignItems: 'center',
            padding: '1.5px 6px',
            fontSize: 6,
            color: labelCol,
            fontWeight: 700,
          }}
        >
          <span
            style={{
              marginLeft: 'auto',
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              padding: '1px 6px',
              borderRadius: 2,
              ...(noHighlight ? {} : highlight('transport')),
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <span
                style={{
                  display: 'inline-block',
                  width: 6.5,
                  height: 6.5,
                  border: `0.4px solid ${borderCol}`,
                  textAlign: 'center',
                  lineHeight: '6.5px',
                  fontSize: 5,
                  color: inkCol,
                  fontWeight: 800,
                }}
              >
                {isInternational ? 'X' : ''}
              </span>
              <span>International</span>
            </span>
            {(['Air', 'Road', 'Train'] as const).map((m) => (
              <span key={m} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: 6.5,
                    height: 6.5,
                    border: `0.4px solid ${borderCol}`,
                    textAlign: 'center',
                    lineHeight: '6.5px',
                    fontSize: 5,
                    color: inkCol,
                    fontWeight: 800,
                  }}
                >
                  {transportMode === m ? 'X' : ''}
                </span>
                <span>{m}</span>
              </span>
            ))}
          </span>
          <span style={{ fontSize: 6.5, marginLeft: 12, color: labelCol }}>No.</span>
          <span style={{ fontSize: 9.5, color: inkCol, fontWeight: 800, marginLeft: 3 }}>
            {docNo}
          </span>
        </div>

        {/* HEADER ROW */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 76px 96px', borderBottom: `0.4px solid ${borderCol}` }}>
          {/* Logo & Company info */}
          <div style={{ padding: '2px 4px', borderRight: `0.4px solid ${borderCol}`, display: 'flex', gap: 4, alignItems: 'center' }}>
            <img src={RUDRA_LOGO_BASE64} alt="logo" style={{ width: 22, height: 22, objectFit: 'contain', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 7.5, color: inkCol, fontWeight: 800, textTransform: 'uppercase', lineHeight: 1.1 }}>{company.tradeName}</div>
              <div style={{ fontSize: 5, color: labelCol, marginTop: 0.5 }}>GSTIN : {company.gstin}</div>
              <div style={{ fontSize: 4.5, color: labelCol, lineHeight: 1.2 }}>{company.address}</div>
              <div style={{ fontSize: 4.5, color: labelCol }}>Ph: {company.phone1} | Email: {company.email}</div>
            </div>
          </div>

          {/* Middle FROM / TO Box (Centered) */}
          <div style={{ borderRight: `0.4px solid ${borderCol}`, display: 'flex', flexDirection: 'column', ...(noHighlight ? {} : highlight('route')) }}>
            <div style={{ flex: 1, padding: '2px 4px', borderBottom: `0.4px solid ${borderCol}`, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 5.5, color: labelCol, fontWeight: 800, lineHeight: 1, width: 8, display: 'flex', flexDirection: 'column', textAlign: 'center' }}>
                <span>F</span><span>R</span><span>O</span><span>M</span>
              </span>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <DV v={fromCity} size={8.5} />
              </div>
            </div>
            <div style={{ flex: 1, padding: '2px 4px', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 5.5, color: labelCol, fontWeight: 800, lineHeight: 1, width: 8, display: 'flex', flexDirection: 'column', textAlign: 'center' }}>
                <span>T</span><span>O</span>
              </span>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <DV v={toCity} size={8.5} />
              </div>
            </div>
          </div>

          {/* Right Header Box */}
          <div style={{ padding: '2px 4px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', ...(noHighlight ? {} : highlight('route')) }}>
            <div style={{ fontSize: 5.5, fontWeight: 800, color: labelCol }}>NON-NEGOTIABLE DOCKET</div>
            <div style={{ borderTop: `0.4px solid ${borderCol}`, paddingTop: 1, fontSize: 5, display: 'flex', gap: 3, alignItems: 'center' }}>
              <span style={{ color: labelCol, fontWeight: 700 }}>DATE</span>
              <DV v={bookingDate} size={6} sw={40} />
            </div>
            <div style={{ borderTop: `0.4px solid ${borderCol}`, paddingTop: 1, fontSize: 5, display: 'flex', flexDirection: 'column' }}>
              <span style={{ color: labelCol, fontWeight: 700, fontSize: 4.5 }}>WAYBILL NO</span>
              <span style={{ fontSize: 5.5, color: inkCol, fontWeight: 700 }}>
                {courierPartner}: {trackingNo || physicalDocketNo || docNo}
              </span>
            </div>
          </div>
        </div>

        {/* BODY (Split Left / Right) */}
        <div style={{ display: 'grid', gridTemplateColumns: '46% 54%', flex: 1 }}>
          {/* LEFT COLUMN */}
          <div style={{ borderRight: `0.4px solid ${borderCol}`, display: 'flex', flexDirection: 'column' }}>
            {/* Consignor */}
            <div style={{ borderBottom: `0.4px solid ${borderCol}`, padding: '2px 4px', minHeight: 25, ...(noHighlight ? {} : highlight('consignor')) }}>
              <div style={{ display: 'flex', gap: 4, alignItems: 'baseline' }}>
                <span style={{ fontSize: 6, fontWeight: 800, color: labelCol, minWidth: 44 }}>CONSIGNOR</span>
                <DV v={consignorName} size={7.5} />
              </div>
              <div style={{ fontSize: 5.5, marginTop: 0.5, color: inkCol, fontWeight: 600 }}>{consignorAddress || <Skel w={90} />}</div>
              <div style={{ fontSize: 5, color: labelCol, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 1 }}>
                <span>PIN : {renderPinBoxes(consignorPin)}</span>
                <span>PH. : <span style={{ color: inkCol, fontWeight: 700 }}>{consignorPhone || '-'}</span></span>
              </div>
              <div style={{ fontSize: 4.5, color: labelCol, marginTop: 0.5 }}>
                CST/LST No./TIN No. : <span style={{ color: inkCol, fontWeight: 700 }}>{consignorGstin || '-'}</span>
              </div>
            </div>

            {/* Consignee */}
            <div style={{ borderBottom: `0.4px solid ${borderCol}`, padding: '2px 4px', minHeight: 25, ...(noHighlight ? {} : highlight('consignee')) }}>
              <div style={{ display: 'flex', gap: 4, alignItems: 'baseline' }}>
                <span style={{ fontSize: 6, fontWeight: 800, color: labelCol, minWidth: 44 }}>CONSIGNEE</span>
                <DV v={consigneeName} size={7.5} />
              </div>
              <div style={{ fontSize: 5.5, marginTop: 0.5, color: inkCol, fontWeight: 600 }}>{consigneeAddress || <Skel w={90} />}</div>
              <div style={{ fontSize: 5, color: labelCol, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 1 }}>
                <span>PIN : {renderPinBoxes(consigneePin)}</span>
                <span>PH. : <span style={{ color: inkCol, fontWeight: 700 }}>{consigneePhone || '-'}</span></span>
              </div>
              <div style={{ fontSize: 4.5, color: labelCol, marginTop: 0.5 }}>
                CST/LST No./TIN No. : <span style={{ color: inkCol, fontWeight: 700 }}>{consigneeGstin || '-'}</span>
              </div>
            </div>

            {/* Small Checkbox Row Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', borderBottom: `0.4px solid ${borderCol}`, ...(noHighlight ? {} : highlight('transport')) }}>
              <thead>
                <tr>
                  <th style={{ ...cell, fontSize: 4.5, padding: '1px 2px' }}>MODE OF DESPATCH</th>
                  <th style={{ ...cell, fontSize: 4.5, padding: '1px 2px' }}>OCTROI WILL BE BORNED BY</th>
                  <th style={{ ...cell, fontSize: 4.5, padding: '1px 2px' }}>MODVAT COPY</th>
                  <th style={{ ...cell, fontSize: 4.5, padding: '1px 2px' }}>DOD</th>
                  <th style={{ ...cell, fontSize: 4.5, padding: '1px 2px' }}>DACC</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ ...cell, fontSize: 4.5, padding: '1px 2px' }}>CONSIGNOR [ ]</td>
                  <td style={{ ...cell, fontSize: 4.5, padding: '1px 2px' }}>CONSIGNEE [ ]</td>
                  <td style={cell} />
                  <td style={cell} />
                  <td style={cell} />
                </tr>
              </tbody>
            </table>

            {/* Owner's Risk & Mode of Payment */}
            <div style={{ display: 'grid', gridTemplateColumns: '62% 38%', borderBottom: `0.4px solid ${borderCol}` }}>
              <div style={{ padding: '2px 3px', borderRight: `0.4px solid ${borderCol}`, fontSize: 4.5, color: labelCol, lineHeight: 1.3 }}>
                <div style={{ fontWeight: 800, fontSize: 5, marginBottom: 1 }}>AT OWNER&apos;S RISK / CARRIER&apos;S RISK</div>
                <div>Policy No. .................... Date ................</div>
                <div>Insurance Company ....................................</div>
                <div>Insurance Value ....................................</div>
                <div style={{ marginTop: 2, fontSize: 4 }}>(Received above shipment in order and in good condition)</div>
                <div style={{ fontSize: 4 }}>Date : ................ Time : ................</div>
              </div>
              <div style={{ padding: '2px 3px', ...(noHighlight ? {} : highlight('payment')) }}>
                <div style={{ fontSize: 5, fontWeight: 800, color: labelCol, marginBottom: 2 }}>MODE OF PAYMENT</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 5, fontWeight: 700, color: labelCol }}>
                  {(['Credit', 'Paid', 'To Pay'] as const).map((m) => (
                    <div key={m} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>{m.toUpperCase()}</span>
                      <span style={{ display: 'inline-block', width: 6, height: 6, border: `0.4px solid ${borderCol}`, textAlign: 'center', lineHeight: '6px', fontSize: 5, color: inkCol, fontWeight: 800 }}>
                        {paymentMode === m ? 'X' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Condition of Carriage */}
            <div style={{ padding: '2px 4px', fontSize: 4.5, color: labelCol, lineHeight: 1.4, marginTop: 'auto' }}>
              <div style={{ fontWeight: 800, fontSize: 5, marginBottom: 0.5 }}>CONDITION OF CARRIAGE</div>
              <div>[X] This is a Non-Negotiable Docket</div>
              <div>[X] Standard Conditions of Carriage are given on reverse</div>
              <div>[X] Liability limited to Rs. 1,000/- only</div>
              <div>[X] We Carry under the carrier&apos;s Act</div>
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Goods Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', borderBottom: `0.4px solid ${borderCol}`, ...(noHighlight ? {} : highlight('shipment')) }}>
              <thead>
                <tr>
                  <th style={{ ...cell, width: '14%' }}>No. of PKGS.</th>
                  <th style={{ ...cell, width: '18%' }}>Method of Packing</th>
                  <th style={{ ...cell, width: '18%' }}>Invoice No.</th>
                  <th style={{ ...cell, width: '18%' }}>Invoice Value</th>
                  <th style={{ ...cell }}>Description - (Said to Content)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ ...cell, textAlign: 'center' }}><DV v={packageCount > 0 ? `(${packageCount})` : null} size={6.5} sw={16} /></td>
                  <td style={cell}><DV v={packingMethod} size={5.5} sw={28} /></td>
                  <td style={cell}><DV v={invoiceNo || '-'} size={5.5} sw={28} /></td>
                  <td style={cell}><DV v={invoiceValue > 0 ? `Rs.${invoiceValue}` : '-'} size={5.5} sw={28} /></td>
                  <td style={cell}><DV v={goodsDescription || 'Apparels / General Goods'} size={5.5} sw={45} /></td>
                </tr>
              </tbody>
            </table>

            {/* Side-by-Side: Weight, Dimensions & E-Way Bill (Left ~30%) | Charges Table (Right ~70%) */}
            <div style={{ display: 'grid', gridTemplateColumns: '32% 68%', flex: 1, borderBottom: `0.4px solid ${borderCol}` }}>
              {/* Left Sub-block: Weight, Dimensions, E-Way Bill */}
              <div style={{ borderRight: `0.4px solid ${borderCol}`, display: 'flex', flexDirection: 'column', ...(noHighlight ? {} : highlight('shipment')) }}>
                {/* Actual & Charged Weight */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: `0.4px solid ${borderCol}`, padding: '1.5px 2px' }}>
                  <div style={{ borderRight: `0.4px solid ${borderCol}`, paddingRight: 2 }}>
                    <div style={{ fontSize: 4.5, color: labelCol, fontWeight: 800 }}>Actual Weight</div>
                    <div style={{ fontSize: 6, color: inkCol, fontWeight: 700, marginTop: 1 }}>{actualWeightKg > 0 ? `${actualWeightKg} kg` : '-'}</div>
                  </div>
                  <div style={{ paddingLeft: 2 }}>
                    <div style={{ fontSize: 4.5, color: labelCol, fontWeight: 800 }}>Charged Weight</div>
                    <div style={{ fontSize: 6, color: inkCol, fontWeight: 700, marginTop: 1 }}>{chargedWeightKg > 0 ? `${chargedWeightKg} kg` : '-'}</div>
                  </div>
                </div>

                {/* Dimensions */}
                <div style={{ borderBottom: `0.4px solid ${borderCol}`, padding: '1.5px 2.5px', fontSize: 4.5, color: labelCol }}>
                  <div style={{ fontWeight: 700 }}>Dimension &apos;L&apos;+&apos;B&apos;+&apos;H&apos; (Inches)</div>
                </div>

                {/* E-Way Bill No. */}
                <div style={{ borderBottom: `0.4px solid ${borderCol}`, padding: '1.5px 2.5px' }}>
                  <div style={{ fontSize: 4.5, color: labelCol, fontWeight: 800 }}>E-Way Bill No.</div>
                  <div style={{ fontSize: 5.5, color: inkCol, fontWeight: 700, marginTop: 0.5, wordBreak: 'break-all', minHeight: 6 }}>
                    <DV v={ewayBillNo} size={5.5} sw={30} />
                  </div>
                </div>
              </div>

              {/* Right Sub-block: Itemized Charges Table */}
              <div style={{ display: 'flex', flexDirection: 'column', ...(noHighlight ? {} : highlight('charges')) }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ ...cell, width: '56%', fontSize: 7, padding: '2px 3px', fontWeight: 800 }}>CHARGES</th>
                      <th style={{ ...cell, width: '26%', textAlign: 'right', fontSize: 7, padding: '2px 3px', fontWeight: 800 }}>FREIGHT</th>
                      <th style={{ ...cell, fontSize: 6.5, padding: '2px 3px', fontWeight: 800 }}>INSTRUCTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { name: 'Freight', val: freightAmount },
                      { name: 'Risk Charge/F.O.V.', val: riskCharge },
                      { name: 'Handling Charges', val: handlingCharge },
                      { name: 'Docket Charges', val: docketCharge },
                      { name: 'DOD, DACC Service Charges', val: 0 },
                      { name: 'OSC', val: 0 },
                      { name: 'Pick-up & Delivery Charges', val: pickupDeliveryCharge },
                      { name: 'Other Charges', val: otherCharge },
                      { name: 'Subtotal', val: subtotal, isBold: true },
                      ...(transportMode === 'Air' ? [{ name: 'Air Service Charge (35%)', val: serviceCharge, isBold: true }] : []),
                      { name: `GST ${gstPercentage}%`, val: gstAmount, isBold: true },
                    ].map((r) => (
                      <tr key={r.name}>
                        <td
                          style={{
                            ...cell,
                            fontWeight: r.isBold ? 700 : 500,
                            padding: '1.2px 3px',
                            fontSize: 6.2,
                            color: r.isBold ? inkCol : labelCol,
                          }}
                        >
                          {r.name}
                        </td>
                        <td
                          style={{
                            ...cell,
                            textAlign: 'right',
                            padding: '1.2px 3px',
                            fontSize: 6.5,
                            color: inkCol,
                            fontWeight: 700,
                          }}
                        >
                          {r.val > 0 ? r.val.toFixed(2) : ''}
                        </td>
                        <td style={{ ...cell, padding: '1.2px 3px' }} />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Grand Total & In words */}
            <div style={{ borderBottom: `0.4px solid ${borderCol}`, padding: '2.5px 5px', ...(noHighlight ? {} : highlight('charges')) }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 7.5, fontWeight: 800, color: labelCol }}>Grand Total:</span>
                {grandTotal > 0
                  ? <span style={{ fontSize: 9.5, fontWeight: 800, color: inkCol }}>{grandTotal.toFixed(2)}</span>
                  : <Skel w={40} />
                }
              </div>
              <div style={{ fontSize: 5.5, color: labelCol, marginTop: 1 }}>
                Rs. (In words) : <span style={{ color: inkCol, fontWeight: 700 }}>{numberToWords(grandTotal)}</span>
              </div>
            </div>

            {/* QR & Signatures */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '2px 3px', gap: 2, minHeight: 28 }}>
              {/* QR */}
              <div style={{ fontSize: 4, color: labelCol, display: 'flex', gap: 2, alignItems: 'center' }}>
                <div style={{ width: 22, height: 22, border: `0.4px solid ${borderCol}`, padding: 1, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg viewBox="0 0 24 24" style={{ width: 18, height: 18 }}>
                    <path fill={inkCol} d="M2,2H10V10H2V2M4,4V8H8V4H4M14,2H22V10H14V2M16,4V8H20V4H16M2,14H10V22H2V14M4,16V20H8V16H4M14,14H17V17H14V14M19,14H22V17H19V14M17,17H19V19H17V17M14,19H17V22H14V19M19,19H22V22H19V19Z" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontWeight: 800, color: inkCol, fontSize: 4.5 }}>PAYMENT QR CODE</div>
                  <div>GPay: {company.gpayNo}</div>
                  <div>UPI: {company.gpayNo}@upi</div>
                  <div style={{ fontWeight: 700, color: inkCol }}>Scan & Pay</div>
                </div>
              </div>

              {/* Consignor Signature */}
              <div style={{ fontSize: 4.5, textAlign: 'center', color: labelCol, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div style={{ height: 16, border: `0.4px solid ${borderCol}`, borderRadius: 1 }} />
                <div>CONSIGNOR&apos;S SIGNATURE</div>
              </div>

              {/* Received by RCS */}
              <div style={{ fontSize: 4, color: labelCol, lineHeight: 1.2 }}>
                <div style={{ fontWeight: 800, color: labelCol }}>Received by RCS</div>
                <div>Name : ................................</div>
                <div>Date : ................ Time : ........</div>
                <div style={{ marginTop: 2 }}>Sign of Booking Staff</div>
              </div>
            </div>
          </div>
        </div>

        {/* BOTTOM FULL-WIDTH FOOTER */}
        <div style={{ borderTop: `0.4px solid ${borderCol}`, padding: '1.5px 4px', fontSize: 4.5, color: labelCol, textAlign: 'center', lineHeight: 1.2 }}>
          <div>Phone : {company.phone1} and {company.phone2 || '+91 9321073435'} | Email : {company.email}</div>
          <div>({company.address})</div>
          <div style={{ fontWeight: 800, color: labelCol, letterSpacing: 0.5 }}>INTERNATIONAL SELF NETWORK COURIER TO 200+ COUNTRIES</div>
        </div>
      </div>
    );
  };

  // ─── Post-Issuance Actions ────────────────────────────────────────────────
  const handleCreateAnother = () => {
    setIssuedDocket(null);
    setCurrentStep('consignor');
    setConsignorMode('select');
    setConsigneeMode('select');
    setConsignorOpen(false);
    setConsigneeOpen(false);
    setConsignorSearch('');
    setConsigneeSearch('');
    setConsignorName('');
    setConsignorAddress('');
    setConsignorPin('');
    setConsignorPhone('');
    setConsignorGstin('');
    setConsigneeName('');
    setConsigneeAddress('');
    setConsigneePin('');
    setConsigneePhone('');
    setConsigneeGstin('');
    setEmailTo('');
    setEmailSent(false);
    setPackageCount(1);
    setPackingMethod('Box');
    setInvoiceNo('');
    setInvoiceValue(0);
    setActualWeightKg(0);
    setChargedWeightKg(0);
    setGoodsDescription('');
    setEwayBillNo('');
    setFreightAmount(0);
    setHandlingCharge(0);
    setRiskCharge(0);
    setDocketCharge(150);
    setPickupDeliveryCharge(0);
    setOtherCharge(0);
    setPaymentMode('To Pay');
    setPaymentMethod('');
    setExpectedMode('');
    setTrackingNo('');
    setPhysicalDocketNo('');
    setCheckpointStatus('Picked Up');
    setCheckpointLocation('');
    setCheckpointDesc('');
    setCheckpointSaving(false);
    setCheckpointSaved(false);
    setCheckpointError(null);
    setMsg(null);
  };

  // ─── Step Content Direct Renderers (Functions, not inner components) ─────────
  const filteredConsignors = customers.filter((c: any) =>
    !consignorSearch || c.name.toLowerCase().includes(consignorSearch.toLowerCase())
  );
  const filteredConsignees = customers.filter((c: any) =>
    !consigneeSearch || c.name.toLowerCase().includes(consigneeSearch.toLowerCase())
  );

  const renderStepContent = (step: LRStep) => {
    switch (step) {
      case 'consignor':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-3xl font-bold text-slate-900 tracking-tight font-heading">Select a cosignor</h2>
              <p className="text-sm text-slate-500 mt-1 font-normal">Sender of this shipment</p>
            </div>

            {consignorMode === 'select' ? (
              <div className="space-y-4 pt-2">
                <div className="relative">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Name</label>

                  {/* Dropdown trigger */}
                  <button
                    type="button"
                    onClick={() => setConsignorOpen(!consignorOpen)}
                    className={`w-full h-12 px-4 bg-white border rounded-xl text-left flex items-center justify-between transition-all cursor-pointer ${
                      consignorOpen
                        ? 'border-[#0A2030] ring-2 ring-[#0A2030]/10 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 shadow-2xs'
                    }`}
                  >
                    <span className={consignorName ? 'text-sm font-medium text-slate-900' : 'text-sm text-slate-400'}>
                      {consignorName || 'Select a cosignor'}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${consignorOpen ? 'rotate-180 text-slate-700' : ''}`} />
                  </button>

                  {/* Dropdown menu */}
                  {consignorOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setConsignorOpen(false)} />
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-20 overflow-hidden">
                        {/* + Add new option */}
                        <button
                          type="button"
                          onClick={() => {
                            setConsignorOpen(false);
                            setConsignorMode('new');
                          }}
                          className="w-full px-4 py-3.5 text-left text-sm font-bold text-[#0A2030] hover:bg-slate-50 flex items-center gap-2 border-b border-slate-100 transition-colors cursor-pointer"
                        >
                          <span className="text-base font-bold leading-none">+</span>
                          Add new customer
                        </button>

                        {/* Search box if there are customers */}
                        {customers.length > 3 && (
                          <div className="p-2 border-b border-slate-100 bg-slate-50/60">
                            <input
                              type="text"
                              placeholder="Search customers..."
                              value={consignorSearch}
                              onChange={(e) => setConsignorSearch(e.target.value)}
                              className="w-full h-8 px-3 text-xs bg-white border border-slate-300 rounded-lg text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-slate-400"
                            />
                          </div>
                        )}

                        {/* Section label */}
                        <div className="px-4 py-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/60 border-b border-slate-100">
                          Customers
                        </div>

                        {/* List of customers */}
                        <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                          {filteredConsignors.length === 0 ? (
                            <div className="p-6 text-center text-xs text-slate-400">No customers found</div>
                          ) : (
                            filteredConsignors.map((c: any) => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => {
                                  setConsignorName(c.name);
                                  if (c.phone) setConsignorPhone(c.phone);
                                  if (c.gstin) setConsignorGstin(c.gstin);
                                  if (c.city) setFromCity(c.city);
                                  if (c.pinCode || c.pin_code) setConsignorPin(c.pinCode || c.pin_code);
                                  if (c.address) setConsignorAddress(c.address);
                                  setConsignorOpen(false);
                                  setMsg(null);
                                }}
                                className={`w-full px-4 py-3 text-left hover:bg-slate-50 transition-colors flex items-center justify-between cursor-pointer ${
                                  consignorName === c.name ? 'bg-slate-100 text-[#0A2030]' : 'text-slate-800'
                                }`}
                              >
                                <div className="min-w-0 pr-2">
                                  <div className={`text-sm font-semibold truncate ${consignorName === c.name ? 'text-[#0A2030]' : 'text-slate-900'}`}>{c.name}</div>
                                  <div className="text-xs text-slate-400 truncate mt-0.5">
                                    {[c.city || c.address, c.email].filter(Boolean).join(' · ') || c.phone || c.code || ''}
                                  </div>
                                </div>
                                {consignorName === c.name && <Check className="w-4 h-4 text-[#0A2030] shrink-0" />}
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Selected customer summary card */}
                {consignorName && (
                  <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1 text-xs text-slate-600">
                    <div className="flex justify-between items-center text-slate-900 font-bold text-sm">
                      <span>{consignorName}</span>
                      <button
                        type="button"
                        onClick={() => setConsignorMode('new')}
                        className="text-xs font-semibold text-[#0A2030] hover:underline cursor-pointer"
                      >
                        Edit details
                      </button>
                    </div>
                    {consignorAddress && <div>{consignorAddress}</div>}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-slate-500">
                      {fromCity && <span>City: <strong className="text-slate-700">{fromCity}</strong></span>}
                      {consignorPin && <span>PIN: <strong className="text-slate-700">{consignorPin}</strong></span>}
                      {consignorPhone && <span>Ph: <strong className="text-slate-700">{consignorPhone}</strong></span>}
                      {consignorGstin && <span>GSTIN: <strong className="text-slate-700">{consignorGstin}</strong></span>}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Add new cosignor form */
              <div className="space-y-5 pt-2">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <h3 className="text-lg font-bold text-slate-900 font-heading">Add new customer</h3>
                  <button
                    type="button"
                    onClick={() => setConsignorMode('select')}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                  >
                    ← Back to select
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Name of Business / Customer *</label>
                    <Input value={consignorName} onChange={(e) => setConsignorName(e.target.value)} placeholder="e.g. Shenzhen Logistics Co." />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Address</label>
                    <Input value={consignorAddress} onChange={(e) => setConsignorAddress(e.target.value)} placeholder="100 King Street West" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">City / Town</label>
                      <CityInput value={fromCity} onChange={setFromCity} extraCities={knownCities} placeholder="Mumbai" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">PIN / Postal code</label>
                      <Input value={consignorPin} onChange={(e) => setConsignorPin(e.target.value)} placeholder="400001" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">Phone</label>
                      <Input value={consignorPhone} onChange={(e) => setConsignorPhone(e.target.value)} placeholder="+91 98765 43210" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">GSTIN</label>
                      <Input value={consignorGstin} onChange={(e) => setConsignorGstin(e.target.value)} placeholder="27AAAA..." />
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setConsignorMode('select')}
                      className="px-5 h-10 bg-[#0A2030] text-white text-xs font-bold rounded-xl hover:bg-[#071520] transition-colors cursor-pointer"
                    >
                      Save & Apply Cosignor
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );

      case 'consignee':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-3xl font-bold text-slate-900 tracking-tight font-heading">Select a cosignee</h2>
              <p className="text-sm text-slate-500 mt-1 font-normal">The receiver of this shipment</p>
            </div>

            {consigneeMode === 'select' ? (
              <div className="space-y-4 pt-2">
                <div className="relative">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Name</label>

                  {/* Dropdown trigger */}
                  <button
                    type="button"
                    onClick={() => setConsigneeOpen(!consigneeOpen)}
                    className={`w-full h-12 px-4 bg-white border rounded-xl text-left flex items-center justify-between transition-all cursor-pointer ${
                      consigneeOpen
                        ? 'border-[#0A2030] ring-2 ring-[#0A2030]/10 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 shadow-2xs'
                    }`}
                  >
                    <span className={consigneeName ? 'text-sm font-medium text-slate-900' : 'text-sm text-slate-400'}>
                      {consigneeName || 'Select a cosignee'}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${consigneeOpen ? 'rotate-180 text-slate-700' : ''}`} />
                  </button>

                  {/* Dropdown menu */}
                  {consigneeOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setConsigneeOpen(false)} />
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-20 overflow-hidden">
                        {/* + Add new option */}
                        <button
                          type="button"
                          onClick={() => {
                            setConsigneeOpen(false);
                            setConsigneeMode('new');
                          }}
                          className="w-full px-4 py-3.5 text-left text-sm font-bold text-[#0A2030] hover:bg-slate-50 flex items-center gap-2 border-b border-slate-100 transition-colors cursor-pointer"
                        >
                          <span className="text-base font-bold leading-none">+</span>
                          Add new customer
                        </button>

                        {/* Search box if there are customers */}
                        {customers.length > 3 && (
                          <div className="p-2 border-b border-slate-100 bg-slate-50/60">
                            <input
                              type="text"
                              placeholder="Search customers..."
                              value={consigneeSearch}
                              onChange={(e) => setConsigneeSearch(e.target.value)}
                              className="w-full h-8 px-3 text-xs bg-white border border-slate-300 rounded-lg text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-slate-400"
                            />
                          </div>
                        )}

                        {/* Section label */}
                        <div className="px-4 py-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/60 border-b border-slate-100">
                          Customers
                        </div>

                        {/* List of customers */}
                        <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                          {filteredConsignees.length === 0 ? (
                            <div className="p-6 text-center text-xs text-slate-400">No customers found</div>
                          ) : (
                            filteredConsignees.map((c: any) => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => {
                                  setConsigneeName(c.name);
                                  if (c.phone) setConsigneePhone(c.phone);
                                  if (c.gstin) setConsigneeGstin(c.gstin);
                                  if (c.city) setToCity(c.city);
                                  if (c.pinCode || c.pin_code) setConsigneePin(c.pinCode || c.pin_code);
                                  if (c.address) setConsigneeAddress(c.address);
                                  if (c.email) setEmailTo(c.email);
                                  setConsigneeOpen(false);
                                  setMsg(null);
                                }}
                                className={`w-full px-4 py-3 text-left hover:bg-slate-50 transition-colors flex items-center justify-between cursor-pointer ${
                                  consigneeName === c.name ? 'bg-slate-100 text-[#0A2030]' : 'text-slate-800'
                                }`}
                              >
                                <div className="min-w-0 pr-2">
                                  <div className={`text-sm font-semibold truncate ${consigneeName === c.name ? 'text-[#0A2030]' : 'text-slate-900'}`}>{c.name}</div>
                                  <div className="text-xs text-slate-400 truncate mt-0.5">
                                    {[c.city || c.address, c.email].filter(Boolean).join(' · ') || c.phone || c.code || ''}
                                  </div>
                                </div>
                                {consigneeName === c.name && <Check className="w-4 h-4 text-[#0A2030] shrink-0" />}
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Selected customer summary card */}
                {consigneeName && (
                  <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1 text-xs text-slate-600">
                    <div className="flex justify-between items-center text-slate-900 font-bold text-sm">
                      <span>{consigneeName}</span>
                      <button
                        type="button"
                        onClick={() => setConsigneeMode('new')}
                        className="text-xs font-semibold text-[#0A2030] hover:underline cursor-pointer"
                      >
                        Edit details
                      </button>
                    </div>
                    {consigneeAddress && <div>{consigneeAddress}</div>}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-slate-500">
                      {toCity && <span>City: <strong className="text-slate-700">{toCity}</strong></span>}
                      {consigneePin && <span>PIN: <strong className="text-slate-700">{consigneePin}</strong></span>}
                      {consigneePhone && <span>Ph: <strong className="text-slate-700">{consigneePhone}</strong></span>}
                      {consigneeGstin && <span>GSTIN: <strong className="text-slate-700">{consigneeGstin}</strong></span>}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Add new cosignee form */
              <div className="space-y-5 pt-2">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <h3 className="text-lg font-bold text-slate-900 font-heading">Add new customer</h3>
                  <button
                    type="button"
                    onClick={() => setConsigneeMode('select')}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                  >
                    ← Back to select
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Name of Business / Customer *</label>
                    <Input value={consigneeName} onChange={(e) => setConsigneeName(e.target.value)} placeholder="e.g. Ritu Fabrics" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Address</label>
                    <Input value={consigneeAddress} onChange={(e) => setConsigneeAddress(e.target.value)} placeholder="456 King Street West" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">City / Town</label>
                      <CityInput value={toCity} onChange={setToCity} extraCities={knownCities} placeholder="Delhi" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">PIN / Postal code</label>
                      <Input value={consigneePin} onChange={(e) => setConsigneePin(e.target.value)} placeholder="110001" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">Phone</label>
                      <Input value={consigneePhone} onChange={(e) => setConsigneePhone(e.target.value)} placeholder="+91 87654 32109" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">GSTIN</label>
                      <Input value={consigneeGstin} onChange={(e) => setConsigneeGstin(e.target.value)} placeholder="29AAAA..." />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Email (for sending LR)</label>
                    <Input type="email" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder="customer@example.com" />
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setConsigneeMode('select')}
                      className="px-5 h-10 bg-[#0A2030] text-white text-xs font-bold rounded-xl hover:bg-[#071520] transition-colors cursor-pointer"
                    >
                      Save & Apply Cosignee
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );

      case 'route':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-3xl font-bold text-slate-900 tracking-tight font-heading">Route & date</h2>
              <p className="text-sm text-slate-500 mt-1 font-normal">Where is this shipment going?</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">From city (origin) *</label>
                <CityInput value={fromCity} onChange={setFromCity} extraCities={knownCities} placeholder="Mumbai" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">To city (destination) *</label>
                <CityInput value={toCity} onChange={setToCity} extraCities={knownCities} placeholder="Delhi" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Booking date</label>
                <Input type="date" value={bookingDate} onChange={(e) => setBookingDate(e.target.value)} className="w-full" />
              </div>
            </div>
          </div>
        );

      case 'shipment':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-3xl font-bold text-slate-900 tracking-tight font-heading">Shipment details</h2>
              <p className="text-sm text-slate-500 mt-1 font-normal">Goods, weight and invoice info</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Goods description</label>
                <Input value={goodsDescription} onChange={(e) => setGoodsDescription(e.target.value)} placeholder="e.g. Cotton Fabrics & Garments" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Packages</label>
                  <Input type="number" min={1} value={packageCount} onChange={(e) => setPackageCount(Number(e.target.value))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Actual wt (kg)</label>
                  <Input type="number" step="0.1" value={actualWeightKg || ''} onChange={(e) => setActualWeightKg(Number(e.target.value))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Charged wt (kg)</label>
                  <Input type="number" step="0.1" value={chargedWeightKg || ''} onChange={(e) => setChargedWeightKg(Number(e.target.value))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Method of packing</label>
                  <Input value={packingMethod} onChange={(e) => setPackingMethod(e.target.value)} placeholder="Box" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Invoice no.</label>
                  <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="INV-2026-001" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Invoice value (₹)</label>
                  <Input type="number" value={invoiceValue || ''} onChange={(e) => setInvoiceValue(Number(e.target.value))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">E-Way Bill no.</label>
                  <Input value={ewayBillNo} onChange={(e) => setEwayBillNo(e.target.value)} placeholder="optional" />
                </div>
              </div>
            </div>
          </div>
        );

      case 'transport':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-3xl font-bold text-slate-900 tracking-tight font-heading">Transport</h2>
              <p className="text-sm text-slate-500 mt-1 font-normal">Mode, carrier and tracking details</p>
            </div>
            <div className="space-y-4">
              {/* International Shipment Toggle */}
              <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                <div>
                  <label className="text-sm font-semibold text-slate-800 block cursor-pointer" onClick={() => setIsInternational(!isInternational)}>
                    International Shipment
                  </label>
                  <p className="text-xs text-slate-500 mt-0.5">Mark this LR for cross-border / international freight</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isInternational}
                  onClick={() => setIsInternational(!isInternational)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    isInternational ? 'bg-[#0A2030]' : 'bg-slate-300'
                  }`}
                  title={isInternational ? 'Disable international' : 'Enable international'}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      isInternational ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Transport mode</label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { id: 'Road' as const, label: 'Road', icon: Truck },
                    { id: 'Air' as const, label: 'Air', icon: Plane },
                    { id: 'Train' as const, label: 'Train', icon: TrainFront },
                  ].map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setTransportMode(id)}
                      className={`flex flex-col items-center justify-center gap-2 py-4 px-3 rounded-xl border transition-all text-sm font-semibold cursor-pointer ${
                        transportMode === id
                          ? 'border-[#0A2030] bg-[#0A2030]/5 text-[#0A2030] ring-1 ring-[#0A2030]'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Icon className={`w-5 h-5 ${transportMode === id ? 'text-[#0A2030]' : 'text-slate-500'}`} />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Courier network</label>
                <select
                  value={courierPartner}
                  onChange={(e) => setCourierPartner(e.target.value)}
                  className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0A2030]/10"
                >
                  {['Self Network', 'FedEx', 'DHL', 'UPS', 'Aramex', 'Blue Dart'].map((n) => <option key={n}>{n}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tracking / Waybill no.</label>
                  <Input value={trackingNo} onChange={(e) => setTrackingNo(e.target.value)} placeholder="1Z5338FF..." />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Paper LR no. (optional)</label>
                  <Input value={physicalDocketNo} onChange={(e) => setPhysicalDocketNo(e.target.value)} placeholder="BOOKLET-9988" />
                </div>
              </div>
            </div>
          </div>
        );

      case 'charges':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-3xl font-bold text-slate-900 tracking-tight font-heading">Freight charges</h2>
              <p className="text-sm text-slate-500 mt-1 font-normal">Enter tariff breakdown — grand total updates live</p>
            </div>
            <div className="space-y-3">
              {[
                { label: 'Freight amount (₹)', val: freightAmount, set: (v: number) => { setFreightAmount(v); setFreightAutoPriced(false); }, hint: freightHint },
                { label: 'Handling charge (₹)', val: handlingCharge, set: setHandlingCharge },
                { label: 'Risk charge (₹)', val: riskCharge, set: setRiskCharge },
                { label: 'Docket charge (₹)', val: docketCharge, set: setDocketCharge },
                { label: 'Pickup / Delivery (₹)', val: pickupDeliveryCharge, set: setPickupDeliveryCharge },
                { label: 'GST rate (%)', val: gstPercentage, set: setGstPercentage },
              ].map(({ label, val, set, hint }) => (
                <div key={label}>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">{label}</label>
                  <Input type="number" value={val || ''} onChange={(e) => set(e.target.value === '' ? 0 : Number(e.target.value))} />
                  {hint && <p className="text-[10px] text-blue-600 mt-0.5">{hint}</p>}
                </div>
              ))}

              <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 space-y-1.5 text-sm mt-2">
                <div className="flex justify-between text-slate-600 text-xs"><span>Subtotal</span><span>₹{subtotal.toFixed(2)}</span></div>
                {transportMode === 'Air' && (
                  <div className="flex justify-between text-amber-900 bg-amber-50 -mx-2.5 px-2.5 py-1 rounded-md border border-amber-200/80 text-xs font-medium">
                    <span>Air Service Charge (35%)</span>
                    <span className="font-semibold">₹{serviceCharge.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-600 text-xs"><span>GST ({gstPercentage}%)</span><span>₹{gstAmount.toFixed(2)}</span></div>
                <div className="flex justify-between font-bold text-slate-900 border-t border-slate-200 pt-2"><span>Grand Total</span><span className="text-[#0A2030] text-base font-bold">₹{grandTotal.toFixed(2)}</span></div>
              </div>
            </div>
          </div>
        );

      case 'payment':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-3xl font-bold text-slate-900 tracking-tight font-heading">Payment terms</h2>
              <p className="text-sm text-slate-500 mt-1 font-normal">How is this shipment being paid for?</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Payment mode</label>
                <div className="grid grid-cols-3 gap-3">
                  {(['To Pay', 'Credit', 'Paid'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => { setPaymentMode(mode as any); if (mode !== 'Paid') setPaymentMethod(''); else setExpectedMode(''); }}
                      className={`p-3 rounded-xl border text-sm font-semibold transition-all cursor-pointer ${paymentMode === mode ? 'border-[#0A2030] bg-[#0A2030]/5 text-[#0A2030] ring-1 ring-[#0A2030]' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {paymentMode === 'Paid' && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Paid via *</label>
                  <div className="grid grid-cols-3 gap-2">
                    {PAYMENT_METHODS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPaymentMethod(m)}
                        className={`p-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                          paymentMethod === m
                            ? 'border-[#0A2030] bg-[#0A2030]/5 text-[#0A2030] ring-1 ring-[#0A2030]'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {paymentMode !== 'Paid' && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Expected payment mode *</label>
                  <p className="text-xs text-slate-400 mb-2">How the customer plans to pay — used for cash flow projections.</p>
                  <div className="grid grid-cols-3 gap-2">
                    {PAYMENT_METHODS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setExpectedMode(m)}
                        className={`p-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${expectedMode === m ? 'border-[#0A2030] bg-[#0A2030]/5 text-[#0A2030] ring-1 ring-[#0A2030]' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Summary review */}
              <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 space-y-1.5 text-xs text-slate-700 mt-2">
                <div className="font-bold text-slate-900 text-sm mb-2 font-heading">Review before issuing</div>
                <div><span className="text-slate-500">Consignor:</span> <strong>{consignorName || '—'}</strong> ({fromCity || '—'})</div>
                <div><span className="text-slate-500">Consignee:</span> <strong>{consigneeName || '—'}</strong> ({toCity || '—'})</div>
                <div><span className="text-slate-500">Grand Total:</span> <strong className="text-[#0A2030]">₹{grandTotal.toFixed(2)}</strong> · {paymentMode}</div>
              </div>
            </div>
          </div>
        );
    }
  };

  // Checkpoint updating state on the final screen
  const [checkpointStatus, setCheckpointStatus] = useState<string>('Picked Up');
  const [checkpointLocation, setCheckpointLocation] = useState<string>('');
  const [checkpointDesc, setCheckpointDesc] = useState<string>('');
  const [checkpointSaving, setCheckpointSaving] = useState<boolean>(false);
  const [checkpointSaved, setCheckpointSaved] = useState<boolean>(false);
  const [checkpointError, setCheckpointError] = useState<string | null>(null);
  const [showCheckpointUpdate, setShowCheckpointUpdate] = useState<boolean>(false);

  if (issuedDocket) {
    const handleDownload = () => {
      generateInvoicePDF({
        ...issuedDocket.data,
        id: issuedDocket.id,
        docket_no: issuedDocket.docket_no,
        status: 'issued',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any);
    };

    const handleSaveCheckpoint = async () => {
      setCheckpointSaving(true);
      setCheckpointError(null);
      try {
        const res = await fetch(`/api/dockets/${issuedDocket.id}/tracking-events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: checkpointStatus,
            location: checkpointLocation || fromCity || 'Origin Hub',
            description: checkpointDesc || `Status updated to ${checkpointStatus}`,
            event_at: new Date().toISOString(),
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to update checkpoint');
        }
        setCheckpointSaved(true);
      } catch (err: any) {
        setCheckpointError(err.message || 'Failed to save checkpoint');
      } finally {
        setCheckpointSaving(false);
      }
    };

    return (
      <div className="fixed inset-0 z-50 bg-[#F8FAFC] flex flex-col animate-in fade-in duration-200">
        {/* Top Header */}
        <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
          <span className="text-xs text-slate-400 font-medium">Lorry Receipt has been created</span>
          <button
            onClick={onCreated}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-700 cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 50-50 Split Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 flex-1 min-h-0">
          {/* ── LEFT: Live LR Sheet Preview (50% screen) ── */}
          <div className="hidden lg:flex items-center justify-center bg-[#F1F5F9] p-8 overflow-hidden border-r border-slate-200">
            <div className="w-full max-w-2xl flex items-center justify-center">
              {renderLRDocumentPreview(issuedDocket.docket_no, true)}
            </div>
          </div>

          {/* ── RIGHT: Invoice summary details, tracking update & actions (50% screen) ── */}
          <div className="flex flex-col bg-white overflow-y-auto justify-between p-8 md:p-10 lg:p-12">
            <div className="max-w-xl mx-auto w-full space-y-4">
              <div>
                <h1 className="text-3xl font-bold text-slate-900 tracking-tight font-heading">
                  Your LR has been created!
                </h1>
                <p className="text-sm text-slate-500 mt-1 font-normal">
                  LR No. <span className="font-semibold text-slate-800">{issuedDocket.docket_no}</span> is ready for download and dispatch.
                </p>
              </div>

              {/* Main Summary Card */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-saas space-y-3.5">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <span className="text-xs text-slate-400 font-medium block">Consignee: {consigneeName || 'Customer'}</span>
                    <span className="text-2xl font-bold text-slate-900 tracking-tight mt-0.5 block">
                      ₹{grandTotal.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs font-semibold px-3 py-1 bg-slate-100 text-slate-700 rounded-full">
                      {bookingDate}
                    </span>
                    <span className="text-[11px] font-semibold text-[#0A2030] bg-slate-100 px-2.5 py-0.5 rounded-full">
                      {paymentMode}
                    </span>
                  </div>
                </div>

                {/* Detailed Summary Grid */}
                <div className="grid grid-cols-2 gap-3 text-xs py-1 border-b border-slate-100 pb-3">
                  <div>
                    <span className="text-slate-400 font-medium block text-[11px]">Consignor (Sender)</span>
                    <span className="text-slate-900 font-semibold mt-0.5 block">{consignorName || '—'}</span>
                    <span className="text-slate-500 text-[11px] block">{fromCity}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium block text-[11px]">Consignee (Receiver)</span>
                    <span className="text-slate-900 font-semibold mt-0.5 block">{consigneeName || '—'}</span>
                    <span className="text-slate-500 text-[11px] block">{toCity}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium block text-[11px]">Goods & Packages</span>
                    <span className="text-slate-900 font-semibold mt-0.5 block truncate">{goodsDescription || 'General Cargo'}</span>
                    <span className="text-slate-500 text-[11px] block">{packageCount} {packageCount === 1 ? 'pkg' : 'pkgs'} · {packingMethod}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium block text-[11px]">Weight & Transport</span>
                    <span className="text-slate-900 font-semibold mt-0.5 block">{chargedWeightKg || actualWeightKg || 0} kg Charged</span>
                    <span className="text-slate-500 text-[11px] block">{transportMode} · {courierPartner}</span>
                  </div>
                </div>

                {/* Financial Breakdown */}
                <div className="space-y-1.5 text-xs text-slate-600">
                  <div className="flex justify-between">
                    <span>Freight Amount</span>
                    <span>₹{freightAmount.toFixed(2)}</span>
                  </div>
                  {docketCharge > 0 && (
                    <div className="flex justify-between">
                      <span>Docket Charge</span>
                      <span>₹{docketCharge.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-1 border-t border-slate-100 text-slate-700">
                    <span>Subtotal</span>
                    <span>₹{subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-700">
                    <span>GST ({gstPercentage}%)</span>
                    <span>₹{gstAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-900 font-bold text-sm pt-1 border-t border-slate-200">
                    <span>Grand Total</span>
                    <span>₹{grandTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Instant Checkpoint Update Section */}
              <div className="bg-slate-50/80 border border-slate-200/90 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5 font-heading">
                      <Truck className="w-3.5 h-3.5 text-[#0A2030]" />
                      Update Shipment Checkpoint
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">Log immediate tracking status or location</p>
                  </div>
                  <div className="flex items-center gap-2.5">
                    {checkpointSaved && (
                      <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full flex items-center gap-1 animate-in fade-in">
                        ✓ Checkpoint Saved
                      </span>
                    )}
                    {/* Toggle Switch */}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={showCheckpointUpdate}
                      onClick={() => setShowCheckpointUpdate(!showCheckpointUpdate)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        showCheckpointUpdate ? 'bg-[#0A2030]' : 'bg-slate-300'
                      }`}
                      title={showCheckpointUpdate ? 'Disable checkpoint update' : 'Enable checkpoint update'}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                          showCheckpointUpdate ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {showCheckpointUpdate && (
                  <div className="space-y-3 pt-2 border-t border-slate-200/70 animate-in fade-in slide-in-from-top-1 duration-200">
                    {checkpointError && (
                      <div className="text-[11px] text-red-600 bg-red-50 border border-red-200 p-2 rounded-lg">
                        {checkpointError}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600 mb-1">Status</label>
                        <select
                          value={checkpointStatus}
                          onChange={(e) => { setCheckpointStatus(e.target.value); setCheckpointSaved(false); }}
                          className="w-full h-8 px-2.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0A2030]/10"
                        >
                          {DELIVERY_STATUSES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600 mb-1">Location / Hub</label>
                        <input
                          type="text"
                          value={checkpointLocation}
                          onChange={(e) => { setCheckpointLocation(e.target.value); setCheckpointSaved(false); }}
                          placeholder={fromCity ? `${fromCity} Hub` : 'e.g. Dadar Hub, Mumbai'}
                          className="w-full h-8 px-2.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0A2030]/10"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600 mb-1">Remark / Notes (optional)</label>
                      <input
                        type="text"
                        value={checkpointDesc}
                        onChange={(e) => { setCheckpointDesc(e.target.value); setCheckpointSaved(false); }}
                        placeholder="e.g. Received at origin facility, sorted for dispatch"
                        className="w-full h-8 px-2.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0A2030]/10"
                      />
                    </div>

                    <div className="pt-0.5 flex justify-end">
                      <button
                        type="button"
                        onClick={handleSaveCheckpoint}
                        disabled={checkpointSaving}
                        className="h-8 px-4 bg-[#0A2030] hover:bg-[#071520] text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                      >
                        {checkpointSaving ? 'Saving...' : checkpointSaved ? 'Update Again' : 'Save Checkpoint'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Primary Download PDF Action */}
              <div className="pt-1">
                <button
                  onClick={handleDownload}
                  className="w-full h-11 bg-[#0A2030] hover:bg-[#071520] text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-saas cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  Download PDF
                </button>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="max-w-xl mx-auto w-full pt-4 flex items-center gap-3">
              <button
                onClick={handleCreateAnother}
                className="flex-1 h-10 px-4 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer text-center"
              >
                Create another LR
              </button>
              <button
                onClick={onCreated}
                className="flex-1 h-10 px-4 bg-[#0A2030] hover:bg-[#071520] text-white font-bold text-xs rounded-xl transition-colors shadow-sm cursor-pointer text-center"
              >
                Return to dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isLastStep = currentStep === 'payment';

  return (
    <div className="fixed inset-0 z-50 bg-[#F8FAFC] flex flex-col">

      {/* Header bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
        <h1 className="text-base font-bold text-slate-900 font-heading">{isEditing ? 'Edit Lorry Receipt' : 'New Lorry Receipt'}</h1>

        <div className="flex items-center gap-3">
          {/* Draft button */}
          {!isEditing && (
            <button
              onClick={handleSaveDraft}
              disabled={draftSaving || !isDirty}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 disabled:opacity-40 transition-colors cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              {draftSaving ? 'Saving...' : 'Save draft'}
            </button>
          )}

          {/* Close / exit */}
          <button
            onClick={onBack}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-700 cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Two-column layout (50% / 50% split) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 flex-1 min-h-0">

        {/* ── LEFT: Step form (50% screen) ── */}
        <div className="flex flex-col bg-white border-r border-slate-200 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-8 md:px-12 lg:px-16 py-10">
            <div className="max-w-xl mx-auto w-full">
              {renderStepContent(currentStep)}
            </div>
          </div>

          {/* Nav footer */}
          <div className="px-8 md:px-12 lg:px-16 py-5 border-t border-slate-100 bg-white shrink-0">
            <div className="max-w-xl mx-auto w-full space-y-3">
              {/* Alert / Error message above the navigation buttons */}
              {msg && (
                <div
                  className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-150 ${
                    msg.type === 'success'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                      : 'bg-red-50 text-red-600 border border-red-100'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-current" />
                  <span>{msg.text}</span>
                </div>
              )}

              <div className="flex items-center justify-between">
                <button
                  onClick={goBack}
                  disabled={stepIndex === 0}
                  className="flex items-center gap-1.5 px-5 h-10 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  ← Back
                </button>

                {isLastStep ? (
                  <button
                    onClick={handleSubmit}
                    disabled={loading}
                    className="flex items-center gap-2 px-7 h-10 rounded-xl bg-[#0A2030] hover:bg-[#071520] text-white text-sm font-bold transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {loading ? 'Issuing...' : 'Issue Docket'}
                    {!loading && <ArrowRight className="w-4 h-4" />}
                  </button>
                ) : (
                  <button
                    onClick={goNext}
                    className="flex items-center gap-2 px-7 h-10 rounded-xl bg-[#0A2030] hover:bg-[#071520] text-white text-sm font-bold transition-colors shadow-sm cursor-pointer"
                  >
                    Next <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT: Live LR Sheet Preview (50% screen) ── */}
        <div className="hidden lg:flex items-center justify-center bg-[#F1F5F9] overflow-hidden relative p-8">
          <div className="w-full max-w-2xl flex items-center justify-center">
            {renderLRDocumentPreview()}
          </div>
        </div>
      </div>
    </div>
  );
});

export default CargoDocketForm;
