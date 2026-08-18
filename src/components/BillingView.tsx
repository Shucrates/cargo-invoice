'use client';

import { useState, useEffect, useMemo, useRef, forwardRef, useImperativeHandle, Fragment, type ReactNode } from 'react';
import {
  FileText,
  Printer,
  Download,
  Check,
  DollarSign,
  Smartphone,
  Archive,
  History,
  PlusCircle,
  Loader2,
  ArrowLeft,
  Plus,
  Trash2,
  Eye,
  Receipt,
  Search,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CityInput } from '@/components/ui/city-input';
import { Badge } from '@/components/ui/badge';
import { CargoDocket, Customer, Bill, BillDraft, BillCustomLineItem } from '@/types/cargo';
import { CompanySettings, DEFAULT_COMPANY_SETTINGS, getCompanySettings } from '@/lib/companyConfig';
import { generateBillPDF, BillLineDocket } from '@/lib/pdfGenerator';
import { formatCreatedAt } from '@/lib/formatDate';
import BillDraftList from '@/components/BillDraftList';
import type { QuotationSheetDTO } from '@/components/QuotationView';

interface BillingViewProps {
  dockets: CargoDocket[];
  customers: Customer[];
}

/** Imperative handle so a parent can check for unsaved changes and trigger a
 *  draft save before navigating away, without lifting all form state up. */
export interface BillingViewHandle {
  isDirty: boolean;
  saveAsDraft: () => Promise<boolean>;
}

type BillingSubTab = 'history' | 'new' | 'drafts';

function numberToWordsIndian(num: number): string {
  if (!num || isNaN(num)) return 'Zero Rupees Only.';
  const integerPart = Math.floor(Math.abs(num));

  const a = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function inWords(n: number): string {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : '');
    if (n < 1000) return a[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' ' + inWords(n % 100) : '');
    if (n < 100000) return inWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 !== 0 ? ' ' + inWords(n % 1000) : '');
    if (n < 10000000) return inWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 !== 0 ? ' ' + inWords(n % 100000) : '');
    return inWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 !== 0 ? ' ' + inWords(n % 10000000) : '');
  }

  const result = inWords(integerPart);
  return `${result} Rupees Only.`;
}

const BillingView = forwardRef<BillingViewHandle, BillingViewProps>(function BillingView(
  { dockets, customers },
  ref
) {
  const [subTab, setSubTab] = useState<BillingSubTab>('history');
  const [pendingSubTab, setPendingSubTab] = useState<BillingSubTab | null>(null);
  const [leaveSaving, setLeaveSaving] = useState(false);
  const [settings, setSettings] = useState<CompanySettings>(DEFAULT_COMPANY_SETTINGS);

  // History State
  const [bills, setBills] = useState<Bill[]>([]);
  const [loadingBills, setLoadingBills] = useState(true);
  const [billSearch, setBillSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedDockets, setExpandedDockets] = useState<BillLineDocket[]>([]);
  const [expandLoading, setExpandLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Bill | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Form State
  const [billNo, setBillNo] = useState<string>('');
  const [invoiceDate, setInvoiceDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState<string>('B2B');
  const [docType, setDocType] = useState<string>('INV');
  const [isServices, setIsServices] = useState<string>('YES');
  const [reverseCharge, setReverseCharge] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>('');

  // Customer State
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');
  const [customerGstin, setCustomerGstin] = useState<string>('');
  const [customerAddress, setCustomerAddress] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [customerEmail, setCustomerEmail] = useState<string>('');

  // Line Items State
  const [selectedDocketIds, setSelectedDocketIds] = useState<string[]>([]);
  const [customItems, setCustomItems] = useState<BillCustomLineItem[]>([]);

  // Quotation sheets, used to auto-price custom line items from origin city +
  // destination + transport mode, same as the LR booking form.
  const [quotationSheets, setQuotationSheets] = useState<QuotationSheetDTO[]>([]);
  // Cities already used in quotation sheets or existing dockets, surfaced first in city autocomplete.
  const knownCities = useMemo(() => {
    const fromSheets = quotationSheets.map((s) => s.origin_city);
    const fromDockets = dockets.flatMap((d) => [d.from_city, d.to_city]);
    return [...fromSheets, ...fromDockets].filter(Boolean) as string[];
  }, [quotationSheets, dockets]);
  const [addRateItemId, setAddRateItemId] = useState<string | null>(null);
  const [newRateValue, setNewRateValue] = useState<string>('');
  const [addingRate, setAddingRate] = useState(false);

  // Financials State
  const [gstPercentage, setGstPercentage] = useState<number>(18);
  const [discount, setDiscount] = useState<number>(0);
  const [manualSubtotal, setManualSubtotal] = useState<string>('');
  const [manualGstAmount, setManualGstAmount] = useState<string>('');

  // Operational State
  const [billedDocketIds, setBilledDocketIds] = useState<Set<string>>(new Set());
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [issuedBill, setIssuedBill] = useState<Bill | null>(null);
  const [isPreviewing, setIsPreviewing] = useState<boolean>(false);
  const [billStep, setBillStep] = useState<number>(1);

  useEffect(() => {
    setSettings(getCompanySettings());
    fetchBills();
    refreshBilledIds();
    fetch('/api/quotations')
      .then((res) => (res.ok ? res.json() : { sheets: [] }))
      .then((data) => setQuotationSheets(data.sheets || []))
      .catch((err) => console.error('Failed to load quotation sheets:', err));
  }, []);

  /** Picks the quotation sheet to price a line item from: prefer the Default
   *  sheet whose origin city matches, falling back to the Default sheet for
   *  this transport mode regardless of city (single-city installs). */
  const pickQuotationSheet = (sheetType: 'ROAD_RAIL' | 'AIR', originCity: string): QuotationSheetDTO | null => {
    const ofType = quotationSheets.filter((s) => s.sheet_type === sheetType);
    const cityMatch = ofType.filter((s) => s.origin_city.trim().toLowerCase() === originCity.trim().toLowerCase());
    return cityMatch.find((s) => s.is_default) || cityMatch[0] || ofType.find((s) => s.is_default) || null;
  };

  /** Looks up the quotation-sheet rate for a custom line item's route/mode
   *  and reports back what to show the user — a computed price, a prompt to
   *  enter weight, or "no value mentioned" with the sheet/route to add one to. */
  const describeItemPricing = (
    item: BillCustomLineItem
  ): { hint: string; computedAmount?: number; canAddRate?: { sheetId: string; destination: string; mode: string } } | null => {
    const destination = (item.to_city || '').trim();
    if (!destination) return null;

    const sheetType: 'ROAD_RAIL' | 'AIR' = item.transport_mode === 'Air' ? 'AIR' : 'ROAD_RAIL';
    const originCity = (item.from_city || settings.defaultOriginCity || 'Mumbai').trim();
    const sheet = pickQuotationSheet(sheetType, originCity);
    if (!sheet) {
      return { hint: `No quotation sheet found for origin city "${originCity}".` };
    }

    const wantMode = item.transport_mode === 'Air' ? 'BY AIR' : item.transport_mode === 'Train' ? 'BY RAIL' : 'BY ROAD';
    const match = (sheet.rates || []).find(
      (r) => r.destination.trim().toUpperCase() === destination.toUpperCase() && r.mode === wantMode
    );

    if (!match) {
      return {
        hint: `No value mentioned in quotation sheet "${sheet.name}" for ${destination}.`,
        canAddRate: { sheetId: sheet.id, destination, mode: wantMode },
      };
    }

    const billableKg = Number(item.charged_weight_kg) || 0;
    if (billableKg <= 0) {
      return { hint: `₹${match.ratePerKg}/kg available from "${sheet.name}" — enter weight to auto-price.` };
    }

    const computed = Math.round(match.ratePerKg * billableKg);
    return {
      hint: `Auto-priced from "${sheet.name}": ₹${match.ratePerKg}/kg × ${billableKg}kg = ₹${computed}`,
      computedAmount: computed,
    };
  };

  // Keep every custom item's amount in sync with its quotation-sheet price
  // as long as it's still auto-priced (or untouched at ₹0); a manual edit to
  // `amount` clears amount_auto so this stops overwriting it.
  useEffect(() => {
    if (quotationSheets.length === 0) return;
    setCustomItems((prev) => {
      let changed = false;
      const next = prev.map((item) => {
        const priced = describeItemPricing(item);
        if (!priced?.computedAmount) return item;
        if ((item.amount_auto || !item.amount) && item.amount !== priced.computedAmount) {
          changed = true;
          return { ...item, amount: priced.computedAmount, amount_auto: true };
        }
        return item;
      });
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customItems, quotationSheets]);

  const handleAddMissingRate = async (itemId: string, sheetId: string, destination: string, mode: string) => {
    const rate = Number(newRateValue);
    if (!rate || rate <= 0) return;
    const sheet = quotationSheets.find((s) => s.id === sheetId);
    if (!sheet) return;
    setAddingRate(true);
    try {
      const rates = [...(sheet.rates || []), { destination, ratePerKg: rate, mode }];
      const res = await fetch(`/api/quotations/${sheetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rates }),
      });
      if (res.ok) {
        const updated: QuotationSheetDTO = await res.json();
        setQuotationSheets((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
        setAddRateItemId(null);
        setNewRateValue('');
      }
    } catch (err) {
      console.error('Failed to add quotation rate:', err);
    } finally {
      setAddingRate(false);
    }
  };

  const fetchBills = async () => {
    setLoadingBills(true);
    try {
      const res = await fetch('/api/billing?limit=300');
      if (res.ok) {
        const data = await res.json();
        const loadedBills = (data.bills ?? []) as Bill[];
        setBills(loadedBills);
        const ids = new Set<string>(loadedBills.flatMap((b) => b.docket_ids || []));
        setBilledDocketIds(ids);
      }
    } catch (err) {
      console.error('Failed to fetch bills:', err);
    } finally {
      setLoadingBills(false);
    }
  };

  const refreshBilledIds = async () => {
    try {
      const res = await fetch('/api/billing?limit=500');
      if (res.ok) {
        const data = await res.json();
        const ids = new Set<string>((data.bills ?? []).flatMap((b: Bill) => b.docket_ids || []));
        setBilledDocketIds(ids);
      }
    } catch (err) {
      console.error('Failed to load billed LR ids:', err);
    }
  };

  const handleCustomerSelect = (custId: string) => {
    setSelectedCustomerId(custId);
    if (!custId) return;
    const cust = customers.find((c) => c.id === custId);
    if (cust) {
      setCustomerName(cust.name);
      setCustomerGstin(cust.gstin || '');
      setCustomerAddress(cust.address ? `${cust.address}, ${cust.city || ''}` : cust.city || '');
      setCustomerPhone(cust.phone || '');
      setCustomerEmail(cust.email || '');
    }
  };

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId) || null;

  // Available unbilled dockets matching the selected customer (by customer
  // code, the reliable link) or, failing that, a name match against
  // consignor/consignee — covers LRs booked before a Customer record linked them.
  const availableDockets = dockets.filter((d) => {
    if (d.status !== 'issued') return false;
    if (billedDocketIds.has(d.id) && !selectedDocketIds.includes(d.id)) return false;
    if (selectedCustomer) {
      if (selectedCustomer.code && d.customer_code === selectedCustomer.code) return true;
      return (
        d.consignor_name.toLowerCase().includes(selectedCustomer.name.toLowerCase()) ||
        d.consignee_name.toLowerCase().includes(selectedCustomer.name.toLowerCase())
      );
    }
    if (!customerName) return true;
    return (
      d.consignor_name.toLowerCase().includes(customerName.toLowerCase()) ||
      d.consignee_name.toLowerCase().includes(customerName.toLowerCase())
    );
  });

  const selectedDockets = dockets.filter((d) => selectedDocketIds.includes(d.id));

  // Compute subtotal from selected dockets + custom manual items
  const docketsSubtotal = selectedDockets.reduce((sum, d) => sum + Number(d.subtotal || d.grand_total || 0), 0);
  const customItemsSubtotal = customItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const calculatedSubtotal = docketsSubtotal + customItemsSubtotal;

  const subtotal = manualSubtotal !== '' ? Number(manualSubtotal) || 0 : calculatedSubtotal;
  const calculatedGst = Math.round((subtotal - discount) * (gstPercentage / 100));
  const gstAmount = manualGstAmount !== '' ? Number(manualGstAmount) || 0 : calculatedGst;

  const totalWithGst = subtotal - discount + gstAmount;
  const grandTotal = Math.round(totalWithGst);
  const roundOff = Number((grandTotal - totalWithGst).toFixed(2));
  const amountInWords = numberToWordsIndian(grandTotal);

  // Line item helpers
  const handleAddCustomItem = () => {
    setCustomItems((prev) => [
      ...prev,
      {
        id: `manual-${Date.now()}-${prev.length + 1}`,
        booking_date: invoiceDate,
        docket_no: `LR-${String(prev.length + 1).padStart(3, '0')}`,
        particulars: 'Freight Charges',
        from_city: settings.defaultOriginCity || 'Mumbai',
        to_city: '',
        transport_mode: 'Road',
        package_count: 1,
        invoice_no: '',
        charged_weight_kg: 0,
        amount: 0,
        amount_auto: true,
      },
    ]);
  };

  const handleUpdateCustomItem = (idx: number, field: keyof BillCustomLineItem, value: any) => {
    setCustomItems((prev) => {
      const copy = [...prev];
      const updated: BillCustomLineItem = { ...copy[idx], [field]: value };
      if (field === 'amount') updated.amount_auto = false;
      copy[idx] = updated;
      return copy;
    });
  };

  const handleRemoveCustomItem = (idx: number) => {
    setCustomItems((prev) => prev.filter((_, i) => i !== idx));
  };

  // Snapshot of every field a draft needs, keyed the same way the drafts API
  // expects. Reused for dirty-checking and "Save as Draft" so they can never
  // drift apart.
  const getBillFormSnapshot = () => ({
    bill_no: billNo,
    invoice_date: invoiceDate,
    category,
    doc_type: docType,
    is_services: isServices,
    reverse_charge: reverseCharge,
    notes,
    customer_id: selectedCustomerId,
    customer_name: customerName,
    customer_gstin: customerGstin,
    customer_address: customerAddress,
    customer_phone: customerPhone,
    customer_email: customerEmail,
    docket_ids: selectedDocketIds,
    items: customItems,
    gst_percentage: gstPercentage,
    discount,
    manual_subtotal: manualSubtotal,
    manual_gst_amount: manualGstAmount,
  });

  // Captured on mount (blank form) and whenever the baseline changes (reset,
  // draft loaded, draft saved) so later renders can tell whether anything has
  // actually changed. A just-issued bill is never "unsaved", regardless of
  // snapshot drift.
  const pristineSnapshotRef = useRef<string>(JSON.stringify(getBillFormSnapshot()));
  const isDirty = !issuedBill && JSON.stringify(getBillFormSnapshot()) !== pristineSnapshotRef.current;

  // Always-fresh refs for the beforeunload handler below, which is registered
  // once and must never read stale closure state.
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  const snapshotRef = useRef(getBillFormSnapshot);
  snapshotRef.current = getBillFormSnapshot;

  const resetForm = () => {
    const blank = {
      bill_no: '',
      invoice_date: new Date().toISOString().split('T')[0],
      category: 'B2B',
      doc_type: 'INV',
      is_services: 'YES',
      reverse_charge: false,
      notes: '',
      customer_id: '',
      customer_name: '',
      customer_gstin: '',
      customer_address: '',
      customer_phone: '',
      customer_email: '',
      docket_ids: [] as string[],
      items: [] as BillCustomLineItem[],
      gst_percentage: 18,
      discount: 0,
      manual_subtotal: '',
      manual_gst_amount: '',
    };
    setBillNo(blank.bill_no);
    setInvoiceDate(blank.invoice_date);
    setCategory(blank.category);
    setDocType(blank.doc_type);
    setIsServices(blank.is_services);
    setReverseCharge(blank.reverse_charge);
    setNotes(blank.notes);
    setSelectedCustomerId(blank.customer_id);
    setCustomerName(blank.customer_name);
    setCustomerGstin(blank.customer_gstin);
    setCustomerAddress(blank.customer_address);
    setCustomerPhone(blank.customer_phone);
    setCustomerEmail(blank.customer_email);
    setSelectedDocketIds(blank.docket_ids);
    setCustomItems(blank.items);
    setGstPercentage(blank.gst_percentage);
    setDiscount(blank.discount);
    setManualSubtotal(blank.manual_subtotal);
    setManualGstAmount(blank.manual_gst_amount);
    setEditingDraftId(null);
    setIssuedBill(null);
    setIssueError(null);
    setIsPreviewing(false);
    setBillStep(1);
    pristineSnapshotRef.current = JSON.stringify(blank);
  };

  const handleLoadDraft = (draft: BillDraft) => {
    const d = draft.data || {};
    const loaded = {
      bill_no: d.bill_no || '',
      invoice_date: d.invoice_date || new Date().toISOString().split('T')[0],
      category: d.category || 'B2B',
      doc_type: d.doc_type || 'INV',
      is_services: d.is_services ? 'YES' : 'NO',
      reverse_charge: Boolean(d.reverse_charge),
      notes: d.notes || '',
      customer_id: d.customer_id || '',
      customer_name: d.customer_name || '',
      customer_gstin: d.customer_gstin || '',
      customer_address: d.customer_address || '',
      customer_phone: d.customer_phone || '',
      customer_email: d.customer_email || '',
      docket_ids: Array.isArray(d.docket_ids) ? d.docket_ids : [],
      items: Array.isArray(d.items) ? d.items : [],
      gst_percentage: Number(d.gst_percentage) || 18,
      discount: Number(d.discount) || 0,
      manual_subtotal: d.manual_subtotal !== undefined ? String(d.manual_subtotal) : '',
      manual_gst_amount: d.manual_gst_amount !== undefined ? String(d.manual_gst_amount) : '',
    };
    setBillNo(loaded.bill_no);
    setInvoiceDate(loaded.invoice_date);
    setCategory(loaded.category);
    setDocType(loaded.doc_type);
    setIsServices(loaded.is_services);
    setReverseCharge(loaded.reverse_charge);
    setNotes(loaded.notes);
    setSelectedCustomerId(loaded.customer_id);
    setCustomerName(loaded.customer_name);
    setCustomerGstin(loaded.customer_gstin);
    setCustomerAddress(loaded.customer_address);
    setCustomerPhone(loaded.customer_phone);
    setCustomerEmail(loaded.customer_email);
    setSelectedDocketIds(loaded.docket_ids);
    setCustomItems(loaded.items);
    setGstPercentage(loaded.gst_percentage);
    setDiscount(loaded.discount);
    setManualSubtotal(loaded.manual_subtotal);
    setManualGstAmount(loaded.manual_gst_amount);
    setEditingDraftId(draft.id);
    setIssuedBill(null);
    setIssueError(null);
    setBillStep(1);
    setSubTab('new');
    pristineSnapshotRef.current = JSON.stringify(loaded);
  };

  /** Persists the current form as a draft without changing sub-tabs — used by
   *  both the manual "Save Draft" button and the unsaved-changes exit guard. */
  const persistDraft = async (): Promise<boolean> => {
    try {
      const snapshot = getBillFormSnapshot();
      const body = {
        bill_no: snapshot.bill_no,
        customer_id: snapshot.customer_id || null,
        customer_name: snapshot.customer_name,
        customer_gstin: snapshot.customer_gstin,
        customer_address: snapshot.customer_address,
        customer_phone: snapshot.customer_phone,
        customer_email: snapshot.customer_email,
        docket_ids: snapshot.docket_ids,
        items: snapshot.items,
        invoice_date: snapshot.invoice_date,
        category: snapshot.category,
        doc_type: snapshot.doc_type,
        is_services: snapshot.is_services === 'YES',
        reverse_charge: snapshot.reverse_charge,
        notes: snapshot.notes,
        gst_percentage: snapshot.gst_percentage,
        discount: snapshot.discount,
        manual_subtotal: snapshot.manual_subtotal,
        manual_gst_amount: snapshot.manual_gst_amount,
      };

      const res = await fetch(
        editingDraftId ? `/api/billing/drafts/${editingDraftId}` : '/api/billing/drafts',
        {
          method: editingDraftId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) return false;
      const saved = await res.json();
      setEditingDraftId(saved.id);
      pristineSnapshotRef.current = JSON.stringify(snapshot);
      return true;
    } catch (err) {
      console.error('Failed to save bill draft:', err);
      return false;
    }
  };

  useImperativeHandle(ref, () => ({ isDirty, saveAsDraft: persistDraft }));

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
        navigator.sendBeacon('/api/billing/drafts', blob);
      } catch (err) {
        console.error('Failed to beacon bill draft snapshot:', err);
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  const handleSaveDraft = async () => {
    setSavingDraft(true);
    const ok = await persistDraft();
    setSavingDraft(false);
    if (ok) setSubTab('drafts');
  };

  /** Guards sub-tab switches away from a dirty "New Bill" form: prompts to
   *  save/discard instead of silently dropping in-progress work. */
  const attemptSubTabChange = (target: BillingSubTab) => {
    if (subTab === 'new' && isDirty) {
      setPendingSubTab(target);
      return;
    }
    if (target === 'new') resetForm();
    setSubTab(target);
  };

  const resolvePendingSubTab = async (action: 'save' | 'discard' | 'cancel') => {
    if (action === 'cancel') {
      setPendingSubTab(null);
      return;
    }
    if (action === 'save') {
      setLeaveSaving(true);
      await persistDraft();
      setLeaveSaving(false);
    }
    const target = pendingSubTab;
    setPendingSubTab(null);
    resetForm(); // clears the in-progress form so it isn't half-kept in memory, whether saved or discarded
    if (target) setSubTab(target);
  };

  const handleIssueBill = async () => {
    setIssueError(null);
    if (selectedDocketIds.length === 0 && customItems.length === 0) {
      setIssueError('Add at least one custom line item or select an LR to bill.');
      return;
    }

    let resolvedCustomerName = customerName.trim();
    if (!resolvedCustomerName && selectedDocketIds.length > 0) {
      const firstDoc = dockets.find((d) => selectedDocketIds.includes(d.id));
      if (firstDoc?.consignor_name) {
        resolvedCustomerName = firstDoc.consignor_name;
        setCustomerName(resolvedCustomerName);
        if (!customerGstin && firstDoc.consignor_gstin) setCustomerGstin(firstDoc.consignor_gstin);
        if (!customerAddress && firstDoc.consignor_address) setCustomerAddress(firstDoc.consignor_address);
        if (!customerPhone && firstDoc.consignor_phone) setCustomerPhone(firstDoc.consignor_phone);
      }
    }

    if (!resolvedCustomerName) {
      setIssueError('Enter or select a Customer / Party Name before issuing the bill.');
      return;
    }

    setIssuing(true);
    try {
      const res = await fetch('/api/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bill_no: billNo.trim() || undefined,
          customer_id: selectedCustomerId || null,
          customer_name: resolvedCustomerName,
          customer_gstin: customerGstin.trim(),
          customer_address: customerAddress.trim(),
          customer_phone: customerPhone.trim(),
          customer_email: customerEmail.trim(),
          docket_ids: selectedDocketIds,
          items: customItems,
          invoice_date: invoiceDate,
          category,
          doc_type: docType,
          is_services: isServices === 'YES',
          reverse_charge: reverseCharge,
          notes: notes.trim(),
          subtotal,
          discount,
          gst_percentage: gstPercentage,
          gst_amount: gstAmount,
          round_off: roundOff,
          grand_total: grandTotal,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setIssueError(data.error || 'Failed to issue bill.');
        return;
      }

      if (editingDraftId) {
        await fetch(`/api/billing/drafts/${editingDraftId}`, { method: 'DELETE' }).catch(() => {});
      }

      setIssuedBill(data as Bill);
      setEditingDraftId(null);
      fetchBills();
    } catch (err) {
      console.error('Failed to issue bill:', err);
      setIssueError('Failed to issue bill. Please try again.');
    } finally {
      setIssuing(false);
    }
  };

  const handleDownloadIssuedBill = () => {
    if (!issuedBill) return;
    const combinedLines: BillLineDocket[] = [
      ...selectedDockets.map((d) => ({
        docket_no: d.docket_no,
        booking_date: d.booking_date,
        from_city: d.from_city,
        to_city: d.to_city,
        consignor_name: d.consignor_name,
        package_count: d.articles_count || d.package_count,
        invoice_no: d.invoice_no,
        charged_weight_kg: Number(d.charged_weight_kg) || 0,
        grand_total: Number(d.grand_total) || 0,
        transport_mode: d.transport_mode,
      })),
      ...customItems.map((item) => ({
        docket_no: item.docket_no,
        booking_date: item.booking_date,
        from_city: item.from_city || '',
        to_city: item.to_city || '',
        consignor_name: item.consignor_name || item.particulars || '',
        package_count: item.package_count || 1,
        invoice_no: item.invoice_no,
        charged_weight_kg: item.charged_weight_kg || 0,
        grand_total: Number(item.amount) || 0,
        particulars: item.particulars,
      })),
    ];

    generateBillPDF(issuedBill, combinedLines);
  };

  const handleToggleExpandHistory = async (bill: Bill) => {
    if (expandedId === bill.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(bill.id);
    setExpandLoading(true);
    try {
      const res = await fetch(`/api/billing/${bill.id}`);
      if (res.ok) {
        const detail = await res.json();
        setExpandedDockets(detail.dockets ?? []);
      }
    } catch (err) {
      console.error(err);
      setExpandedDockets([]);
    } finally {
      setExpandLoading(false);
    }
  };

  const handleDownloadHistoryBill = async (bill: Bill) => {
    setDownloadingId(bill.id);
    try {
      const res = await fetch(`/api/billing/${bill.id}`);
      if (res.ok) {
        const detail = await res.json();
        generateBillPDF(bill, detail.dockets ?? []);
      }
    } catch (err) {
      console.error('Failed to download bill PDF:', err);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDeleteBill = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/billing/${deleteTarget.id}`, { method: 'DELETE' });
      if (res.ok) {
        setBills((prev) => prev.filter((b) => b.id !== deleteTarget.id));
        if (expandedId === deleteTarget.id) setExpandedId(null);
        setDeleteTarget(null);
      }
    } catch (err) {
      console.error('Failed to delete bill:', err);
    } finally {
      setDeleting(false);
    }
  };

  const filteredBills = bills.filter((b) => {
    if (!billSearch) return true;
    const q = billSearch.toLowerCase();
    return (
      b.bill_no.toLowerCase().includes(q) ||
      b.customer_name.toLowerCase().includes(q) ||
      b.invoice_date.includes(q)
    );
  });

  const totalBilledRevenue = bills.reduce((sum, b) => sum + Number(b.grand_total || 0), 0);
  const totalGstCollected = bills.reduce((sum, b) => sum + Number(b.gst_amount || 0), 0);

  const billSteps = [
    { number: 1, label: 'Invoice Details' },
    { number: 2, label: 'Customer' },
    { number: 3, label: 'Line Items' },
    { number: 4, label: 'Financials' },
    { number: 5, label: 'Review & Issue' },
  ];

  const validateBillStep = (step: number) => {
    if (step === 2) {
      if (!customerName.trim() && selectedDocketIds.length === 0) {
        setIssueError('Enter a Customer / Party Name (or go back and select an LR to auto-fill it).');
        return false;
      }
    } else if (step === 3) {
      if (selectedDocketIds.length === 0 && customItems.length === 0) {
        setIssueError('Select at least one LR or add a custom line item before continuing.');
        return false;
      }
    }
    setIssueError(null);
    return true;
  };

  const handleBillNext = () => {
    if (validateBillStep(billStep)) {
      if (billStep < 5) setBillStep(billStep + 1);
    }
  };

  const handleBillPrev = () => {
    setIssueError(null);
    if (billStep > 1) setBillStep(billStep - 1);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top Header & Navigation Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Tax Billing & Invoices</h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Create custom & consolidated GST tax invoices, manage drafts, and review all issued billing history.
          </p>
        </div>

        <div className="flex items-center gap-1.5 p-1.5 bg-white border border-slate-200/80 rounded-2xl shadow-saas">
          <button
            onClick={() => attemptSubTabChange('history')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-saas cursor-pointer ${
              subTab === 'history'
                ? 'bg-[#2563EB] text-white shadow-saas'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <History className="w-4 h-4" />
            <span>All Bills</span>
          </button>

          <button
            onClick={() => attemptSubTabChange('new')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-saas cursor-pointer ${
              subTab === 'new'
                ? 'bg-[#2563EB] text-white shadow-saas'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>New Bill</span>
          </button>

          <button
            onClick={() => attemptSubTabChange('drafts')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-saas cursor-pointer ${
              subTab === 'drafts'
                ? 'bg-[#2563EB] text-white shadow-saas'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Archive className="w-4 h-4" />
            <span>Drafts</span>
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 1. DRAFTS SUBTAB */}
      {/* ========================================================= */}
      {subTab === 'drafts' && <BillDraftList onEdit={handleLoadDraft} />}

      {/* ========================================================= */}
      {/* 2. HISTORY / ALL BILLS SUBTAB (DEFAULT LANDING) */}
      {/* ========================================================= */}
      {subTab === 'history' && (
        <div className="space-y-6">
          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="p-4 shadow-saas">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total Invoices Issued</div>
              <div className="text-2xl font-bold text-slate-900 mt-1 font-sans tracking-tight">{bills.length}</div>
              <div className="text-[11px] text-slate-500 mt-1">Recorded in system</div>
            </Card>
            <Card className="p-4 shadow-saas">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total Billed Revenue</div>
              <div className="text-2xl font-bold text-slate-900 mt-1 font-mono tracking-tight">₹{totalBilledRevenue.toLocaleString('en-IN')}</div>
              <div className="text-[11px] text-slate-500 mt-1">Gross invoice sum</div>
            </Card>
            <Card className="p-4 shadow-saas">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Output GST Total</div>
              <div className="text-2xl font-bold text-[#2563EB] mt-1 font-mono tracking-tight">₹{totalGstCollected.toLocaleString('en-IN')}</div>
              <div className="text-[11px] text-slate-500 mt-1">Tax audit balance</div>
            </Card>
          </div>

          {/* Search & Action Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={billSearch}
                onChange={(e) => setBillSearch(e.target.value)}
                placeholder="Search by Bill No, Customer Name, or Date..."
                className="pl-9 text-xs"
              />
            </div>
            <Button
              onClick={() => attemptSubTabChange('new')}
              size="md"
              className="gap-2 shadow-saas"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Bill</span>
            </Button>
          </div>

          {/* Bills Table Card */}
          {loadingBills ? (
            <div className="text-center py-16 text-xs text-slate-400 font-mono">Loading bills database...</div>
          ) : filteredBills.length === 0 ? (
            <Card className="p-12 text-center shadow-saas">
              <Receipt className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-slate-800">No bills found</h3>
              <p className="text-xs text-slate-400 mt-1">
                {billSearch ? 'Try clearing your search query.' : 'Create your first Tax Invoice by clicking "New Bill".'}
              </p>
              {!billSearch && (
                <Button
                  onClick={() => attemptSubTabChange('new')}
                  size="sm"
                  className="mt-4 gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Bill Now</span>
                </Button>
              )}
            </Card>
          ) : (
            <Card className="border border-slate-200/80 shadow-saas p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F8FAFC] border-b border-slate-200/80 text-slate-500 font-semibold tracking-wider text-[11px]">
                    <tr>
                      <th className="px-5 py-4">BILL NO.</th>
                      <th className="px-5 py-4">DATE</th>
                      <th className="px-5 py-4">CUSTOMER</th>
                      <th className="px-5 py-4">CATEGORY</th>
                      <th className="px-5 py-4">ITEMS / LRs</th>
                      <th className="px-5 py-4">ISSUED BY</th>
                      <th className="px-5 py-4 text-right">TOTAL AMOUNT</th>
                      <th className="px-5 py-4 text-right">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredBills.map((b) => {
                      const isExpanded = expandedId === b.id;
                      const itemCount = (b.docket_ids?.length || 0) + (b.items?.length || 0);

                      return (
                        <Fragment key={b.id}>
                          <tr className="hover:bg-[#F8FAFC] transition-saas cursor-pointer" onClick={() => handleToggleExpandHistory(b)}>
                            <td className="px-5 py-4 font-mono font-bold text-[#2563EB]">{b.bill_no}</td>
                            <td className="px-5 py-4 text-slate-600">{b.invoice_date}</td>
                            <td className="px-5 py-4 font-semibold text-slate-900">{b.customer_name}</td>
                            <td className="px-5 py-4">
                              <Badge variant="outline" className="text-[10px] font-mono">
                                {b.category} / {b.doc_type}
                              </Badge>
                            </td>
                            <td className="px-5 py-4 font-mono text-slate-600">{itemCount} items</td>
                            <td className="px-5 py-4 text-slate-500" title={b.created_by_email}>
                              <div>{b.created_by_name || 'Staff'}</div>
                              {b.created_at && (
                                <div className="text-[10px] text-slate-400 font-mono">{formatCreatedAt(b.created_at)}</div>
                              )}
                            </td>
                            <td className="px-5 py-4 text-right font-mono font-bold text-slate-900 text-sm">
                              ₹{Number(b.grand_total).toLocaleString('en-IN')}
                            </td>
                            <td className="px-5 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleToggleExpandHistory(b)}
                                  title="View invoice details"
                                >
                                  {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-600" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDownloadHistoryBill(b)}
                                  disabled={downloadingId === b.id}
                                  title="Download PDF"
                                >
                                  {downloadingId === b.id ? <Loader2 className="w-4 h-4 animate-spin text-[#2563EB]" /> : <Download className="w-4 h-4 text-[#2563EB]" />}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setDeleteTarget(b)}
                                  title="Delete bill"
                                >
                                  <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-600" />
                                </Button>
                              </div>
                            </td>
                          </tr>

                          {/* Expanded Details Sub-row */}
                          {isExpanded && (
                            <tr className="bg-slate-50/80">
                              <td colSpan={8} className="px-6 py-4">
                                {expandLoading ? (
                                  <div className="text-xs text-slate-400 py-2 flex items-center gap-2">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    <span>Loading line item details...</span>
                                  </div>
                                ) : (
                                  <div className="space-y-3">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs bg-white p-3.5 rounded-xl border border-slate-200">
                                      <div>
                                        <div className="text-[10px] font-semibold text-slate-400 uppercase">Customer Billing Details</div>
                                        <div className="font-bold text-slate-900 mt-0.5">{b.customer_name}</div>
                                        <div className="text-slate-600 font-mono text-[11px]">{b.customer_gstin ? `GSTIN: ${b.customer_gstin}` : 'Unregistered / B2C'}</div>
                                        <div className="text-slate-500 text-[11px]">{b.customer_address || 'No address specified'}</div>
                                      </div>
                                      <div className="text-right space-y-0.5 font-mono">
                                        <div className="text-slate-600">Subtotal: ₹{Number(b.subtotal).toLocaleString('en-IN')}</div>
                                        <div className="text-slate-600">GST ({b.gst_percentage ?? 18}%): ₹{Number(b.gst_amount).toLocaleString('en-IN')}</div>
                                        {b.discount > 0 && <div className="text-emerald-600">Discount: -₹{Number(b.discount).toLocaleString('en-IN')}</div>}
                                        <div className="text-slate-600">Round Off: ₹{Number(b.round_off).toFixed(2)}</div>
                                        <div className="text-slate-900 font-bold text-sm pt-1 border-t border-slate-200">
                                          Grand Total: ₹{Number(b.grand_total).toLocaleString('en-IN')}
                                        </div>
                                      </div>
                                    </div>

                                    {/* Line Items List */}
                                    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                                      <table className="w-full text-left text-[11px]">
                                        <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                                          <tr>
                                            <th className="px-3 py-2">#</th>
                                            <th className="px-3 py-2">Date</th>
                                            <th className="px-3 py-2">LR / Ref</th>
                                            <th className="px-3 py-2">Particulars</th>
                                            <th className="px-3 py-2">Route</th>
                                            <th className="px-3 py-2">Pcs</th>
                                            <th className="px-3 py-2">Weight</th>
                                            <th className="px-3 py-2 text-right">Amount</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                          {expandedDockets.map((d, i) => (
                                            <tr key={i}>
                                              <td className="px-3 py-2 text-slate-400 font-mono">{i + 1}</td>
                                              <td className="px-3 py-2 font-mono text-slate-600">{d.booking_date}</td>
                                              <td className="px-3 py-2 font-mono font-bold text-[#2563EB]">{d.docket_no}</td>
                                              <td className="px-3 py-2 text-slate-800">{d.consignor_name}</td>
                                              <td className="px-3 py-2 text-slate-600">{d.from_city && d.to_city ? `${d.from_city} → ${d.to_city}` : '—'}</td>
                                              <td className="px-3 py-2 font-mono">{d.package_count}</td>
                                              <td className="px-3 py-2 font-mono">{d.charged_weight_kg} kg</td>
                                              <td className="px-3 py-2 text-right font-mono font-semibold text-slate-900">
                                                ₹{Number(d.grand_total).toLocaleString('en-IN')}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Delete Bill Modal */}
          {deleteTarget && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
              <div className="bg-white rounded-2xl p-6 max-w-md w-full border border-slate-200 shadow-2xl">
                <h3 className="text-base font-bold text-red-600 mb-2">Delete Bill</h3>
                <p className="text-xs text-slate-600 mb-4 leading-relaxed">
                  Are you sure you want to delete bill <strong className="text-slate-900 font-mono">{deleteTarget.bill_no}</strong> for <strong className="text-slate-900">{deleteTarget.customer_name}</strong>? This action cannot be undone, and its referenced shipments will become available to bill again.
                </p>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDeleteBill}
                    disabled={deleting}
                    className="gap-2"
                  >
                    {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    <span>Delete Bill</span>
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* 3. NEW BILL CREATOR WIZARD */}
      {/* ========================================================= */}
      {subTab === 'new' && (
        <div className="space-y-6">
          {/* Top Bar with Back Button & Action Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => attemptSubTabChange('history')}
                className="gap-1.5 text-xs text-slate-600"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Bills</span>
              </Button>
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {editingDraftId ? 'Edit Draft Tax Invoice' : 'Create New Tax Invoice'}
                </h2>
                <p className="text-xs text-slate-400">Fill details manually or select from issued shipments</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsPreviewing(!isPreviewing)}
                className="gap-2 text-xs"
              >
                <FileText className="w-4 h-4 text-slate-500" />
                <span>{isPreviewing ? 'Edit Form' : 'Live Preview'}</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleSaveDraft}
                disabled={savingDraft || (!customerName && customItems.length === 0 && selectedDocketIds.length === 0)}
                className="gap-2 text-xs"
              >
                {savingDraft ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-4 h-4 text-slate-500" />}
                <span>{editingDraftId ? 'Update Draft' : 'Save Draft'}</span>
              </Button>
            </div>
          </div>

          {/* Step Progress Bar */}
          {!issuedBill && !isPreviewing && (
            <div className="max-w-3xl mx-auto flex items-center px-4 py-3.5 bg-white border border-slate-200/80 rounded-2xl shadow-saas">
              {billSteps.map((step, idx) => {
                const isCompleted = billStep > step.number;
                const isCurrent = billStep === step.number;
                return (
                  <div key={step.number} className="flex items-center min-w-0 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        if (step.number < billStep) setBillStep(step.number);
                      }}
                      className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold transition-saas shrink-0 ${
                        isCompleted
                          ? 'bg-[#E8F7EF] text-[#1F8A4C] cursor-pointer'
                          : isCurrent
                          ? 'bg-[#2563EB] text-white shadow-saas'
                          : 'bg-slate-100 text-slate-400 border border-slate-200/60'
                      }`}
                    >
                      {isCompleted ? <Check className="w-4 h-4" /> : step.number}
                    </button>
                    <span
                      className={`ml-2 text-xs font-medium hidden sm:inline whitespace-nowrap ${
                        isCurrent ? 'text-[#2563EB] font-semibold' : isCompleted ? 'text-slate-700' : 'text-slate-400'
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                );
              }).reduce((acc: ReactNode[], node, idx) => {
                if (idx > 0) acc.push(<div key={`c-${idx}`} className="h-0.5 flex-1 min-w-4 bg-slate-200/80 mx-2 hidden md:block" />);
                acc.push(node);
                return acc;
              }, [])}
            </div>
          )}

          {/* Success Banner */}
          {issuedBill && (
            <Card className="p-6 border border-emerald-200 bg-emerald-50/70 rounded-2xl space-y-4 shadow-saas">
              <div className="flex items-center gap-2 text-emerald-800">
                <Check className="w-5 h-5" />
                <h3 className="text-sm font-bold">Tax Invoice {issuedBill.bill_no} Issued Successfully!</h3>
              </div>
              <p className="text-xs text-emerald-700">
                Billed to <strong>{issuedBill.customer_name}</strong> for ₹{Number(issuedBill.grand_total).toLocaleString('en-IN')}. It is now recorded in billing history.
              </p>
              <div className="flex items-center gap-2">
                <Button onClick={handleDownloadIssuedBill} size="sm" className="gap-2 shadow-saas">
                  <Download className="w-4 h-4" />
                  <span>Download PDF</span>
                </Button>
                <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-2">
                  <Printer className="w-4 h-4" />
                  <span>Print</span>
                </Button>
                <Button variant="ghost" size="sm" onClick={resetForm} className="text-xs text-slate-600">
                  Start Another Bill
                </Button>
              </div>
            </Card>
          )}

          {/* Error Banner */}
          {issueError && (
            <div className="max-w-3xl mx-auto p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium flex items-center gap-2">
              <span>⚠️</span>
              <span>{issueError}</span>
            </div>
          )}

          {/* FORM SECTIONS */}
          {!issuedBill && !isPreviewing && (
            <div className="max-w-3xl mx-auto space-y-5">
              {/* Step 1: Invoice Details */}
              {billStep === 1 && (
                <Card className="p-5 space-y-4 shadow-saas">
                  <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
                    <span>Invoice Details</span>
                  </h3>

                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-700">Bill / Invoice Number</label>
                      <Input
                        value={billNo}
                        onChange={(e) => setBillNo(e.target.value)}
                        placeholder="Auto-generated (or type custom)"
                        className="mt-1 text-xs font-mono"
                      />
                      <p className="text-[10px] text-slate-400 mt-1">Leave blank to auto-generate sequentially.</p>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-700">Invoice Date</label>
                      <Input
                        type="date"
                        value={invoiceDate}
                        onChange={(e) => setInvoiceDate(e.target.value)}
                        className="mt-1 text-xs"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-slate-700">Category</label>
                        <select
                          value={category}
                          onChange={(e) => setCategory(e.target.value)}
                          className="mt-1 w-full text-xs h-9 px-3 border border-slate-200 rounded-lg bg-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="B2B">B2B (Registered)</option>
                          <option value="B2C">B2C (Unregistered)</option>
                          <option value="SEZ">SEZ Unit</option>
                          <option value="Export">Export</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-xs font-semibold text-slate-700">Doc Type</label>
                        <select
                          value={docType}
                          onChange={(e) => setDocType(e.target.value)}
                          className="mt-1 w-full text-xs h-9 px-3 border border-slate-200 rounded-lg bg-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="INV">Tax Invoice (INV)</option>
                          <option value="BOS">Bill of Supply (BOS)</option>
                          <option value="Challan">Delivery Challan</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-200/80 text-xs">
                      <div>
                        <div className="font-semibold text-slate-800">Reverse Charge (RCM)</div>
                        <div className="text-[10px] text-slate-500">Tax payable by recipient</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={reverseCharge}
                        onChange={(e) => setReverseCharge(e.target.checked)}
                        className="w-4 h-4 text-[#2563EB] rounded"
                      />
                    </div>
                  </div>
                </Card>
              )}

              {/* Step 2: Customer Details */}
              {billStep === 2 && (
                <Card className="p-5 space-y-4 shadow-saas">
                  <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
                    <span>Customer / Bill To</span>
                  </h3>
                  <p className="text-[11px] text-slate-400 -mt-2">Optional here — selecting an LR in the next step auto-fills this from the shipment&rsquo;s consignor.</p>

                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-700">Choose Saved Customer (Optional)</label>
                      <select
                        value={selectedCustomerId}
                        onChange={(e) => handleCustomerSelect(e.target.value)}
                        className="mt-1 w-full text-xs h-9 px-3 border border-slate-200 rounded-lg bg-white font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">-- Or type details manually below --</option>
                        {customers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} {c.city ? `(${c.city})` : ''}
                          </option>
                        ))}
                      </select>
                      {selectedCustomer && (
                        <button
                          type="button"
                          onClick={() => setBillStep(3)}
                          className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-[#2563EB] hover:underline cursor-pointer"
                        >
                          <Check className="w-3 h-3" />
                          <span>
                            {availableDockets.length} unbilled LR{availableDockets.length === 1 ? '' : 's'} found for {selectedCustomer.name} — select them in the next step
                          </span>
                        </button>
                      )}
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-700">
                        Party / Customer Name <span className="text-red-500">*</span>
                      </label>
                      <Input
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="e.g. Acme Corporation Pvt Ltd"
                        className="mt-1 text-xs font-semibold"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-slate-700">GSTIN</label>
                        <Input
                          value={customerGstin}
                          onChange={(e) => setCustomerGstin(e.target.value.toUpperCase())}
                          placeholder="27ABCDE1234F1Z5"
                          className="mt-1 text-xs font-mono uppercase"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-700">Phone</label>
                        <Input
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(e.target.value)}
                          placeholder="98XXXXXXXX"
                          className="mt-1 text-xs"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-700">Address</label>
                      <Input
                        value={customerAddress}
                        onChange={(e) => setCustomerAddress(e.target.value)}
                        placeholder="Full billing address, city, state, pin"
                        className="mt-1 text-xs"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-700">Email</label>
                      <Input
                        value={customerEmail}
                        onChange={(e) => setCustomerEmail(e.target.value)}
                        placeholder="accounts@customer.com"
                        className="mt-1 text-xs"
                      />
                    </div>
                  </div>
                </Card>
              )}

              {/* Step 3: Line Items */}
              {billStep === 3 && (
                <Card className="p-5 space-y-4 shadow-saas">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Line Items & Shipments</h3>
                      <p className="text-xs text-slate-400">Select unbilled LRs or add manual entries</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddCustomItem}
                        className="gap-1.5 text-xs text-[#2563EB] border-blue-200 hover:bg-blue-50"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Custom Line Item</span>
                      </Button>
                    </div>
                  </div>

                  {/* A. Select from Unbilled LRs */}
                  {availableDockets.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-700">
                          Available Unbilled LRs ({availableDockets.length})
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            if (selectedDocketIds.length === availableDockets.length) {
                              setSelectedDocketIds([]);
                            } else {
                              setSelectedDocketIds(availableDockets.map((d) => d.id));
                              if (!customerName.trim() && availableDockets[0]?.consignor_name) {
                                setCustomerName(availableDockets[0].consignor_name);
                                if (availableDockets[0].consignor_gstin) setCustomerGstin(availableDockets[0].consignor_gstin);
                                if (availableDockets[0].consignor_address) setCustomerAddress(availableDockets[0].consignor_address);
                                if (availableDockets[0].consignor_phone) setCustomerPhone(availableDockets[0].consignor_phone);
                              }
                            }
                          }}
                          className="text-[11px] font-semibold text-[#2563EB] hover:underline cursor-pointer"
                        >
                          {selectedDocketIds.length === availableDockets.length ? 'Deselect All LRs' : 'Select All LRs'}
                        </button>
                      </div>

                      <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-slate-50/50">
                        {availableDockets.map((d) => {
                          const isSelected = selectedDocketIds.includes(d.id);
                          return (
                            <div
                              key={d.id}
                              onClick={() => {
                                setSelectedDocketIds((prev) => {
                                  const isAdding = !prev.includes(d.id);
                                  const next = isAdding ? [...prev, d.id] : prev.filter((id) => id !== d.id);
                                  if (isAdding && !customerName.trim()) {
                                    setCustomerName(d.consignor_name || '');
                                    if (d.consignor_gstin) setCustomerGstin(d.consignor_gstin);
                                    if (d.consignor_address) setCustomerAddress(d.consignor_address);
                                    if (d.consignor_phone) setCustomerPhone(d.consignor_phone);
                                  }
                                  return next;
                                });
                              }}
                              className={`p-2.5 flex items-center justify-between cursor-pointer text-xs transition-colors ${
                                isSelected ? 'bg-blue-50/90 border-l-4 border-l-[#2563EB]' : 'hover:bg-white'
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <div
                                  className={`w-4 h-4 rounded border flex items-center justify-center ${
                                    isSelected ? 'bg-[#2563EB] border-[#2563EB] text-white' : 'border-slate-300 bg-white'
                                  }`}
                                >
                                  {isSelected && <Check className="w-3 h-3" />}
                                </div>
                                <div>
                                  <span className="font-mono font-bold text-[#2563EB]">{d.docket_no}</span>
                                  <span className="text-slate-500 text-[11px] ml-2 font-mono">({d.booking_date})</span>
                                  <div className="text-[11px] text-slate-600 font-medium">
                                    {d.from_city} → {d.to_city} ({d.articles_count || d.package_count} pcs) · {d.consignor_name}
                                  </div>
                                </div>
                              </div>
                              <div className="font-mono font-bold text-slate-900">
                                ₹{Number(d.grand_total).toLocaleString('en-IN')}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* B. Manual Line Items Grid */}
                  <div className="space-y-2 pt-2">
                    <div className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                      <span>Custom / Manual Bill Entries ({customItems.length})</span>
                      {customItems.length === 0 && (
                        <span className="text-[11px] text-slate-400">Click "+ Custom Line Item" to add manual lines</span>
                      )}
                    </div>

                    {customItems.length > 0 && (
                      <div className="space-y-2">
                        {customItems.map((item, idx) => (
                          <div
                            key={item.id || idx}
                            className="p-3 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-2.5"
                          >
                            <div className="flex items-center justify-between text-xs font-bold text-slate-700 border-b border-slate-100 pb-1.5">
                              <span>Item #{idx + 1}</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRemoveCustomItem(idx)}
                                title="Remove item"
                                className="hover:bg-red-50"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-red-500 hover:text-red-700" />
                              </Button>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              <div>
                                <label className="text-[10px] font-semibold text-slate-500">Date</label>
                                <Input
                                  type="date"
                                  value={item.booking_date}
                                  onChange={(e) => handleUpdateCustomItem(idx, 'booking_date', e.target.value)}
                                  className="mt-0.5 text-xs h-8"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] font-semibold text-slate-500">LR / Ref No.</label>
                                <Input
                                  value={item.docket_no}
                                  onChange={(e) => handleUpdateCustomItem(idx, 'docket_no', e.target.value)}
                                  placeholder="e.g. LR-101"
                                  className="mt-0.5 text-xs font-mono h-8"
                                />
                              </div>
                              <div className="col-span-2">
                                <label className="text-[10px] font-semibold text-slate-500">Particulars / Description</label>
                                <Input
                                  value={item.particulars || item.consignor_name || ''}
                                  onChange={(e) => handleUpdateCustomItem(idx, 'particulars', e.target.value)}
                                  placeholder="Goods / Freight service description"
                                  className="mt-0.5 text-xs h-8"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                              <div>
                                <label className="text-[10px] font-semibold text-slate-500">Origin City</label>
                                <CityInput
                                  value={item.from_city || ''}
                                  onChange={(v) => handleUpdateCustomItem(idx, 'from_city', v)}
                                  extraCities={knownCities}
                                  placeholder="From"
                                  className="mt-0.5 text-xs h-8"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] font-semibold text-slate-500">Dest City</label>
                                <CityInput
                                  value={item.to_city || ''}
                                  onChange={(v) => handleUpdateCustomItem(idx, 'to_city', v)}
                                  extraCities={knownCities}
                                  placeholder="To"
                                  className="mt-0.5 text-xs h-8"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] font-semibold text-slate-500">Mode</label>
                                <select
                                  value={item.transport_mode || 'Road'}
                                  onChange={(e) => handleUpdateCustomItem(idx, 'transport_mode', e.target.value)}
                                  className="mt-0.5 w-full text-xs h-8 px-2 border border-slate-200 rounded-lg bg-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                  <option value="Road">Road</option>
                                  <option value="Train">Rail</option>
                                  <option value="Air">Air</option>
                                </select>
                              </div>
                              <div>
                                <label className="text-[10px] font-semibold text-slate-500">Pcs / Pkgs</label>
                                <Input
                                  type="number"
                                  value={item.package_count}
                                  onChange={(e) => handleUpdateCustomItem(idx, 'package_count', Number(e.target.value))}
                                  className="mt-0.5 text-xs font-mono h-8"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] font-semibold text-slate-500">Weight (kg)</label>
                                <Input
                                  type="number"
                                  value={item.charged_weight_kg || 0}
                                  onChange={(e) => handleUpdateCustomItem(idx, 'charged_weight_kg', Number(e.target.value))}
                                  className="mt-0.5 text-xs font-mono h-8"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] font-semibold text-slate-500">Amount (₹) *</label>
                                <Input
                                  type="number"
                                  value={item.amount}
                                  onChange={(e) => handleUpdateCustomItem(idx, 'amount', Number(e.target.value))}
                                  className="mt-0.5 text-xs font-mono font-bold text-slate-900 h-8"
                                />
                              </div>
                            </div>

                            {/* Quotation-sheet pricing hint / missing-rate action */}
                            {(() => {
                              const priced = describeItemPricing(item);
                              if (!priced) return null;
                              const isAddingHere = addRateItemId === item.id;
                              return (
                                <div className="text-[10px] pt-0.5">
                                  <div className={priced.canAddRate ? 'text-amber-600 font-medium' : 'text-blue-600 font-medium'}>
                                    {priced.hint}
                                  </div>
                                  {priced.canAddRate && !isAddingHere && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setAddRateItemId(item.id!);
                                        setNewRateValue('');
                                      }}
                                      className="mt-1 text-[#2563EB] font-semibold hover:underline cursor-pointer"
                                    >
                                      + Add rate to quotation sheet
                                    </button>
                                  )}
                                  {priced.canAddRate && isAddingHere && (
                                    <div className="mt-1.5 flex items-center gap-1.5">
                                      <Input
                                        type="number"
                                        autoFocus
                                        value={newRateValue}
                                        onChange={(e) => setNewRateValue(e.target.value)}
                                        placeholder="₹/kg"
                                        className="text-xs h-7 w-24 font-mono"
                                      />
                                      <Button
                                        type="button"
                                        size="sm"
                                        disabled={addingRate || !newRateValue}
                                        onClick={() =>
                                          handleAddMissingRate(item.id!, priced.canAddRate!.sheetId, priced.canAddRate!.destination, priced.canAddRate!.mode)
                                        }
                                        className="h-7 text-[10px] px-2.5"
                                      >
                                        {addingRate ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save Rate'}
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setAddRateItemId(null)}
                                        className="h-7 text-[10px] px-2 text-slate-500"
                                      >
                                        Cancel
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </Card>
              )}

              {/* Step 4: Financials */}
              {billStep === 4 && (
                <Card className="p-5 space-y-4 shadow-saas">
                  <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
                    <span>Financials & Tax Breakdown</span>
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-700">Subtotal (₹)</label>
                      <Input
                        type="number"
                        value={manualSubtotal !== '' ? manualSubtotal : subtotal}
                        onChange={(e) => setManualSubtotal(e.target.value)}
                        placeholder={String(calculatedSubtotal)}
                        className="mt-1 text-xs font-mono font-bold text-slate-900"
                      />
                      <p className="text-[10px] text-slate-400 mt-0.5">Sum of items: ₹{calculatedSubtotal.toLocaleString('en-IN')}</p>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-700">Discount (₹)</label>
                      <Input
                        type="number"
                        value={discount}
                        onChange={(e) => setDiscount(Number(e.target.value))}
                        className="mt-1 text-xs font-mono text-emerald-600 font-bold"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-700">GST Rate (%)</label>
                      <select
                        value={gstPercentage}
                        onChange={(e) => {
                          setGstPercentage(Number(e.target.value));
                          setManualGstAmount('');
                        }}
                        className="mt-1 w-full text-xs h-9 px-3 border border-slate-200 rounded-lg bg-white font-mono font-semibold text-[#2563EB] focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="18">18% (Standard Goods / Freight)</option>
                        <option value="12">12%</option>
                        <option value="5">5% (GTA with ITC option)</option>
                        <option value="0">0% (Nil / Exempt)</option>
                        <option value="28">28%</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-700">GST Amount (₹)</label>
                      <Input
                        type="number"
                        value={manualGstAmount !== '' ? manualGstAmount : gstAmount}
                        onChange={(e) => setManualGstAmount(e.target.value)}
                        className="mt-1 text-xs font-mono font-bold text-[#2563EB]"
                      />
                      <p className="text-[10px] text-slate-400 mt-0.5">Calculated: ₹{calculatedGst.toLocaleString('en-IN')}</p>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-700">Notes / Payment Terms</label>
                      <Input
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="e.g. Payment due within 15 days"
                        className="mt-1 text-xs"
                      />
                    </div>
                  </div>

                  {/* Summary Box */}
                  <div className="p-4 bg-[#F8FAFC] border border-slate-200 rounded-xl space-y-2 text-xs font-sans">
                    <div className="flex justify-between text-slate-600">
                      <span>Taxable Subtotal:</span>
                      <span className="font-mono font-bold text-slate-900">₹{subtotal.toLocaleString('en-IN')}</span>
                    </div>
                    {discount > 0 && (
                      <div className="flex justify-between text-emerald-600 font-medium">
                        <span>Discount:</span>
                        <span className="font-mono font-bold">- ₹{discount.toLocaleString('en-IN')}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-slate-600">
                      <span>Output GST ({gstPercentage}%):</span>
                      <span className="font-mono font-bold text-[#2563EB]">₹{gstAmount.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Round Off:</span>
                      <span className="font-mono font-bold text-slate-900">₹{roundOff.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold text-slate-900 border-t border-slate-200 pt-2.5">
                      <span>Net Invoice Grand Total:</span>
                      <span className="font-mono text-[#2563EB] text-lg font-extrabold">₹{grandTotal.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 italic pt-1 font-mono">{amountInWords}</div>
                  </div>
                </Card>
              )}

              {/* Step 5: Review & Issue */}
              {billStep === 5 && (
                <Card className="p-5 space-y-4 shadow-saas">
                  <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
                    <span>Review & Issue</span>
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-0.5">
                      <div className="text-[10px] font-semibold text-slate-400 uppercase">Invoice</div>
                      <div className="font-bold text-slate-900">{billNo || '(auto-generated)'} — {invoiceDate}</div>
                      <div className="text-slate-500">{category} / {docType}{reverseCharge ? ' / RCM' : ''}</div>
                    </div>
                    <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-0.5">
                      <div className="text-[10px] font-semibold text-slate-400 uppercase">Bill To</div>
                      <div className="font-bold text-slate-900">{customerName || '(will use first LR consignor)'}</div>
                      <div className="text-slate-500 font-mono">{customerGstin || 'Unregistered / B2C'}</div>
                    </div>
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2">LR / Ref</th>
                          <th className="px-3 py-2">Particulars</th>
                          <th className="px-3 py-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedDockets.map((d) => (
                          <tr key={d.id}>
                            <td className="px-3 py-2 font-mono font-bold text-[#2563EB]">{d.docket_no}</td>
                            <td className="px-3 py-2 text-slate-700">{d.consignor_name} ({d.from_city} → {d.to_city})</td>
                            <td className="px-3 py-2 text-right font-mono font-semibold">₹{Number(d.grand_total).toLocaleString('en-IN')}</td>
                          </tr>
                        ))}
                        {customItems.map((item) => (
                          <tr key={item.id}>
                            <td className="px-3 py-2 font-mono font-bold text-[#2563EB]">{item.docket_no || '—'}</td>
                            <td className="px-3 py-2 text-slate-700">{item.particulars || item.consignor_name || '—'}</td>
                            <td className="px-3 py-2 text-right font-mono font-semibold">₹{Number(item.amount).toLocaleString('en-IN')}</td>
                          </tr>
                        ))}
                        {selectedDockets.length === 0 && customItems.length === 0 && (
                          <tr>
                            <td colSpan={3} className="px-3 py-4 text-center text-slate-400">No items added.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="p-4 bg-[#F8FAFC] border border-slate-200 rounded-xl space-y-2 text-xs font-sans">
                    <div className="flex justify-between text-slate-600">
                      <span>Taxable Subtotal:</span>
                      <span className="font-mono font-bold text-slate-900">₹{subtotal.toLocaleString('en-IN')}</span>
                    </div>
                    {discount > 0 && (
                      <div className="flex justify-between text-emerald-600 font-medium">
                        <span>Discount:</span>
                        <span className="font-mono font-bold">- ₹{discount.toLocaleString('en-IN')}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-slate-600">
                      <span>Output GST ({gstPercentage}%):</span>
                      <span className="font-mono font-bold text-[#2563EB]">₹{gstAmount.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold text-slate-900 border-t border-slate-200 pt-2.5">
                      <span>Net Invoice Grand Total:</span>
                      <span className="font-mono text-[#2563EB] text-lg font-extrabold">₹{grandTotal.toLocaleString('en-IN')}</span>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsPreviewing(true)}
                    className="gap-2 text-xs w-full"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>View Full Printable Preview</span>
                  </Button>
                </Card>
              )}

              {/* Step Navigation */}
              <div className="flex items-center justify-between pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBillPrev}
                  disabled={billStep === 1}
                  className="gap-1.5 text-xs"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </Button>

                {billStep < 5 ? (
                  <Button size="sm" onClick={handleBillNext} className="gap-1.5 text-xs shadow-saas">
                    <span>Continue</span>
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={handleIssueBill}
                    disabled={issuing || (selectedDocketIds.length === 0 && customItems.length === 0)}
                    className="gap-2 text-xs shadow-saas"
                  >
                    {issuing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <DollarSign className="w-4 h-4" />}
                    <span>Issue Tax Invoice</span>
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* LIVE TAX INVOICE PRINTABLE PREVIEW */}
          {/* ========================================================= */}
          {isPreviewing && (
            <div className="bg-white text-slate-900 p-6 md:p-8 border border-slate-300 rounded-2xl shadow-xl font-sans text-xs print:p-0 print:border-none print:shadow-none animate-fade-in">
              <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-200 print:hidden">
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Document Live Preview</span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-2 text-xs">
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print Invoice</span>
                  </Button>
                  <Button size="sm" onClick={() => setIsPreviewing(false)} className="text-xs">
                    Close Preview
                  </Button>
                </div>
              </div>

              <div className="max-w-[800px] mx-auto border-2 border-black space-y-0 text-black font-sans leading-tight">
                {/* Header Box */}
                <div className="grid grid-cols-4 border-b-2 border-black">
                  <div className="col-span-3 p-3 space-y-1">
                    <div className="text-[10px] font-bold text-slate-600 uppercase">SUPPLIER:</div>
                    <div className="text-base font-extrabold tracking-tight uppercase text-[#1D4ED8]">{settings.tradeName}</div>
                    <div className="text-xs font-bold font-mono text-[#1D4ED8]">GSTIN: {settings.gstin}</div>
                    <div className="text-[11px] font-medium leading-tight text-slate-800">Address: {settings.address}</div>
                    <div className="text-[10px] text-slate-600">Ph: {settings.phone1} | Email: {settings.email}</div>
                  </div>
                  <div className="col-span-1 p-3 border-l-2 border-black flex flex-col items-center justify-center text-center">
                    <img
                      src="/rudra-logo.png"
                      alt="Rudra Cargo & Transport NX"
                      className="block w-full max-w-[130px] h-auto object-contain"
                    />
                  </div>
                </div>

                {/* Title Banner */}
                <div className="bg-slate-100 text-center font-extrabold text-xs py-1 border-b-2 border-black uppercase tracking-wider">
                  TAX INVOICE
                </div>

                {/* Customer & Meta Box */}
                <div className="grid grid-cols-3 border-b-2 border-black text-[11px]">
                  <div className="col-span-2 p-2.5 space-y-1 border-r-2 border-black">
                    <div className="font-bold uppercase text-[10px] text-slate-600">CUSTOMER:</div>
                    <div className="flex"><span className="w-24 font-bold text-black">Trade Name :</span> <span className="font-bold text-[#1D4ED8]">{customerName || '—'}</span></div>
                    <div className="flex"><span className="w-24 font-bold text-black">GSTIN :</span> <span className="font-mono font-bold text-[#1D4ED8]">{customerGstin || 'N/A'}</span></div>
                    <div className="flex"><span className="w-24 font-bold text-black">Address :</span> <span className="font-medium text-[#1D4ED8]">{customerAddress || '—'}</span></div>
                    <div className="flex"><span className="w-24 font-bold text-black">Contact :</span> <span className="font-semibold text-[#1D4ED8]">{customerPhone || '—'}</span></div>
                  </div>

                  <div className="col-span-1 p-2.5 space-y-1 font-mono text-[11px]">
                    <div className="flex justify-between border-b border-slate-200 pb-0.5"><span className="font-sans font-bold text-black">Invoice No.</span> <span className="font-bold text-[#1D4ED8]">{billNo || '(assigned on issue)'}</span></div>
                    <div className="flex justify-between border-b border-slate-200 pb-0.5"><span className="font-sans font-bold text-black">Invoice Date</span> <span className="font-bold text-[#1D4ED8]">{invoiceDate}</span></div>
                    <div className="flex justify-between border-b border-slate-200 pb-0.5"><span className="font-sans font-bold text-black">Category</span> <span className="font-bold text-[#1D4ED8]">{category}</span></div>
                    <div className="flex justify-between border-b border-slate-200 pb-0.5"><span className="font-sans font-bold text-black">Doc Type</span> <span className="font-bold text-[#1D4ED8]">{docType}</span></div>
                    <div className="flex justify-between"><span className="font-sans font-bold text-black">Services</span> <span className="font-bold text-[#1D4ED8]">{isServices}</span></div>
                  </div>
                </div>

                {/* Line Items Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[10px] border-collapse">
                    <thead>
                      <tr className="border-b-2 border-black bg-slate-50 font-bold text-center text-black">
                        <th className="border-r border-black p-1 w-8">#</th>
                        <th className="border-r border-black p-1 w-16">Date</th>
                        <th className="border-r border-black p-1 font-mono">LR / Ref</th>
                        <th className="border-r border-black p-1">Particulars</th>
                        <th className="border-r border-black p-1">Route</th>
                        <th className="border-r border-black p-1 w-10">Pcs</th>
                        <th className="border-r border-black p-1 w-14">Weight (kg)</th>
                        <th className="p-1 w-20 text-right">Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black">
                      {selectedDockets.map((d, idx) => (
                        <tr key={d.id} className="text-center font-semibold text-[#1D4ED8]">
                          <td className="border-r border-black p-1 font-mono">{idx + 1}</td>
                          <td className="border-r border-black p-1 font-mono">{d.booking_date}</td>
                          <td className="border-r border-black p-1 font-mono font-bold text-[#1D4ED8]">{d.docket_no}</td>
                          <td className="border-r border-black p-1 font-medium">{d.consignor_name}</td>
                          <td className="border-r border-black p-1 uppercase">{d.from_city} → {d.to_city}</td>
                          <td className="border-r border-black p-1 font-mono">{d.articles_count || d.package_count}</td>
                          <td className="border-r border-black p-1 font-mono">{d.charged_weight_kg}</td>
                          <td className="p-1 text-right font-mono font-bold text-[#1D4ED8]">₹{Number(d.grand_total).toLocaleString('en-IN')}</td>
                        </tr>
                      ))}
                      {customItems.map((item, idx) => (
                        <tr key={item.id || idx} className="text-center font-semibold text-[#1D4ED8]">
                          <td className="border-r border-black p-1 font-mono">{selectedDockets.length + idx + 1}</td>
                          <td className="border-r border-black p-1 font-mono">{item.booking_date}</td>
                          <td className="border-r border-black p-1 font-mono font-bold text-[#1D4ED8]">{item.docket_no}</td>
                          <td className="border-r border-black p-1 font-medium">{item.particulars || item.consignor_name || '—'}</td>
                          <td className="border-r border-black p-1 uppercase">{item.from_city && item.to_city ? `${item.from_city} → ${item.to_city}` : '—'}</td>
                          <td className="border-r border-black p-1 font-mono">{item.package_count}</td>
                          <td className="border-r border-black p-1 font-mono">{item.charged_weight_kg || 0}</td>
                          <td className="p-1 text-right font-mono font-bold text-[#1D4ED8]">₹{Number(item.amount).toLocaleString('en-IN')}</td>
                        </tr>
                      ))}
                      {selectedDockets.length === 0 && customItems.length === 0 && (
                        <tr className="text-center italic">
                          <td colSpan={8} className="p-4 text-slate-400">
                            No items added to invoice yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Summary & Totals */}
                <div className="grid grid-cols-5 border-t-2 border-black text-[11px]">
                  <div className="col-span-3 p-2 border-r-2 border-black space-y-1">
                    <div className="font-bold underline text-[10px] text-black">Terms & Conditions:</div>
                    <ol className="list-decimal list-inside space-y-0.5 text-[10px] text-[#1D4ED8] font-semibold">
                      {settings.terms.map((t, i) => (
                        <li key={i}>{t}</li>
                      ))}
                    </ol>
                    {notes && <div className="text-[10px] text-slate-700 font-semibold pt-1">Note: {notes}</div>}
                  </div>

                  <div className="col-span-2 p-2 space-y-1 font-mono text-[#1D4ED8] font-bold">
                    <div className="flex justify-between"><span className="font-sans font-bold text-black">Sub Amount</span> <span>₹{subtotal.toLocaleString('en-IN')}</span></div>
                    {discount > 0 && <div className="flex justify-between"><span className="font-sans font-bold text-black">Discount</span> <span>-₹{discount.toFixed(2)}</span></div>}
                    <div className="flex justify-between border-t border-black pt-0.5"><span className="font-sans font-bold text-black">GST Amount @{gstPercentage}%</span> <span>₹{gstAmount.toLocaleString('en-IN')}</span></div>
                    <div className="flex justify-between"><span className="font-sans font-bold text-black">Round Off</span> <span>₹{roundOff.toFixed(2)}</span></div>
                    <div className="flex justify-between font-black text-sm border-t-2 border-black pt-1 bg-blue-50 px-1 rounded-sm"><span className="font-sans text-black">Net Amount</span> <span className="text-[#1D4ED8] font-extrabold text-base">₹{grandTotal.toLocaleString('en-IN')}</span></div>
                  </div>
                </div>

                {/* Amount in Words */}
                <div className="border-t-2 border-b-2 border-black p-2 font-bold text-xs bg-slate-50 flex items-center">
                  <span className="w-32 uppercase text-[10px] text-black font-bold">Amount in words:</span>
                  <span className="font-bold text-[#1D4ED8]">{amountInWords}</span>
                </div>

                {/* Bank Details */}
                <div className="grid grid-cols-3 text-[11px]">
                  <div className="col-span-2 p-2 border-r-2 border-black space-y-1">
                    <div className="font-bold underline text-[10px] uppercase text-black">BANK DETAIL:</div>
                    <div className="grid grid-cols-3 gap-1">
                      <span className="font-bold text-black">Name:</span> <span className="col-span-2 font-bold text-[#1D4ED8]">{settings.tradeName}</span>
                      <span className="font-bold text-black">Bank:</span> <span className="col-span-2 font-bold text-[#1D4ED8]">{settings.bankName}</span>
                      <span className="font-bold text-black">Branch:</span> <span className="col-span-2 font-bold text-[#1D4ED8]">{settings.branch}</span>
                      <span className="font-bold text-black">A/C No:</span> <span className="col-span-2 font-mono font-bold text-[#1D4ED8]">{settings.accountNo}</span>
                      <span className="font-bold text-black">IFSC:</span> <span className="col-span-2 font-mono font-bold text-[#1D4ED8]">{settings.ifsc}</span>
                    </div>
                  </div>

                  <div className="col-span-1 p-2 flex flex-col items-center justify-center text-center space-y-1 bg-slate-50">
                    <div className="text-[9px] font-black uppercase text-black flex items-center gap-1">
                      <Smartphone className="w-3 h-3 text-[#1D4ED8]" />
                      <span>Google Pay QR</span>
                    </div>
                    <div className="text-[9px] font-mono font-bold text-[#1D4ED8]">
                      UPI: {settings.upiId || settings.gpayNo}
                    </div>
                  </div>
                </div>

                {/* Signature */}
                <div className="border-t-2 border-black p-3 flex justify-between items-center text-center">
                  <div className="font-bold text-[10px] uppercase text-black">For {settings.tradeName}</div>
                  <div className="font-bold text-[10px] uppercase border-t border-black w-48 pt-0.5 text-black">RECEIVER'S SEAL & SIGNATURE</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Unsaved-changes guard when navigating away from a dirty New Bill form */}
      {pendingSubTab && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full border border-slate-300 shadow-xl">
            <h3 className="text-base font-bold text-slate-900 mb-2">Unsaved changes</h3>
            <p className="text-xs text-slate-600 mb-4">
              {"This bill hasn't been issued yet. Save it as a draft to finish later, or discard your changes."}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => resolvePendingSubTab('cancel')}
                className="px-4 py-2 border border-slate-300 rounded text-sm font-semibold text-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={() => resolvePendingSubTab('discard')}
                className="px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 rounded text-sm font-semibold"
              >
                Discard
              </button>
              <button
                onClick={() => resolvePendingSubTab('save')}
                disabled={leaveSaving}
                className="px-4 py-2 bg-[#2563EB] hover:bg-blue-700 text-white rounded text-sm font-bold disabled:opacity-50"
              >
                {leaveSaving ? 'Saving...' : 'Save as Draft'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default BillingView;
