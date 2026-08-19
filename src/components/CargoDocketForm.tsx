'use client';

import { useState, useEffect, useMemo, useRef, useImperativeHandle, forwardRef } from 'react';
import { CargoDocket } from '@/types/cargo';
import { generateInvoicePDF, QuotationRateItem } from '@/lib/pdfGenerator';
import type { QuotationSheetDTO } from '@/components/QuotationView';
import { computeDocketTotals, fromPaise } from '@/lib/money';
import { PAYMENT_METHODS, type PaymentMethodLabel } from '@/lib/paymentMethod';
import { getCompanySettings } from '@/lib/companyConfig';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CityInput } from '@/components/ui/city-input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { ChevronLeft, Check, ArrowRight, Save } from 'lucide-react';

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
  const [currentStep, setCurrentStep] = useState<number>(1);
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
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'UPI' | 'Bank Transfer' | ''>(
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
    },
    gstPercentage
  );
  const subtotal = fromPaise(previewTotals.subtotalPaise);
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

  const steps = [
    { number: 1, label: 'Customer' },
    { number: 2, label: 'Shipment' },
    { number: 3, label: 'Vehicle & Transport' },
    { number: 4, label: 'Charges' },
    { number: 5, label: 'Payment' },
  ];

  const validateStep = (step: number) => {
    if (step === 1) {
      if (!consignorName.trim() || !consigneeName.trim()) {
        setMsg({ type: 'error', text: 'Consignor Name and Consignee Name are required.' });
        return false;
      }
      // Provide smart defaults for city if left blank so user isn't blocked
      if (!fromCity.trim()) setFromCity(defaultOriginCity);
      if (!toCity.trim()) setToCity('Delhi');
    } else if (step === 2) {
      if (!fromCity.trim()) setFromCity(defaultOriginCity);
      if (!toCity.trim()) setToCity('Delhi');
    } else if (step === 5) {
      if (paymentMode === 'Paid' && !paymentMethod) {
        setMsg({ type: 'error', text: 'Select how the payment was received (Cash / UPI / Bank Transfer).' });
        return false;
      }
      if (paymentMode !== 'Paid' && !expectedMode) {
        setMsg({ type: 'error', text: 'Select the payment mode the customer expects to pay with.' });
        return false;
      }
    }
    setMsg(null);
    return true;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      if (currentStep < 5) setCurrentStep(currentStep + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep(5)) return;
    setLoading(true);
    setMsg(null);

    // Same helper the API uses, so the figure shown here and the figure stored
    // on the invoice can never diverge.
    const { subtotalPaise, gstPaise, grandTotalPaise } = computeDocketTotals(
      {
        freight_amount: freightAmount,
        handling_charge: handlingCharge,
        risk_charge: riskCharge,
        docket_charge: docketCharge,
        pickup_delivery_charge: pickupDeliveryCharge,
        other_charge: otherCharge,
      },
      gstPercentage
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
        setMsg({ type: 'success', text: `Docket issued successfully! Assigned No: ${issuedDocketNo}` });

        generateInvoicePDF({
          ...newDocketPayload,
          id: data.id,
          docket_no: issuedDocketNo,
          created_by: data.created_by || data.createdBy,
          status: 'issued',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as CargoDocket);

        // An issued LR shouldn't also linger as a resumable draft.
        if (currentDraftId) {
          fetch(`/api/dockets/drafts/${currentDraftId}`, { method: 'DELETE' }).catch((err) =>
            console.error('Failed to clean up draft after issuing docket:', err)
          );
        }
        pristineSnapshotRef.current = JSON.stringify(getFormSnapshot());

        if (onCreated) onCreated();
      }
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'An error occurred.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Top Title & Back Action */}
      <div className="flex items-center gap-3">
        {onBack && (
          <Button variant="outline" size="icon" onClick={onBack} aria-label="Go back to dashboard" className="rounded-xl shadow-saas">
            <ChevronLeft className="w-4 h-4 text-slate-700" />
          </Button>
        )}
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {isEditing ? 'Edit Lorry Receipt' : 'New Lorry Receipt'}
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            {isEditing
              ? 'Correcting an issued LR — every change is recorded to its activity log.'
              : 'Fill in shipment & tariff details to issue a new LR'}
          </p>
        </div>
      </div>

      {/* 5-Step Stepper Progress Bar */}
      <div className="flex items-center justify-between px-4 py-3.5 bg-white border border-slate-200/80 rounded-2xl shadow-saas">
        {steps.map((step, idx) => {
          const isCompleted = currentStep > step.number;
          const isCurrent = currentStep === step.number;
          return (
            <div key={step.number} className="flex items-center gap-2 flex-1 justify-center">
              <div
                className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold transition-saas ${
                  isCompleted
                    ? 'bg-[#E8F7EF] text-[#1F8A4C]'
                    : isCurrent
                    ? 'bg-[#2563EB] text-white shadow-saas'
                    : 'bg-slate-100 text-slate-400 border border-slate-200/60'
                }`}
              >
                {isCompleted ? <Check className="w-4 h-4" /> : step.number}
              </div>
              <span
                className={`text-xs font-medium hidden sm:inline ${
                  isCurrent ? 'text-[#2563EB] font-semibold' : isCompleted ? 'text-slate-700' : 'text-slate-400'
                }`}
              >
                {step.label}
              </span>
              {idx < steps.length - 1 && <div className="h-0.5 w-6 sm:w-12 bg-slate-200/80 hidden md:block" />}
            </div>
          );
        })}
      </div>

      {/* Alert Message */}
      {msg && (
        <div
          className={`p-4 rounded-2xl text-xs font-semibold ${
            msg.type === 'success' ? 'bg-[#E8F7EF] text-[#1F8A4C] border border-emerald-100' : 'bg-[#FDECEC] text-[#D14343] border border-red-100'
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Main Step Form Body */}
      <Card className="border border-slate-200/80 shadow-saas bg-white rounded-2xl p-6 md:p-8">
        <CardContent className="p-0 space-y-6">
          {/* STEP 1: Customer Details */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                <h2 className="text-base font-bold text-slate-900">Customer & Party Details</h2>
                {customers.length > 0 && (
                  <span className="text-xs text-slate-500 font-medium">Auto-fill available from saved customer directory</span>
                )}
              </div>

              {/* Consignor */}
              <div className="space-y-4 p-5 bg-[#F8FAFC] border border-slate-200/80 rounded-2xl">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-bold text-slate-800 uppercase">Consignor (Sender)</h3>
                  {customers.length > 0 && (
                    <select
                      onChange={(e) => {
                        const sel = customers.find((c) => c.id === e.target.value);
                        if (sel) {
                          setConsignorName(sel.name);
                          if (sel.phone) setConsignorPhone(sel.phone);
                          if (sel.gstin) setConsignorGstin(sel.gstin);
                          if (sel.city) setFromCity(sel.city);
                          if (sel.pinCode || sel.pin_code) setConsignorPin(sel.pinCode || sel.pin_code);
                          if (sel.address) {
                            setConsignorAddress(sel.address);
                            if (!sel.city) {
                              // Extract city from address if city field is blank
                              const parts = sel.address.split(',');
                              if (parts.length > 1) {
                                const cityCandidate = parts[parts.length - 1].replace(/\d+/g, '').trim();
                                if (cityCandidate.length > 1) setFromCity(cityCandidate);
                              }
                            }
                          }
                        }
                      }}
                      className="text-[11px] bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 font-medium"
                    >
                      <option value="">Select Saved Customer...</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.code})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Consignor Name *</label>
                  <Input
                    required
                    value={consignorName}
                    onChange={(e) => setConsignorName(e.target.value)}
                    placeholder="e.g. Mehta Textiles"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Consignor Phone</label>
                    <Input
                      value={consignorPhone}
                      onChange={(e) => setConsignorPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Consignor City</label>
                    <CityInput
                      value={fromCity}
                      onChange={setFromCity}
                      extraCities={knownCities}
                      placeholder="e.g. Mumbai"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Consignor PIN Code</label>
                    <Input
                      value={consignorPin}
                      onChange={(e) => setConsignorPin(e.target.value)}
                      placeholder="400001"
                      className="font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Consignor Address</label>
                  <Input
                    value={consignorAddress}
                    onChange={(e) => setConsignorAddress(e.target.value)}
                    placeholder="Street, City, State"
                  />
                </div>
              </div>

              {/* Consignee */}
              <div className="space-y-3 p-4 bg-slate-50 border border-slate-200/80 rounded-xl">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-bold text-slate-800 uppercase">Consignee (Receiver)</h3>
                  {customers.length > 0 && (
                    <select
                      onChange={(e) => {
                        const sel = customers.find((c) => c.id === e.target.value);
                        if (sel) {
                          setConsigneeName(sel.name);
                          if (sel.phone) setConsigneePhone(sel.phone);
                          if (sel.gstin) setConsigneeGstin(sel.gstin);
                          if (sel.city) setToCity(sel.city);
                          if (sel.pinCode || sel.pin_code) setConsigneePin(sel.pinCode || sel.pin_code);
                          if (sel.address) {
                            setConsigneeAddress(sel.address);
                            if (!sel.city) {
                              const parts = sel.address.split(',');
                              if (parts.length > 1) {
                                const cityCandidate = parts[parts.length - 1].replace(/\d+/g, '').trim();
                                if (cityCandidate.length > 1) setToCity(cityCandidate);
                              }
                            }
                          }
                        }
                      }}
                      className="text-[11px] bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 font-medium"
                    >
                      <option value="">Select Saved Customer...</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.code})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Consignee Name *</label>
                  <Input
                    required
                    value={consigneeName}
                    onChange={(e) => setConsigneeName(e.target.value)}
                    placeholder="e.g. Ritu Fabrics"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Consignee Phone</label>
                    <Input
                      value={consigneePhone}
                      onChange={(e) => setConsigneePhone(e.target.value)}
                      placeholder="+91 87654 32109"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Consignee City</label>
                    <CityInput
                      value={toCity}
                      onChange={setToCity}
                      extraCities={knownCities}
                      placeholder="e.g. Pune"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Consignee PIN Code</label>
                    <Input
                      value={consigneePin}
                      onChange={(e) => setConsigneePin(e.target.value)}
                      placeholder="411001"
                      className="font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Consignee Address</label>
                  <Input
                    value={consigneeAddress}
                    onChange={(e) => setConsigneeAddress(e.target.value)}
                    placeholder="Street, City, State"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Shipment Details */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <h2 className="text-sm font-bold text-slate-900 pb-2 border-b border-slate-100">Shipment Specifications</h2>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">From City (Origin) *</label>
                  <CityInput required value={fromCity} onChange={setFromCity} extraCities={knownCities} placeholder="e.g. Mumbai" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">To City (Destination) *</label>
                  <CityInput required value={toCity} onChange={setToCity} extraCities={knownCities} placeholder="e.g. Pune" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Booking Date</label>
                  <Input type="date" value={bookingDate} onChange={(e) => setBookingDate(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Package Count</label>
                  <Input type="number" min={1} value={packageCount} onChange={(e) => setPackageCount(Number(e.target.value))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Invoice No</label>
                  <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="INV-2026-001" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Actual Weight (kg)</label>
                  <Input type="number" step="0.1" value={actualWeightKg} onChange={(e) => setActualWeightKg(Number(e.target.value))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Charged Weight (kg)</label>
                  <Input type="number" step="0.1" value={chargedWeightKg} onChange={(e) => setChargedWeightKg(Number(e.target.value))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Invoice Value (₹)</label>
                  <Input type="number" value={invoiceValue} onChange={(e) => setInvoiceValue(Number(e.target.value))} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Method of Packing</label>
                  <Input value={packingMethod} onChange={(e) => setPackingMethod(e.target.value)} placeholder="Box" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Goods Description</label>
                  <Input value={goodsDescription} onChange={(e) => setGoodsDescription(e.target.value)} placeholder="e.g. Cotton Fabrics & Garments" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">E-Way Bill No. (optional)</label>
                  <Input value={ewayBillNo} onChange={(e) => setEwayBillNo(e.target.value)} placeholder="e.g. 1234 5678 9012" />
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Transport & Vehicle */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <h2 className="text-sm font-bold text-slate-900 pb-2 border-b border-slate-100">Transport & Vehicle Details</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Transport Mode</label>
                  <select
                    value={transportMode}
                    onChange={(e) => setTransportMode(e.target.value as any)}
                    className="w-full h-9 px-3 bg-white border border-slate-200 rounded-md text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-950/10"
                  >
                    <option value="Road">Road Freight</option>
                    <option value="Air">Air Express</option>
                    <option value="Train">Train Cargo</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Courier Network</label>
                  <select
                    value={courierPartner}
                    onChange={(e) => setCourierPartner(e.target.value)}
                    className="w-full h-9 px-3 bg-white border border-slate-200 rounded-md text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-950/10"
                  >
                    <option value="Self Network">Self Network</option>
                    <option value="FedEx">FedEx</option>
                    <option value="DHL">DHL</option>
                    <option value="UPS">UPS</option>
                    <option value="Aramex">Aramex</option>
                    <option value="Blue Dart">Blue Dart</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Physical Paper Booklet LR No (Optional)</label>
                  <Input value={physicalDocketNo} onChange={(e) => setPhysicalDocketNo(e.target.value)} placeholder="e.g. BOOKLET-9988" className="font-mono" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Courier Tracking / Waybill No (Optional)</label>
                  <Input value={trackingNo} onChange={(e) => setTrackingNo(e.target.value)} placeholder="e.g. 1Z5338FF0107231059" className="font-mono" />
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Charges Breakdown */}
          {currentStep === 4 && (
            <div className="space-y-4">
              <h2 className="text-sm font-bold text-slate-900 pb-2 border-b border-slate-100">Freight & Tariff Charges</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Freight Amount (₹)</label>
                  <Input
                    type="number"
                    value={freightAmount === 0 ? '' : freightAmount}
                    onChange={(e) => {
                      setFreightAmount(e.target.value === '' ? 0 : Number(e.target.value));
                      setFreightAutoPriced(false);
                    }}
                  />
                  {freightHint && <p className="text-[10px] text-blue-600 font-medium mt-1">{freightHint}</p>}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Handling Charge (₹)</label>
                  <Input type="number" value={handlingCharge === 0 ? '' : handlingCharge} onChange={(e) => setHandlingCharge(e.target.value === '' ? 0 : Number(e.target.value))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Risk Charge (₹)</label>
                  <Input type="number" value={riskCharge === 0 ? '' : riskCharge} onChange={(e) => setRiskCharge(e.target.value === '' ? 0 : Number(e.target.value))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Docket Charge (₹)</label>
                  <Input type="number" value={docketCharge === 0 ? '' : docketCharge} onChange={(e) => setDocketCharge(e.target.value === '' ? 0 : Number(e.target.value))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Pickup/Delivery (₹)</label>
                  <Input type="number" value={pickupDeliveryCharge === 0 ? '' : pickupDeliveryCharge} onChange={(e) => setPickupDeliveryCharge(e.target.value === '' ? 0 : Number(e.target.value))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">GST Rate (%)</label>
                  <Input type="number" value={gstPercentage === 0 ? '' : gstPercentage} onChange={(e) => setGstPercentage(e.target.value === '' ? 0 : Number(e.target.value))} />
                </div>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal Charges:</span>
                  <span className="font-mono">₹{subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>GST Amount ({gstPercentage}%):</span>
                  <span className="font-mono">₹{gstAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-slate-900 pt-1 border-t border-slate-200 text-sm">
                  <span>Grand Total Amount:</span>
                  <span className="font-mono text-[#2563EB]">₹{grandTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: Payment & Issue */}
          {currentStep === 5 && (
            <div className="space-y-4">
              <h2 className="text-sm font-bold text-slate-900 pb-2 border-b border-slate-100">Payment Terms & Issue Confirmation</h2>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-2">Payment Mode</label>
                <div className="grid grid-cols-3 gap-3">
                  {(['To Pay', 'Credit', 'Paid'] as const).map((mode) => (
                    <button
                      type="button"
                      key={mode}
                      onClick={() => {
                        setPaymentMode(mode as any);
                        if (mode !== 'Paid') setPaymentMethod('');
                        else setExpectedMode('');
                      }}
                      className={`p-3 rounded-xl border text-xs font-medium transition-all ${
                        paymentMode === mode
                          ? 'border-[#2563EB] bg-blue-50 text-[#2563EB] font-bold ring-1 ring-[#2563EB]'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {paymentMode === 'Paid' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-2">Paid Via *</label>
                  <div className="grid grid-cols-3 gap-3">
                    {(['Cash', 'UPI', 'Bank Transfer'] as const).map((method) => (
                      <button
                        type="button"
                        key={method}
                        onClick={() => setPaymentMethod(method)}
                        className={`p-3 rounded-xl border text-xs font-medium transition-all ${
                          paymentMethod === method
                            ? 'border-[#2563EB] bg-blue-50 text-[#2563EB] font-bold ring-1 ring-[#2563EB]'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {method}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {paymentMode !== 'Paid' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-2">Expected Payment Mode *</label>
                  <p className="text-[11px] text-slate-500 mb-2">How the customer says they'll pay — used for the projected Cash Expected/Pending figure, not a confirmed collection.</p>
                  <div className="grid grid-cols-3 gap-3">
                    {PAYMENT_METHODS.map((method) => (
                      <button
                        type="button"
                        key={method}
                        onClick={() => setExpectedMode(method)}
                        className={`p-3 rounded-xl border text-xs font-medium transition-all ${
                          expectedMode === method
                            ? 'border-[#2563EB] bg-blue-50 text-[#2563EB] font-bold ring-1 ring-[#2563EB]'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {method}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-xl space-y-2 text-xs text-slate-700">
                <div className="font-semibold text-slate-900">Summary Review</div>
                <div>Consignor: <strong className="text-slate-900">{consignorName || 'N/A'}</strong> ({fromCity || 'N/A'})</div>
                <div>Consignee: <strong className="text-slate-900">{consigneeName || 'N/A'}</strong> ({toCity || 'N/A'})</div>
                <div>Grand Total: <strong className="text-[#2563EB] font-mono">₹{grandTotal.toFixed(2)}</strong> ({paymentMode}{paymentMode === 'Paid' && paymentMethod ? ` · ${paymentMethod}` : ''}{paymentMode !== 'Paid' && expectedMode ? ` · expects ${expectedMode}` : ''})</div>
              </div>
            </div>
          )}

          {/* Stepper Navigation Actions */}
          <div className="flex justify-between items-center pt-4 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handlePrev}
                disabled={currentStep === 1}
                className="px-5"
              >
                Previous
              </Button>
              {!isEditing && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSaveDraft}
                  disabled={draftSaving || !isDirty}
                  className="px-4 gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  {draftSaving ? 'Saving...' : 'Save as Draft'}
                </Button>
              )}
            </div>

            {currentStep < 5 ? (
              <Button type="button" size="sm" onClick={handleNext} className="px-6 bg-[#2563EB] hover:bg-blue-700">
                Continue
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className="px-6 bg-[#2563EB] hover:bg-blue-700 font-bold"
              >
                {isEditing
                  ? loading
                    ? 'Saving...'
                    : 'Save Changes'
                  : loading
                  ? 'Issuing Docket...'
                  : 'Issue Docket & Generate PDF'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
});

export default CargoDocketForm;
