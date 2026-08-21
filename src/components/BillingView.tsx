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
  ArrowRight,
  Save,
  X,
  FileSpreadsheet,
  Clock,
} from 'lucide-react';
import { RUDRA_LOGO_BASE64 } from '@/lib/logoData';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CityInput } from '@/components/ui/city-input';
import { Badge } from '@/components/ui/badge';
import { CargoDocket, Customer, Bill, BillDraft, BillCustomLineItem } from '@/types/cargo';
import { CompanySettings, DEFAULT_COMPANY_SETTINGS, getCompanySettings } from '@/lib/companyConfig';
import { generateBillPDF, BillLineDocket } from '@/lib/pdfGenerator';
import { downloadCSV } from '@/lib/exportUtils';
import { formatCreatedAt } from '@/lib/formatDate';
import BillDraftList from '@/components/BillDraftList';
import type { QuotationSheetDTO } from '@/components/QuotationView';

interface BillingViewProps {
  dockets: CargoDocket[];
  customers: Customer[];
}

export type BillDatePreset =
  | 'all'
  | 'this_month'
  | 'last_month'
  | 'quarter'
  | '6months'
  | 'year'
  | 'custom';

function getBillPresetDates(preset: BillDatePreset): { start: string; end: string; label: string } {
  const now = new Date();
  const todayISO = now.toISOString().split('T')[0];
  const y = now.getFullYear();
  const m = now.getMonth();

  if (preset === 'this_month') {
    const start = new Date(Date.UTC(y, m, 1)).toISOString().split('T')[0];
    const end = new Date(Date.UTC(y, m + 1, 0)).toISOString().split('T')[0];
    const label = now.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    return { start, end, label: `This Month (${label})` };
  }

  if (preset === 'last_month') {
    const start = new Date(Date.UTC(y, m - 1, 1)).toISOString().split('T')[0];
    const end = new Date(Date.UTC(y, m, 0)).toISOString().split('T')[0];
    const lastMonthDate = new Date(Date.UTC(y, m - 1, 1));
    const label = lastMonthDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    return { start, end, label: `Last Month (${label})` };
  }

  if (preset === 'quarter') {
    const past90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    return { start: past90.toISOString().split('T')[0], end: todayISO, label: 'Last 3 Months (Quarter)' };
  }

  if (preset === '6months') {
    const past180 = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    return { start: past180.toISOString().split('T')[0], end: todayISO, label: 'Last 6 Months' };
  }

  if (preset === 'year') {
    const past365 = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    return { start: past365.toISOString().split('T')[0], end: todayISO, label: 'Last 1 Year' };
  }

  if (preset === 'all') {
    return { start: '', end: '', label: 'All Time' };
  }

  return { start: '', end: '', label: 'Custom Range' };
}

function getBillPaymentInfo(bill: Bill, dockets: CargoDocket[]) {
  const grandTotal = Number(bill.grand_total || 0);
  let received = 0;

  if (bill.docket_ids && bill.docket_ids.length > 0) {
    received = bill.docket_ids.reduce((sum, id) => {
      const d = dockets.find((item) => item.id === id || item.docket_no === id);
      if (!d) return sum;
      const paid = Number(d.amount_paid ?? (d.payment_mode === 'Paid' ? d.grand_total : 0)) || 0;
      return sum + paid;
    }, 0);
  }

  const finalReceived = Math.min(grandTotal, Math.max(0, received));
  const pending = Math.max(0, grandTotal - finalReceived);

  let status: 'paid' | 'partial' | 'pending' = 'pending';
  if (pending <= 0 && grandTotal > 0) {
    status = 'paid';
  } else if (finalReceived > 0) {
    status = 'partial';
  }

  return {
    grandTotal,
    received: finalReceived,
    pending,
    status,
  };
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
  const [datePreset, setDatePreset] = useState<BillDatePreset>('all');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<'all' | 'paid' | 'partial' | 'pending'>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
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
  const [customerMode, setCustomerMode] = useState<'select' | 'new'>('select');
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');
  const [customerGstin, setCustomerGstin] = useState<string>('');
  const [customerAddress, setCustomerAddress] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [customerEmail, setCustomerEmail] = useState<string>('');

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers;
    const q = customerSearch.toLowerCase();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.city && c.city.toLowerCase().includes(q)) ||
        (c.gstin && c.gstin.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q)) ||
        (c.address && c.address.toLowerCase().includes(q))
    );
  }, [customers, customerSearch]);

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
    const origin = (item.from_city || settings.defaultOriginCity || 'Mumbai').trim();
    if (!destination) return null;

    const sheetType: 'ROAD_RAIL' | 'AIR' = item.transport_mode === 'Air' ? 'AIR' : 'ROAD_RAIL';
    const wantMode = item.transport_mode === 'Air' ? 'BY AIR' : item.transport_mode === 'Train' ? 'BY RAIL' : 'BY ROAD';

    // 1. Try forward lookup: sheet for origin city -> destination
    let sheet = pickQuotationSheet(sheetType, origin);
    let match = sheet?.rates?.find(
      (r) => r.destination.trim().toUpperCase() === destination.toUpperCase() && r.mode === wantMode
    );
    let isReturn = false;

    // 2. Try return lookup: if no forward rate found, or if destination matches base origin
    if (!match) {
      const returnSheet = pickQuotationSheet(sheetType, destination) || pickQuotationSheet(sheetType, settings.defaultOriginCity || 'Mumbai');
      if (returnSheet) {
        const returnMatch = returnSheet.rates?.find(
          (r) => r.destination.trim().toUpperCase() === origin.toUpperCase() && r.mode === wantMode
        );
        if (returnMatch) {
          sheet = returnSheet;
          match = returnMatch;
          isReturn = true;
        }
      }
    }

    if (!sheet || !match) {
      return {
        hint: `No value mentioned in quotation sheet "${sheet?.name || 'Default'}" for ${destination}.`,
        canAddRate: sheet ? { sheetId: sheet.id, destination, mode: wantMode } : undefined,
      };
    }

    const isRoadOrRail = item.transport_mode === 'Road' || item.transport_mode === 'Train' || !item.transport_mode;
    const extraPerKg = (isReturn && isRoadOrRail) ? 2 : 0;
    const effectiveRatePerKg = match.ratePerKg + extraPerKg;

    const billableKg = Number(item.charged_weight_kg) || 0;
    if (billableKg <= 0) {
      return {
        hint: isReturn && extraPerKg > 0
          ? `₹${effectiveRatePerKg}/kg (₹${match.ratePerKg} base + ₹2 return) available from "${sheet.name}" — enter weight to auto-price.`
          : `₹${effectiveRatePerKg}/kg available from "${sheet.name}" — enter weight to auto-price.`,
      };
    }

    const computed = Math.round(effectiveRatePerKg * billableKg);
    return {
      hint: isReturn && extraPerKg > 0
        ? `Auto-priced (Return Journey +₹2/kg) from "${sheet.name}": ₹${effectiveRatePerKg}/kg (₹${match.ratePerKg} + ₹2) × ${billableKg}kg = ₹${computed}`
        : `Auto-priced from "${sheet.name}": ₹${effectiveRatePerKg}/kg × ${billableKg}kg = ₹${computed}`,
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
    setCustomerMode('select');
    setCustomerDropdownOpen(false);
    setCustomerSearch('');
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
    setCustomerMode('select');
    setCustomerDropdownOpen(false);
    setCustomerSearch('');
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
        particulars: d.goods_description || 'RMG',
        expected_mode: d.expected_mode,
        payment_mode: d.payment_mode,
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

  const [downloadingCsvId, setDownloadingCsvId] = useState<string | null>(null);

  const presetDates = useMemo(() => getBillPresetDates(datePreset), [datePreset]);
  const effectiveStartDate = datePreset === 'custom' ? customStartDate : presetDates.start;
  const effectiveEndDate = datePreset === 'custom' ? customEndDate : presetDates.end;

  const filteredBills = useMemo(() => {
    return bills.filter((b) => {
      // Date filter
      if (effectiveStartDate && b.invoice_date < effectiveStartDate) return false;
      if (effectiveEndDate && b.invoice_date > effectiveEndDate) return false;

      // Payment status filter
      if (paymentStatusFilter !== 'all') {
        const pay = getBillPaymentInfo(b, dockets);
        if (pay.status !== paymentStatusFilter) return false;
      }

      // Search filter
      if (!billSearch) return true;
      const q = billSearch.toLowerCase();
      return (
        b.bill_no.toLowerCase().includes(q) ||
        b.customer_name.toLowerCase().includes(q) ||
        b.invoice_date.includes(q) ||
        (b.customer_gstin && b.customer_gstin.toLowerCase().includes(q))
      );
    });
  }, [bills, effectiveStartDate, effectiveEndDate, paymentStatusFilter, billSearch, dockets]);

  const totalBilledRevenue = useMemo(
    () => filteredBills.reduce((sum, b) => sum + Number(b.grand_total || 0), 0),
    [filteredBills]
  );
  const totalPaymentReceived = useMemo(
    () => filteredBills.reduce((sum, b) => sum + getBillPaymentInfo(b, dockets).received, 0),
    [filteredBills, dockets]
  );
  const totalPaymentPending = useMemo(
    () => filteredBills.reduce((sum, b) => sum + getBillPaymentInfo(b, dockets).pending, 0),
    [filteredBills, dockets]
  );
  const totalGstCollected = useMemo(
    () => filteredBills.reduce((sum, b) => sum + Number(b.gst_amount || 0), 0),
    [filteredBills]
  );

  const handleExportBillsCSV = () => {
    if (filteredBills.length === 0) return;
    const headers = [
      'Bill No',
      'Invoice Date',
      'Customer Name',
      'Customer GSTIN',
      'Customer Address',
      'Customer Phone',
      'Customer Email',
      'Category',
      'Doc Type',
      'Reverse Charge (RCM)',
      'Line Items / LRs Count',
      'Taxable Subtotal (₹)',
      'Discount (₹)',
      'GST Percentage (%)',
      'GST Amount (₹)',
      'Round Off (₹)',
      'Grand Total (₹)',
      'Payment Received (₹)',
      'Payment Pending (₹)',
      'Payment Status',
      'Issued By',
      'Created At',
      'Payment Notes',
    ];

    const rows = filteredBills.map((b) => {
      const pay = getBillPaymentInfo(b, dockets);
      return [
        b.bill_no,
        b.invoice_date,
        b.customer_name,
        b.customer_gstin || '',
        b.customer_address || '',
        b.customer_phone || '',
        b.customer_email || '',
        b.category,
        b.doc_type,
        b.reverse_charge ? 'YES' : 'NO',
        (b.docket_ids?.length || 0) + (b.items?.length || 0),
        Number(b.subtotal || 0).toFixed(2),
        Number(b.discount || 0).toFixed(2),
        b.gst_percentage ?? 18,
        Number(b.gst_amount || 0).toFixed(2),
        Number(b.round_off || 0).toFixed(2),
        pay.grandTotal.toFixed(2),
        pay.received.toFixed(2),
        pay.pending.toFixed(2),
        pay.status.toUpperCase(),
        b.created_by_name || 'Staff',
        b.created_at ? formatCreatedAt(b.created_at) : '',
        b.notes || '',
      ];
    });

    const filterTag =
      datePreset === 'all'
        ? 'all_time'
        : datePreset === 'custom'
        ? `${customStartDate || 'start'}_to_${customEndDate || 'end'}`
        : `${datePreset}_${effectiveStartDate}_to_${effectiveEndDate}`;

    const filename = `Tax_Invoices_${filterTag}.csv`;
    downloadCSV(headers, rows, filename);
  };

  const handleDownloadHistoryBillCSV = async (bill: Bill) => {
    setDownloadingCsvId(bill.id);
    try {
      const res = await fetch(`/api/billing/${bill.id}`);
      if (res.ok) {
        const detail = await res.json();
        const dockets: BillLineDocket[] = detail.dockets ?? [];

        const headers = [
          'Sr No',
          'Booking Date',
          'LR / Docket No',
          'Particulars / Consignor',
          'From City',
          'To City',
          'Transport Mode',
          'Invoice No',
          'Package Count',
          'Charged Weight (kg)',
          'Line Amount (₹)',
        ];

        const rows = dockets.map((d, i) => [
          i + 1,
          d.booking_date || '',
          d.docket_no || '',
          d.consignor_name || d.particulars || '',
          d.from_city || '',
          d.to_city || '',
          d.transport_mode || 'Road',
          d.invoice_no || '',
          d.package_count || 1,
          d.charged_weight_kg || 0,
          Number(d.grand_total || 0).toFixed(2),
        ]);

        const filename = `Tax_Invoice_${bill.bill_no.replace(/[^a-z0-9]+/gi, '_')}_Items.csv`;
        downloadCSV(headers, rows, filename);
      }
    } catch (err) {
      console.error('Failed to download bill CSV:', err);
    } finally {
      setDownloadingCsvId(null);
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



  const validateBillStep = (step: number) => {
    if (step === 1) {
      if (!customerName.trim() && selectedDocketIds.length === 0) {
        setIssueError('Enter a Customer / Party Name (or select an LR in Step 3 to auto-fill it).');
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
      if (billStep < 4) setBillStep(billStep + 1);
    }
  };

  const handleBillPrev = () => {
    setIssueError(null);
    if (billStep > 1) setBillStep(billStep - 1);
  };

  const renderBillDocumentPreview = (noHighlight: boolean = false, disableZoom: boolean = false) => {
    const docNo = billNo || (editingDraftId ? 'INV-DRAFT' : 'INV-2026-0001');
    const displayInvoiceDate = invoiceDate || new Date().toISOString().split('T')[0];

    const displayLineItems = [
      ...selectedDockets.map((d, idx) => {
        const isCash = d.expected_mode === 'Cash' || String(d.expected_mode).toLowerCase() === 'cash' || (d.payment_mode === 'Paid' && (d as any).payment_method === 'Cash');
        const baseParticulars = d.goods_description || 'RMG';
        return {
          sr: idx + 1,
          date: d.booking_date,
          particulars: isCash ? `${baseParticulars} (Cash Expected)` : baseParticulars,
          isCashExpected: isCash,
          origin: d.from_city || '-',
          destination: d.to_city || '-',
          mode: d.transport_mode || 'Road',
          lrNo: d.docket_no,
          invoiceNo: d.invoice_no || '-',
          pcs: d.package_count || 1,
          weight: Number(d.charged_weight_kg || d.actual_weight_kg || 0),
          rate: Number(d.charged_weight_kg || 0) > 0 ? (Number(d.grand_total) / Number(d.charged_weight_kg)).toFixed(0) : '-',
          amount: Number(d.subtotal || d.grand_total || 0),
        };
      }),
      ...customItems.map((item, idx) => ({
        sr: selectedDockets.length + idx + 1,
        date: item.booking_date || displayInvoiceDate,
        particulars: item.particulars || 'Freight Charges',
        origin: item.from_city || settings.defaultOriginCity || 'Mumbai',
        destination: item.to_city || '-',
        mode: item.transport_mode || 'Road',
        lrNo: item.docket_no || '-',
        invoiceNo: item.invoice_no || '-',
        pcs: item.package_count || 1,
        weight: Number(item.charged_weight_kg || 0),
        rate: Number(item.charged_weight_kg || 0) > 0 ? (Number(item.amount) / Number(item.charged_weight_kg)).toFixed(0) : '-',
        amount: Number(item.amount || 0),
      })),
    ];

    const activeQr = settings.savedQrCodes.find((q) => q.id === settings.activeQrCodeId) || settings.savedQrCodes[0];

    const STEP_ZOOM_TARGETS: Record<number, { origin: string; scale: number; name: string }> = {
      1: { origin: '0% 25%', scale: 1.85, name: 'Billed Customer' },
      2: { origin: '0% 0%', scale: 1.85, name: 'Invoice Info' },
      3: { origin: '50% 50%', scale: 1.75, name: 'Line Items Table' },
      4: { origin: '100% 100%', scale: 1.85, name: 'Totals & Financials' },
    };

    const zoomTarget = (!disableZoom && !noHighlight) ? STEP_ZOOM_TARGETS[billStep] : null;

    return (
      <div
        style={{
          background: '#fff',
          border: '0.4px solid #94A3B8',
          fontFamily: 'sans-serif',
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
          padding: '6px',
        }}
      >
        {/* HEADER BLOCK */}
        <div style={{ borderBottom: '0.4px solid #64748B', paddingBottom: 3, display: 'flex', gap: 6, alignItems: 'center' }}>
          <img src={RUDRA_LOGO_BASE64} alt="logo" style={{ width: 26, height: 26, objectFit: 'contain', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 8.5, color: '#0A2030', fontWeight: 800, textTransform: 'uppercase', lineHeight: 1.1 }}>
              {settings.tradeName}
            </div>
            <div style={{ fontSize: 5.5, color: '#475569', marginTop: 1 }}>GSTIN: {settings.gstin}</div>
            <div style={{ fontSize: 5, color: '#475569', lineHeight: 1.2 }}>{settings.address}</div>
            <div style={{ fontSize: 5, color: '#475569' }}>
              Ph: {settings.phone1} | Email: {settings.email}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 9.5, fontWeight: 800, color: '#0A2030', textTransform: 'uppercase' }}>TAX INVOICE</div>
            <div style={{ fontSize: 5.5, color: '#64748B', fontWeight: 700 }}>ORIGINAL FOR RECIPIENT</div>
          </div>
        </div>

        {/* CUSTOMER & INVOICE DETAILS GRID */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', border: '0.4px solid #64748B', margin: '4px 0' }}>
          {/* Customer Box */}
          <div style={{ borderRight: '0.4px solid #64748B', padding: '3px 5px' }}>
            <div style={{ fontSize: 5.5, fontWeight: 800, color: '#64748B', marginBottom: 1 }}>
              CUSTOMER / BILLED TO:
            </div>
            <div style={{ fontSize: 7, fontWeight: 800, color: '#0A2030' }}>
              {customerName || '— Select Customer —'}
            </div>
            <div style={{ fontSize: 5, color: '#475569', marginTop: 1 }}>
              <strong>GSTIN:</strong> {customerGstin || 'Unregistered / B2C'}
            </div>
            <div style={{ fontSize: 5, color: '#475569' }}>
              <strong>Address:</strong> {customerAddress || '—'}
            </div>
            <div style={{ fontSize: 5, color: '#475569' }}>
              <strong>Contact:</strong> {customerPhone || '—'} | <strong>Email:</strong> {customerEmail || '—'}
            </div>
          </div>

          {/* Metadata Box */}
          <div style={{ padding: '3px 5px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 5.5 }}>
              <span style={{ color: '#64748B', fontWeight: 700 }}>Invoice No:</span>
              <span style={{ fontWeight: 800, color: '#0A2030', fontFamily: 'monospace' }}>{docNo}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 5.5 }}>
              <span style={{ color: '#64748B', fontWeight: 700 }}>Invoice Date:</span>
              <span style={{ fontWeight: 700, color: '#1E293B' }}>{displayInvoiceDate}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 5.5 }}>
              <span style={{ color: '#64748B', fontWeight: 700 }}>Category:</span>
              <span style={{ fontWeight: 700, color: '#1E293B' }}>{category}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 5.5 }}>
              <span style={{ color: '#64748B', fontWeight: 700 }}>Doc Type:</span>
              <span style={{ fontWeight: 700, color: '#1E293B' }}>{docType}</span>
            </div>
            {reverseCharge && (
              <div style={{ fontSize: 5, fontWeight: 800, color: '#D14343', textTransform: 'uppercase' }}>
                Reverse Charge (RCM): YES
              </div>
            )}
          </div>
        </div>

        {/* LINE ITEMS TABLE */}
        <div style={{ flex: 1, border: '0.4px solid #64748B', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              background: '#0A2030',
              color: '#fff',
              display: 'grid',
              gridTemplateColumns: '16px 36px 1fr 35px 35px 25px 45px 40px 20px 25px 30px 40px',
              fontSize: 5,
              fontWeight: 700,
              padding: '2px 4px',
              textAlign: 'center',
            }}
          >
            <span>Sr</span>
            <span>Date</span>
            <span style={{ textAlign: 'left' }}>Particulars</span>
            <span>Origin</span>
            <span>Dest</span>
            <span>Mode</span>
            <span>LR No</span>
            <span>Inv No</span>
            <span>Pcs</span>
            <span>Wt</span>
            <span>Rate</span>
            <span style={{ textAlign: 'right' }}>Amount</span>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {displayLineItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '10px', fontSize: 5.5, color: '#94A3B8', fontStyle: 'italic' }}>
                No line items added yet. Select LRs or add custom entries.
              </div>
            ) : (
              displayLineItems.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '16px 36px 1fr 35px 35px 25px 45px 40px 20px 25px 30px 40px',
                    fontSize: 5,
                    padding: '2px 4px',
                    borderBottom: '0.4px solid #CBD5E1',
                    alignItems: 'center',
                    background: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC',
                  }}
                >
                  <span style={{ textAlign: 'center', color: '#64748B' }}>{item.sr}</span>
                  <span style={{ color: '#475569', fontSize: 4.8 }}>{item.date}</span>
                  <span style={{ fontWeight: 700, color: '#0A2030', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.particulars}
                  </span>
                  <span style={{ color: '#475569', textAlign: 'center' }}>{item.origin}</span>
                  <span style={{ color: '#475569', textAlign: 'center' }}>{item.destination}</span>
                  <span style={{ color: '#475569', textAlign: 'center' }}>{item.mode}</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0A2030' }}>{item.lrNo}</span>
                  <span style={{ color: '#475569', textAlign: 'center' }}>{item.invoiceNo}</span>
                  <span style={{ textAlign: 'center' }}>{item.pcs}</span>
                  <span style={{ textAlign: 'center' }}>{item.weight}</span>
                  <span style={{ textAlign: 'center' }}>{item.rate}</span>
                  <span style={{ textAlign: 'right', fontWeight: 800, fontFamily: 'monospace', color: '#0A2030' }}>
                    ₹{item.amount.toLocaleString('en-IN')}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* FOOTER & TOTALS */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', border: '0.4px solid #64748B', marginTop: 4, gap: 4, padding: 3 }}>
          {/* Left Footer: Bank Details & QR Code */}
          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            {activeQr?.qrCodeUrl && (
              <img src={activeQr.qrCodeUrl} alt="UPI QR" style={{ width: 32, height: 32, border: '0.4px solid #CBD5E1', padding: 1, borderRadius: 2 }} />
            )}
            <div style={{ flex: 1, fontSize: 4.8, color: '#475569', lineHeight: 1.2 }}>
              <div style={{ fontWeight: 800, color: '#0A2030', fontSize: 5.2, textTransform: 'uppercase' }}>BANK DETAILS:</div>
              <div>Bank: {settings.bankName} | Branch: {settings.branch}</div>
              <div>A/C: <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{settings.accountNo}</span></div>
              <div>IFSC: <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{settings.ifsc}</span></div>
            </div>
          </div>

          {/* Right Footer: Financial Totals */}
          <div style={{ fontSize: 5, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
              <span>Subtotal:</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>₹{subtotal.toLocaleString('en-IN')}</span>
            </div>
            {discount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#166534' }}>
                <span>Discount:</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>- ₹{discount.toLocaleString('en-IN')}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
              <span>GST ({gstPercentage}%):</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>₹{gstAmount.toLocaleString('en-IN')}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '0.4px solid #0A2030', paddingTop: 1.5, fontSize: 6.5, fontWeight: 800, color: '#0A2030' }}>
              <span>NET TOTAL:</span>
              <span style={{ fontFamily: 'monospace' }}>₹{grandTotal.toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderSubTabSwitcher = () => (
    <div className="flex items-center gap-1.5 p-1.5 bg-white border border-slate-200/80 rounded-2xl shadow-saas shrink-0 self-start sm:self-auto">
      <button
        onClick={() => attemptSubTabChange('history')}
        className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-saas cursor-pointer ${
          (subTab as BillingSubTab) === 'history'
            ? 'bg-[#0A2030] text-white shadow-saas'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
        }`}
      >
        <History className="w-4 h-4" />
        <span>All Bills</span>
      </button>

      <button
        onClick={() => attemptSubTabChange('drafts')}
        className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-saas cursor-pointer ${
          (subTab as BillingSubTab) === 'drafts'
            ? 'bg-[#0A2030] text-white shadow-saas'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
        }`}
      >
        <Archive className="w-4 h-4" />
        <span>Drafts</span>
      </button>
    </div>
  );

  // =========================================================
  // FULL-SCREEN NEW BILL / EDIT DRAFT CREATION VIEW (Matches CargoDocketForm)
  // =========================================================
  if (subTab === 'new') {
    if (issuedBill) {
      return (
        <div className="fixed inset-0 z-50 bg-[#F8FAFC] flex flex-col">
          {/* Header bar */}
          <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2 text-emerald-700 font-bold text-sm">
              <Check className="w-4 h-4" />
              <span>Tax Invoice Issued Successfully</span>
            </div>
            <button
              onClick={() => {
                resetForm();
                attemptSubTabChange('history');
              }}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-700 cursor-pointer"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Two-column layout (50% / 50% split) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 flex-1 min-h-0">
            {/* LEFT: Success Card & Actions */}
            <div className="flex-1 overflow-y-auto px-8 md:px-12 lg:px-16 py-10 flex flex-col justify-between bg-white border-r border-slate-200">
              <div className="max-w-xl mx-auto w-full space-y-6">
                <div>
                  <span className="text-xs font-bold text-emerald-700 tracking-wider uppercase bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                    Issued & Recorded
                  </span>
                  <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-2 font-heading">
                    Tax Invoice {issuedBill.bill_no}
                  </h1>
                  <p className="text-sm text-slate-500 mt-1 font-normal">
                    Billed to <span className="font-semibold text-slate-800">{issuedBill.customer_name}</span> for ₹{Number(issuedBill.grand_total).toLocaleString('en-IN')}.
                  </p>
                </div>

                {/* Main Summary Card */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-saas space-y-3.5">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div>
                      <span className="text-xs text-slate-400 font-medium block">Party / Customer</span>
                      <span className="text-lg font-bold text-slate-900 tracking-tight mt-0.5 block">
                        {issuedBill.customer_name}
                      </span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs font-semibold px-3 py-1 bg-slate-100 text-slate-700 rounded-full">
                        {issuedBill.invoice_date}
                      </span>
                      <span className="text-[11px] font-semibold text-[#0A2030] bg-slate-100 px-2.5 py-0.5 rounded-full">
                        {issuedBill.category} · {issuedBill.doc_type}
                      </span>
                    </div>
                  </div>

                  {/* Financial Breakdown */}
                  <div className="space-y-1.5 text-xs text-slate-600">
                    <div className="flex justify-between">
                      <span>Taxable Subtotal</span>
                      <span>₹{Number(issuedBill.subtotal).toLocaleString('en-IN')}</span>
                    </div>
                    {Number(issuedBill.discount) > 0 && (
                      <div className="flex justify-between text-emerald-600">
                        <span>Discount</span>
                        <span>- ₹{Number(issuedBill.discount).toLocaleString('en-IN')}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>Output GST ({issuedBill.gst_percentage ?? 18}%)</span>
                      <span>₹{Number(issuedBill.gst_amount).toLocaleString('en-IN')}</span>
                    </div>
                    {Number(issuedBill.round_off) !== 0 && (
                      <div className="flex justify-between">
                        <span>Round Off</span>
                        <span>₹{Number(issuedBill.round_off).toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-slate-900 font-bold text-sm pt-1 border-t border-slate-200">
                      <span>Grand Total</span>
                      <span className="font-mono text-base text-[#0A2030] font-extrabold">₹{Number(issuedBill.grand_total).toLocaleString('en-IN')}</span>
                    </div>
                  </div>

                  {/* Primary Download Actions */}
                  <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      onClick={handleDownloadIssuedBill}
                      className="w-full h-11 bg-[#0A2030] hover:bg-[#071520] text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-saas cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download PDF</span>
                    </button>
                    <button
                      onClick={() => handleDownloadHistoryBillCSV(issuedBill)}
                      className="w-full h-11 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-2xs cursor-pointer"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-[#0A2030]" />
                      <span>Download CSV</span>
                    </button>
                  </div>
                </div>

                {/* Bottom Actions */}
                <div className="pt-2 flex items-center gap-3">
                  <button
                    onClick={resetForm}
                    className="flex-1 h-10 px-4 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer text-center"
                  >
                    Create another Bill
                  </button>
                  <button
                    onClick={() => {
                      resetForm();
                      attemptSubTabChange('history');
                    }}
                    className="flex-1 h-10 px-4 bg-[#0A2030] hover:bg-[#071520] text-white font-bold text-xs rounded-xl transition-colors shadow-sm cursor-pointer text-center"
                  >
                    Return to Bills
                  </button>
                </div>
              </div>
            </div>

            {/* RIGHT: Live Bill Preview */}
            <div className="hidden lg:flex items-center justify-center bg-[#F1F5F9] overflow-hidden relative p-8 overflow-y-auto">
              <div className="w-full max-w-2xl flex items-center justify-center">
                {renderBillDocumentPreview()}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="fixed inset-0 z-50 bg-[#F8FAFC] flex flex-col">
        {/* Header bar */}
        <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
          <h1 className="text-base font-bold text-slate-900 font-heading">
            {editingDraftId ? 'Edit Tax Invoice' : 'New Tax Invoice'}
          </h1>

          <div className="flex items-center gap-3">
            {/* Draft button */}
            <button
              onClick={handleSaveDraft}
              disabled={savingDraft || (!customerName && customItems.length === 0 && selectedDocketIds.length === 0)}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 disabled:opacity-40 transition-colors cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{savingDraft ? 'Saving...' : 'Save draft'}</span>
            </button>

            {/* Close / exit */}
            <button
              onClick={() => attemptSubTabChange('history')}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-700 cursor-pointer"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Two-column layout (50% / 50% split) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 flex-1 min-h-0">
          {/* LEFT: Step form (50% screen) */}
          <div className="flex flex-col bg-white border-r border-slate-200 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-8 md:px-12 lg:px-16 py-10">
              <div className="max-w-xl mx-auto w-full space-y-6">

                {/* Step 1: Customer Details */}
                {billStep === 1 && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-3xl font-bold text-slate-900 tracking-tight font-heading">Who is being billed?</h2>
                      <p className="text-sm text-slate-500 mt-1 font-normal">Select an existing customer or enter new billing details</p>
                    </div>

                    {customerMode === 'select' ? (
                      <div className="space-y-4 pt-2">
                        <div className="relative">
                          <label className="block text-sm font-semibold text-slate-700 mb-2">Customer</label>

                          {/* Dropdown trigger */}
                          <button
                            type="button"
                            onClick={() => setCustomerDropdownOpen(!customerDropdownOpen)}
                            className={`w-full h-12 px-4 bg-white border rounded-xl text-left flex items-center justify-between transition-all cursor-pointer ${
                              customerDropdownOpen
                                ? 'border-[#0A2030] ring-2 ring-[#0A2030]/10 shadow-sm'
                                : 'border-slate-200 hover:border-slate-300 shadow-2xs'
                            }`}
                          >
                            <span className={customerName ? 'text-sm font-medium text-slate-900' : 'text-sm text-slate-400'}>
                              {customerName || 'Select a customer'}
                            </span>
                            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${customerDropdownOpen ? 'rotate-180 text-slate-700' : ''}`} />
                          </button>

                          {/* Dropdown menu */}
                          {customerDropdownOpen && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setCustomerDropdownOpen(false)} />
                              <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-20 overflow-hidden">
                                {/* + Add new option */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCustomerDropdownOpen(false);
                                    setCustomerMode('new');
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
                                      value={customerSearch}
                                      onChange={(e) => setCustomerSearch(e.target.value)}
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
                                  {filteredCustomers.length === 0 ? (
                                    <div className="p-6 text-center text-xs text-slate-400">No customers found</div>
                                  ) : (
                                    filteredCustomers.map((c) => (
                                      <button
                                        key={c.id}
                                        type="button"
                                        onClick={() => {
                                          handleCustomerSelect(c.id);
                                          setCustomerDropdownOpen(false);
                                        }}
                                        className={`w-full px-4 py-3 text-left hover:bg-slate-50 transition-colors flex items-center justify-between cursor-pointer ${
                                          customerName === c.name ? 'bg-slate-100 text-[#0A2030]' : 'text-slate-800'
                                        }`}
                                      >
                                        <div className="min-w-0 pr-2">
                                          <div className={`text-sm font-semibold truncate ${customerName === c.name ? 'text-[#0A2030]' : 'text-slate-900'}`}>{c.name}</div>
                                          <div className="text-xs text-slate-400 truncate mt-0.5">
                                            {[c.city || c.address, c.email].filter(Boolean).join(' · ') || c.phone || c.code || ''}
                                          </div>
                                        </div>
                                        {customerName === c.name && <Check className="w-4 h-4 text-[#0A2030] shrink-0" />}
                                      </button>
                                    ))
                                  )}
                                </div>
                              </div>
                            </>
                          )}
                        </div>

                        {/* Selected customer summary card */}
                        {customerName && (
                          <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1.5 text-xs text-slate-600">
                            <div className="flex justify-between items-center text-slate-900 font-bold text-sm">
                              <span>{customerName}</span>
                              <button
                                type="button"
                                onClick={() => setCustomerMode('new')}
                                className="text-xs font-semibold text-[#0A2030] hover:underline cursor-pointer"
                              >
                                Edit details
                              </button>
                            </div>
                            {customerAddress && <div>{customerAddress}</div>}
                            <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-slate-500">
                              {customerGstin && <span>GSTIN: <strong className="text-slate-700 font-mono">{customerGstin}</strong></span>}
                              {customerPhone && <span>Ph: <strong className="text-slate-700">{customerPhone}</strong></span>}
                              {customerEmail && <span>Email: <strong className="text-slate-700">{customerEmail}</strong></span>}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Add new / Edit customer form */
                      <div className="space-y-5 pt-2">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                          <h3 className="text-lg font-bold text-slate-900 font-heading">
                            {customerName ? 'Edit customer details' : 'Add new customer'}
                          </h3>
                          <button
                            type="button"
                            onClick={() => setCustomerMode('select')}
                            className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                          >
                            ← Back to select
                          </button>
                        </div>

                        <div className="space-y-4">
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                              Name of Business / Customer <span className="text-red-500">*</span>
                            </label>
                            <Input
                              value={customerName}
                              onChange={(e) => setCustomerName(e.target.value)}
                              placeholder="e.g. Godrej Agrovet Ltd"
                              className="h-10 text-xs font-semibold"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Address</label>
                            <Input
                              value={customerAddress}
                              onChange={(e) => setCustomerAddress(e.target.value)}
                              placeholder="Full billing address, city, state, pin"
                              className="h-10 text-xs"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1.5">GSTIN</label>
                              <Input
                                value={customerGstin}
                                onChange={(e) => setCustomerGstin(e.target.value.toUpperCase())}
                                placeholder="27AAAA..."
                                className="h-10 text-xs font-mono uppercase"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Phone</label>
                              <Input
                                value={customerPhone}
                                onChange={(e) => setCustomerPhone(e.target.value)}
                                placeholder="+91 98765 43210"
                                className="h-10 text-xs"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Email (for sending invoice)</label>
                            <Input
                              value={customerEmail}
                              onChange={(e) => setCustomerEmail(e.target.value)}
                              placeholder="accounts@customer.com"
                              className="h-10 text-xs"
                            />
                          </div>

                          <div className="pt-2">
                            <button
                              type="button"
                              onClick={() => setCustomerMode('select')}
                              className="px-5 h-10 bg-[#0A2030] text-white text-xs font-bold rounded-xl hover:bg-[#071520] transition-colors cursor-pointer"
                            >
                              Save & Apply Customer
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Step 2: Invoice Metadata */}
                {billStep === 2 && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-3xl font-bold text-slate-900 tracking-tight font-heading">Invoice details</h2>
                      <p className="text-sm text-slate-500 mt-1 font-normal">Invoice number, dates, category and document type</p>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Bill / Invoice Number</label>
                        <Input
                          value={billNo}
                          onChange={(e) => setBillNo(e.target.value)}
                          placeholder="Auto-generated (or type custom)"
                          className="h-10 text-xs font-mono"
                        />
                        <p className="text-[11px] text-slate-400 mt-1">Leave blank to auto-generate sequentially.</p>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Invoice Date</label>
                        <Input
                          type="date"
                          value={invoiceDate}
                          onChange={(e) => setInvoiceDate(e.target.value)}
                          className="h-10 text-xs"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-1.5">Category</label>
                          <select
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                            className="w-full text-xs h-10 px-3 border border-slate-200 rounded-xl bg-white font-medium focus:outline-none focus:ring-2 focus:ring-[#0A2030]/20 cursor-pointer shadow-2xs"
                          >
                            <option value="B2B">B2B (Registered)</option>
                            <option value="B2C">B2C (Unregistered)</option>
                            <option value="SEZ">SEZ Unit</option>
                            <option value="Export">Export</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-1.5">Doc Type</label>
                          <select
                            value={docType}
                            onChange={(e) => setDocType(e.target.value)}
                            className="w-full text-xs h-10 px-3 border border-slate-200 rounded-xl bg-white font-medium focus:outline-none focus:ring-2 focus:ring-[#0A2030]/20 cursor-pointer shadow-2xs"
                          >
                            <option value="INV">Tax Invoice (INV)</option>
                            <option value="BOS">Bill of Supply (BOS)</option>
                            <option value="Challan">Delivery Challan</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 text-xs">
                        <div>
                          <div className="font-semibold text-slate-900">Reverse Charge (RCM)</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">Tax payable by recipient under reverse charge mechanism</div>
                        </div>
                        <input
                          type="checkbox"
                          checked={reverseCharge}
                          onChange={(e) => setReverseCharge(e.target.checked)}
                          className="w-4 h-4 text-[#0A2030] rounded cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 3: Line Items & Shipments */}
                {billStep === 3 && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-3xl font-bold text-slate-900 tracking-tight font-heading">Line items & shipments</h2>
                        <p className="text-sm text-slate-500 mt-1 font-normal">Attach unbilled LR dockets or add custom freight entries</p>
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddCustomItem}
                        className="gap-1.5 text-xs text-[#0A2030] border-slate-200 hover:bg-slate-50 cursor-pointer shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Custom Item</span>
                      </Button>
                    </div>

                    {/* Available LRs Checklist */}
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
                            className="text-[11px] font-semibold text-[#0A2030] hover:underline cursor-pointer"
                          >
                            {selectedDocketIds.length === availableDockets.length ? 'Deselect All LRs' : 'Select All LRs'}
                          </button>
                        </div>

                        <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-slate-50/50">
                          {availableDockets.map((d) => {
                            const isSelected = selectedDocketIds.includes(d.id);
                            const isCash = d.expected_mode === 'Cash' || String(d.expected_mode).toLowerCase() === 'cash' || (d.payment_mode === 'Paid' && (d as any).payment_method === 'Cash');

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
                                  isSelected ? 'bg-[#0A2030]/5 border-l-4 border-l-[#0A2030]' : 'hover:bg-white'
                                }`}
                              >
                                <div className="flex items-center gap-2.5">
                                  <div
                                    className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                      isSelected ? 'bg-[#0A2030] border-[#0A2030] text-white' : 'border-slate-300 bg-white'
                                    }`}
                                  >
                                    {isSelected && <Check className="w-3 h-3" />}
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="font-mono font-bold text-[#0A2030]">{d.docket_no}</span>
                                      <span className="text-slate-500 text-[11px] font-mono">({d.booking_date})</span>
                                      {isCash ? (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-yellow-100 text-yellow-900 border border-yellow-300">
                                          Cash
                                        </span>
                                      ) : d.expected_mode ? (
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600">
                                          {d.expected_mode}
                                        </span>
                                      ) : null}
                                    </div>
                                    <div className="text-[11px] text-slate-600 font-medium mt-0.5">
                                      {d.from_city} → {d.to_city} ({d.articles_count || d.package_count} pcs) · {d.consignor_name}
                                    </div>
                                  </div>
                                </div>
                                <div className="font-mono font-bold text-slate-900 text-right shrink-0">
                                  <div>₹{Number(d.grand_total).toLocaleString('en-IN')}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Custom Line Items Grid */}
                    <div className="space-y-2 pt-2">
                      <div className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                        <span>Custom Line Entries ({customItems.length})</span>
                      </div>

                      {customItems.map((item, idx) => (
                        <div key={item.id || idx} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                          <div className="flex items-center justify-between text-xs font-bold text-slate-700 border-b border-slate-200 pb-1.5">
                            <span>Item #{idx + 1}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveCustomItem(idx)}
                              className="h-6 w-6 p-0 hover:bg-red-50 text-red-500 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>

                          <div className="grid grid-cols-2 gap-2.5">
                            <div>
                              <label className="text-[10px] font-semibold text-slate-500">Particulars</label>
                              <Input
                                value={item.particulars || ''}
                                onChange={(e) => handleUpdateCustomItem(idx, 'particulars', e.target.value)}
                                placeholder="Freight charges"
                                className="mt-0.5 text-xs h-8"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-semibold text-slate-500">Amount (₹)</label>
                              <Input
                                type="number"
                                value={item.amount || ''}
                                onChange={(e) => handleUpdateCustomItem(idx, 'amount', Number(e.target.value))}
                                className="mt-0.5 text-xs font-mono h-8 font-bold text-[#0A2030]"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Step 4: Financials & Tax */}
                {billStep === 4 && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-3xl font-bold text-slate-900 tracking-tight font-heading">Financials & tax</h2>
                      <p className="text-sm text-slate-500 mt-1 font-normal">Taxable subtotal, discounts, GST rate and net total</p>
                    </div>

                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-1.5">Subtotal (₹)</label>
                          <Input
                            type="number"
                            value={manualSubtotal !== '' ? manualSubtotal : subtotal}
                            onChange={(e) => setManualSubtotal(e.target.value)}
                            placeholder={String(calculatedSubtotal)}
                            className="h-10 text-xs font-mono font-bold text-slate-900"
                          />
                          <p className="text-[10px] text-slate-400 mt-1">Sum of items: ₹{calculatedSubtotal.toLocaleString('en-IN')}</p>
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-1.5">Discount (₹)</label>
                          <Input
                            type="number"
                            value={discount}
                            onChange={(e) => setDiscount(Number(e.target.value))}
                            className="h-10 text-xs font-mono text-emerald-600 font-bold"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-1.5">GST Rate (%)</label>
                          <select
                            value={gstPercentage}
                            onChange={(e) => {
                              setGstPercentage(Number(e.target.value));
                              setManualGstAmount('');
                            }}
                            className="w-full text-xs h-10 px-3 border border-slate-200 rounded-xl bg-white font-mono font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0A2030]/20 cursor-pointer shadow-2xs"
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
                          <label className="block text-sm font-semibold text-slate-700 mb-1.5">GST Amount (₹)</label>
                          <Input
                            type="number"
                            value={manualGstAmount !== '' ? manualGstAmount : gstAmount}
                            onChange={(e) => setManualGstAmount(e.target.value)}
                            className="h-10 text-xs font-mono font-bold text-slate-900"
                          />
                          <p className="text-[10px] text-slate-400 mt-1">Calculated: ₹{calculatedGst.toLocaleString('en-IN')}</p>
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-1.5">Notes / Payment Terms</label>
                          <Input
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="e.g. Payment due within 15 days"
                            className="h-10 text-xs"
                          />
                        </div>
                      </div>

                      {/* Summary Box */}
                      <div className="p-4 bg-[#F8FAFC] border border-slate-200 rounded-2xl space-y-2 text-xs font-sans">
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
                          <span className="font-mono font-bold text-slate-900">₹{gstAmount.toLocaleString('en-IN')}</span>
                        </div>
                        {Number(roundOff) !== 0 && (
                          <div className="flex justify-between text-slate-600">
                            <span>Round Off:</span>
                            <span className="font-mono font-bold text-slate-900">₹{roundOff.toFixed(2)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-sm font-bold text-slate-900 border-t border-slate-200 pt-2.5">
                          <span>Net Invoice Grand Total:</span>
                          <span className="font-mono text-[#0A2030] text-lg font-extrabold">₹{grandTotal.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 italic pt-1 font-mono">{amountInWords}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Nav footer */}
            <div className="px-8 md:px-12 lg:px-16 py-5 border-t border-slate-100 bg-white shrink-0">
              <div className="max-w-xl mx-auto w-full space-y-3">
                {issueError && (
                  <div className="p-3 rounded-xl text-xs font-semibold flex items-center gap-2 bg-red-50 text-red-600 border border-red-100 animate-in fade-in duration-150">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-current" />
                    <span>{issueError}</span>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleBillPrev}
                    disabled={billStep === 1}
                    className="flex items-center gap-1.5 px-5 h-10 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  >
                    ← Back
                  </button>

                  {billStep < 4 ? (
                    <button
                      type="button"
                      onClick={handleBillNext}
                      className="flex items-center gap-2 px-7 h-10 rounded-xl bg-[#0A2030] hover:bg-[#071520] text-white text-sm font-bold transition-colors shadow-sm cursor-pointer"
                    >
                      Next <ArrowRight className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleIssueBill}
                      disabled={issuing || (selectedDocketIds.length === 0 && customItems.length === 0)}
                      className="flex items-center gap-2 px-7 h-10 rounded-xl bg-[#0A2030] hover:bg-[#071520] text-white text-sm font-bold transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
                    >
                      {issuing ? 'Issuing...' : 'Issue Tax Invoice'}
                      {!issuing && <ArrowRight className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: Live Bill Sheet Preview (50% screen) */}
          <div className="hidden lg:flex items-center justify-center bg-[#F1F5F9] overflow-hidden relative p-8 overflow-y-auto">
            <div className="w-full max-w-2xl flex items-center justify-center">
              {renderBillDocumentPreview()}
            </div>
          </div>
        </div>

        {/* Unsaved changes confirmation dialog if any */}
        {pendingSubTab && (
          <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl p-6 max-w-md w-full border border-slate-200 shadow-2xl">
              <h3 className="text-base font-bold text-slate-900 mb-2">Unsaved changes</h3>
              <p className="text-xs text-slate-600 mb-4">
                {"This bill hasn't been issued yet. Save it as a draft to finish later, or discard your changes."}
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => resolvePendingSubTab('cancel')}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-sm font-semibold text-slate-600 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => resolvePendingSubTab('discard')}
                  className="px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 rounded-xl text-sm font-semibold cursor-pointer"
                >
                  Discard
                </button>
                <button
                  onClick={() => resolvePendingSubTab('save')}
                  disabled={leaveSaving}
                  className="px-4 py-2 bg-[#0A2030] hover:bg-[#071520] text-white rounded-xl text-sm font-bold disabled:opacity-50 cursor-pointer"
                >
                  {leaveSaving ? 'Saving...' : 'Save as Draft'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================
  // OVERVIEW: HISTORY & DRAFTS LIST VIEW
  // =========================================================
  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top Header & Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Tax Billing & Invoices</h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Create custom & consolidated GST tax invoices, manage drafts, and review all issued billing history.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-auto">
          {/* Export CSV Button (Visible ONLY on All Bills / history) */}
          {subTab === 'history' && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportBillsCSV}
              disabled={filteredBills.length === 0}
              className="h-10 px-3.5 rounded-xl border-slate-200/90 text-xs font-semibold text-slate-700 hover:bg-slate-50 gap-1.5 shadow-saas cursor-pointer"
              title={`Export ${filteredBills.length} filtered invoices to Excel / CSV spreadsheet`}
            >
              <FileSpreadsheet className="w-4 h-4 text-[#0A2030]" />
              <span>Export CSV</span>
            </Button>
          )}

          {/* Primary Action: New Bill Button */}
          <button
            onClick={() => attemptSubTabChange('new')}
            className="flex items-center gap-1.5 h-10 px-4 text-xs font-semibold rounded-xl bg-[#0A2030] hover:bg-[#071520] text-white shadow-saas transition-saas cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Bill</span>
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {/* Quick Metrics Bar (Persistent for both All Bills and Drafts) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Invoices */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-saas transition-saas hover:-translate-y-0.5">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Invoices</p>
                <h3 className="text-2xl font-bold text-slate-900 font-mono mt-1.5 tracking-tight">
                  {subTab === 'history' ? filteredBills.length : bills.length}
                </h3>
              </div>
              <div className="w-8 h-8 rounded-lg bg-[#0A2030]/10 text-[#0A2030] flex items-center justify-center">
                <FileText className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 text-xs text-slate-500 font-medium border-t border-slate-100 pt-2.5">
              {subTab === 'history' && datePreset !== 'all' ? 'In selected period' : 'Recorded in system'}
            </div>
          </div>

          {/* Card 2: Billed Revenue */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-saas transition-saas hover:-translate-y-0.5">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Billed Revenue</p>
                <h3 className="text-2xl font-bold text-slate-900 font-mono mt-1.5 tracking-tight">
                  ₹{totalBilledRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </h3>
              </div>
              <div className="w-8 h-8 rounded-lg bg-[#0A2030]/10 text-[#0A2030] flex items-center justify-center">
                <Receipt className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 text-xs text-slate-500 font-medium border-t border-slate-100 pt-2.5">
              Gross invoice sum
            </div>
          </div>

          {/* Card 3: Payment Received */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-saas transition-saas hover:-translate-y-0.5">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Payment Received</p>
                <h3 className="text-2xl font-bold text-[#1F8A4C] font-mono mt-1.5 tracking-tight">
                  ₹{totalPaymentReceived.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </h3>
              </div>
              <div className="w-8 h-8 rounded-lg bg-[#E8F7EF] text-[#1F8A4C] flex items-center justify-center">
                <Check className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 text-xs text-slate-500 font-medium border-t border-slate-100 pt-2.5">
              Collected funds
            </div>
          </div>

          {/* Card 4: Payment Pending */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-saas transition-saas hover:-translate-y-0.5">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Payment Pending</p>
                <h3 className="text-2xl font-bold text-[#D14343] font-mono mt-1.5 tracking-tight">
                  ₹{totalPaymentPending.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </h3>
              </div>
              <div className="w-8 h-8 rounded-lg bg-[#FEE2E2] text-[#D14343] flex items-center justify-center">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 text-xs text-slate-500 font-medium border-t border-slate-100 pt-2.5">
              Outstanding balance
            </div>
          </div>
        </div>

        {/* Search Bar, Date Range Filters & Toolbar Row */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 flex-1">
            {/* Search Bar */}
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={billSearch}
                onChange={(e) => setBillSearch(e.target.value)}
                placeholder="Search by Bill No, Customer, or Date..."
                className="w-full h-10 pl-9.5 pr-4 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 placeholder:text-slate-400 shadow-2xs focus:outline-none focus:ring-2 focus:ring-[#0A2030]/10 focus:border-[#0A2030] transition-colors"
              />
            </div>

            {/* Date & Payment Filter Controls (Visible ONLY on All Bills / history) */}
            {subTab === 'history' && (
              <div className="flex flex-wrap items-center gap-2">
                {/* Date Preset Filter */}
                <select
                  value={datePreset}
                  onChange={(e) => setDatePreset(e.target.value as BillDatePreset)}
                  className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 shadow-2xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#0A2030]/10 focus:border-[#0A2030] transition-colors"
                >
                  <option value="all">All Time</option>
                  <option value="this_month">This Month</option>
                  <option value="last_month">Last Month</option>
                  <option value="quarter">Last 3 Months (Quarter)</option>
                  <option value="6months">Last 6 Months</option>
                  <option value="year">Last 1 Year</option>
                  <option value="custom">Custom Range</option>
                </select>

                {/* Payment Status Filter */}
                <select
                  value={paymentStatusFilter}
                  onChange={(e) => setPaymentStatusFilter(e.target.value as any)}
                  className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 shadow-2xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#0A2030]/10 focus:border-[#0A2030] transition-colors"
                >
                  <option value="all">All Payment Statuses</option>
                  <option value="paid">Paid</option>
                  <option value="partial">Partial Payment</option>
                  <option value="pending">Pending Payment</option>
                </select>

                {datePreset === 'custom' && (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-mono text-slate-700 shadow-2xs focus:outline-none focus:ring-2 focus:ring-[#0A2030]/10 focus:border-[#0A2030] transition-colors"
                    />
                    <span className="text-xs text-slate-400 font-medium">to</span>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-mono text-slate-700 shadow-2xs focus:outline-none focus:ring-2 focus:ring-[#0A2030]/10 focus:border-[#0A2030] transition-colors"
                    />
                  </div>
                )}

                {(datePreset !== 'all' || paymentStatusFilter !== 'all' || billSearch) && (
                  <button
                    type="button"
                    onClick={() => {
                      setDatePreset('all');
                      setPaymentStatusFilter('all');
                      setBillSearch('');
                      setCustomStartDate('');
                      setCustomEndDate('');
                    }}
                    className="h-10 px-3 rounded-xl border border-slate-200 text-xs font-semibold text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
                    title="Reset all filters"
                  >
                    Reset
                  </button>
                )}
              </div>
            )}
          </div>

          {renderSubTabSwitcher()}
        </div>

        {/* DRAFTS VIEW */}
        {subTab === 'drafts' && <BillDraftList onEdit={handleLoadDraft} />}

        {/* HISTORY / ALL BILLS VIEW */}
        {subTab === 'history' && (
          <>
            {/* Bills Table Card */}
            {loadingBills ? (
              <div className="text-center py-16 text-xs text-slate-400 font-mono">Loading bills database...</div>
            ) : filteredBills.length === 0 ? (
              <Card className="p-12 text-center shadow-saas">
                <Receipt className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <h3 className="text-sm font-bold text-slate-800">No bills found</h3>
                <p className="text-xs text-slate-400 mt-1">
                  {billSearch || datePreset !== 'all'
                    ? 'Try clearing or resetting your active search/date filters.'
                    : 'Create your first Tax Invoice by clicking "New Bill".'}
                </p>
                {!billSearch && datePreset === 'all' && (
                  <Button
                    onClick={() => attemptSubTabChange('new')}
                    size="sm"
                    className="mt-4 gap-2 bg-[#0A2030] hover:bg-[#071520] text-white"
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
                        <th className="px-4 py-4">BILL NO.</th>
                        <th className="px-4 py-4">DATE</th>
                        <th className="px-4 py-4">CUSTOMER</th>
                        <th className="px-4 py-4">ITEMS</th>
                        <th className="px-4 py-4 text-right">TOTAL AMOUNT</th>
                        <th className="px-4 py-4 text-right">RECEIVED</th>
                        <th className="px-4 py-4 text-right">PENDING</th>
                        <th className="px-4 py-4 text-center">STATUS</th>
                        <th className="px-4 py-4 text-right">ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredBills.map((b) => {
                        const pay = getBillPaymentInfo(b, dockets);
                        const isExpanded = expandedId === b.id;
                        const itemCount = (b.docket_ids?.length || 0) + (b.items?.length || 0);

                        return (
                          <Fragment key={b.id}>
                            <tr className="hover:bg-[#F8FAFC] transition-saas cursor-pointer" onClick={() => handleToggleExpandHistory(b)}>
                              <td className="px-4 py-4 font-mono font-bold text-[#0A2030]">{b.bill_no}</td>
                              <td className="px-4 py-4 text-slate-600">{b.invoice_date}</td>
                              <td className="px-4 py-4">
                                <div className="font-semibold text-slate-900">{b.customer_name}</div>
                                <div className="text-[10px] text-slate-400 font-mono">
                                  {b.category} · {b.doc_type}
                                </div>
                              </td>
                              <td className="px-4 py-4 font-mono text-slate-600">{itemCount} items</td>
                              <td className="px-4 py-4 text-right font-mono font-bold text-slate-900 text-sm">
                                ₹{Number(b.grand_total).toLocaleString('en-IN')}
                              </td>
                              <td className="px-4 py-4 text-right font-mono font-semibold text-emerald-600">
                                ₹{pay.received.toLocaleString('en-IN')}
                              </td>
                              <td className="px-4 py-4 text-right font-mono font-semibold">
                                {pay.pending > 0 ? (
                                  <span className="text-rose-600">₹{pay.pending.toLocaleString('en-IN')}</span>
                                ) : (
                                  <span className="text-slate-400 font-normal">₹0</span>
                                )}
                              </td>
                              <td className="px-4 py-4 text-center">
                                {pay.status === 'paid' ? (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
                                    Paid
                                  </span>
                                ) : pay.status === 'partial' ? (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">
                                    Partial
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-900 border border-rose-300 shadow-2xs">
                                    Pending
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-4 text-right" onClick={(e) => e.stopPropagation()}>
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
                                    {downloadingId === b.id ? <Loader2 className="w-4 h-4 animate-spin text-[#0A2030]" /> : <Download className="w-4 h-4 text-[#0A2030]" />}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDownloadHistoryBillCSV(b)}
                                    disabled={downloadingCsvId === b.id}
                                    title="Download line items CSV"
                                  >
                                    {downloadingCsvId === b.id ? (
                                      <Loader2 className="w-4 h-4 animate-spin text-[#0A2030]" />
                                    ) : (
                                      <FileSpreadsheet className="w-4 h-4 text-slate-500 hover:text-[#0A2030]" />
                                    )}
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
                                <td colSpan={9} className="px-6 py-4">
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
                                        <div className="flex items-center justify-between px-3 py-2 bg-slate-50/80 border-b border-slate-200">
                                          <span className="text-[11px] font-bold text-slate-700">Line Items Breakdown ({expandedDockets.length})</span>
                                          <button
                                            onClick={() => handleDownloadHistoryBillCSV(b)}
                                            disabled={downloadingCsvId === b.id}
                                            className="text-[11px] font-semibold text-[#0A2030] hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                          >
                                            <FileSpreadsheet className="w-3 h-3 text-[#0A2030]" />
                                            <span>Download CSV</span>
                                          </button>
                                        </div>
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
                                            {expandedDockets.map((d, i) => {
                                              const isCash = d.expected_mode === 'Cash' || String(d.expected_mode).toLowerCase() === 'cash' || (d.payment_mode === 'Paid' && (d as any).payment_method === 'Cash');
                                              return (
                                                <tr key={i}>
                                                  <td className="px-3 py-2 text-slate-400 font-mono">{i + 1}</td>
                                                  <td className="px-3 py-2 font-mono text-slate-600">{d.booking_date}</td>
                                                  <td className="px-3 py-2 font-mono font-bold text-[#0A2030]">{d.docket_no}</td>
                                                  <td className="px-3 py-2 text-slate-800">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                      <span>{d.consignor_name}</span>
                                                      {isCash && (
                                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-yellow-100 text-yellow-900 border border-yellow-300">
                                                          Cash
                                                        </span>
                                                      )}
                                                    </div>
                                                  </td>
                                                  <td className="px-3 py-2 text-slate-600">{d.from_city && d.to_city ? `${d.from_city} → ${d.to_city}` : '—'}</td>
                                                  <td className="px-3 py-2 font-mono">{d.package_count}</td>
                                                  <td className="px-3 py-2 font-mono">{d.charged_weight_kg} kg</td>
                                                  <td className="px-3 py-2 text-right font-mono font-semibold text-slate-900">
                                                    ₹{Number(d.grand_total).toLocaleString('en-IN')}
                                                  </td>
                                                </tr>
                                              );
                                            })}
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
          </>
        )}
      </div>
    </div>
  );
});

export default BillingView;

