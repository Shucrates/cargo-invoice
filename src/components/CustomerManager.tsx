'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Users,
  Plus,
  Search,
  Building2,
  Phone,
  Mail,
  FileText,
  MapPin,
  X,
  Pencil,
  Trash2,
  CreditCard,
  Receipt,
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronRight,
  TrendingUp,
  History,
  Eye,
  ArrowLeft,
  DollarSign,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  Wallet
} from 'lucide-react';
import { PAYMENT_METHODS } from '@/lib/paymentMethod';
import { downloadCSV } from '@/lib/exportUtils';

export interface CustomerProfile {
  id: string;
  code: string;
  name: string;
  contactPerson?: string | null;
  address?: string | null;
  city?: string | null;
  pinCode?: string | null;
  phone?: string | null;
  gstin?: string | null;
  email?: string | null;
  paymentTermsDays?: number | null;
  creditLimit?: number | null;
  notes?: string | null;
  totalBilled?: number;
  totalPaid?: number;
  outstandingAmount?: number;
  outstandingCredit?: number;
  outstandingToPay?: number;
  totalOutstanding?: number;
  totalLRCount?: number;
}

export interface CustomerDetailedStats extends CustomerProfile {
  dockets?: Array<{
    id: string;
    docket_no: string;
    booking_date: string;
    from_city: string;
    to_city: string;
    consignee_name: string;
    transport_mode: string;
    payment_mode: 'Paid' | 'To Pay' | 'Credit';
    expected_mode?: string | null;
    grand_total: number;
    total_paid: number;
    outstanding_amount: number;
    status: string;
  }>;
  payments?: Array<{
    id: string;
    docket_id: string;
    docket_no: string;
    amount: number;
    method: string;
    paid_at: string;
    notes?: string | null;
    recorded_by_name?: string | null;
  }>;
}

interface CustomerManagerProps {
  onSelectCustomer?: (customer: CustomerProfile) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export default function CustomerManager({ onSelectCustomer, isOpen = true, onClose }: CustomerManagerProps) {
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerProfile | null>(null);

  // Selected customer for full page view (NOT a pop-up window)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerDetail, setCustomerDetail] = useState<CustomerDetailedStats | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [activeTab, setActiveTab] = useState<'lrs' | 'payments' | 'info'>('lrs');
  const [lrFilter, setLrFilter] = useState<'all' | 'credit' | 'unpaid' | 'paid'>('all');

  // Bulk payment modal
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('Bank Transfer');
  const [payTargetMode, setPayTargetMode] = useState<'all' | 'credit' | 'to_pay'>('all');
  const [payNotes, setPayNotes] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [submittingPay, setSubmittingPay] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  // Individual LR payment recording modal
  const [selectedLrForPayment, setSelectedLrForPayment] = useState<{ id: string; docket_no: string; outstanding_amount: number } | null>(null);
  const [lrPayAmount, setLrPayAmount] = useState('');
  const [lrPayMethod, setLrPayMethod] = useState('Bank Transfer');
  const [lrPayNotes, setLrPayNotes] = useState('');
  const [lrPayDate, setLrPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [submittingLrPay, setSubmittingLrPay] = useState(false);
  const [lrPayError, setLrPayError] = useState<string | null>(null);

  // Form states for New/Edit customer
  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [gstin, setGstin] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomerProfile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchCustomers = async () => {
    try {
      const res = await fetch('/api/customers');
      if (res.ok) {
        const data = await res.json();
        setCustomers(data);
      }
    } catch (err) {
      console.error('Failed to fetch customers:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomerDetail = async (id: string) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/customers/${id}`);
      if (res.ok) {
        const data = await res.json();
        setCustomerDetail(data);
      }
    } catch (err) {
      console.error('Failed to fetch customer details:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  useEffect(() => {
    if (selectedCustomerId) {
      fetchCustomerDetail(selectedCustomerId);
    } else {
      setCustomerDetail(null);
    }
  }, [selectedCustomerId]);

  const openNewForm = () => {
    setEditingCustomer(null);
    setName('');
    setContactPerson('');
    setPhone('');
    setAddress('');
    setCity('');
    setPinCode('');
    setGstin('');
    setEmail('');
    setNotes('');
    setError(null);
    setShowModal(true);
  };

  const openEditForm = (c: CustomerProfile) => {
    setEditingCustomer(c);
    setName(c.name);
    setContactPerson(c.contactPerson || '');
    setPhone(c.phone || '');
    setAddress(c.address || '');
    setCity(c.city || '');
    setPinCode(c.pinCode || '');
    setGstin(c.gstin || '');
    setEmail(c.email || '');
    setNotes(c.notes || '');
    setError(null);
    setShowModal(true);
  };

  const handleDeleteCustomer = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/customers/${deleteTarget.id}`, { method: 'DELETE' });
      if (res.ok) {
        setCustomers((prev) => prev.filter((c) => c.id !== deleteTarget.id));
        if (selectedCustomerId === deleteTarget.id) {
          setSelectedCustomerId(null);
        }
        setDeleteTarget(null);
      } else {
        const errJson = await res.json();
        setDeleteError(errJson.error || 'Failed to delete customer');
      }
    } catch (err) {
      console.error('Failed to delete customer:', err);
      setDeleteError('Failed to delete customer.');
    } finally {
      setDeleting(false);
    }
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Customer Name is required.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        name,
        contactPerson,
        phone,
        address,
        city,
        pinCode,
        gstin,
        email,
        notes,
      };
      const url = editingCustomer ? `/api/customers/${editingCustomer.id}` : '/api/customers';
      const method = editingCustomer ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to save customer');
      }

      await fetchCustomers();
      if (selectedCustomerId) {
        await fetchCustomerDetail(selectedCustomerId);
      }
      setShowModal(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId) return;
    const amt = Number(payAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setPayError('Please enter a valid payment amount.');
      return;
    }

    setSubmittingPay(true);
    setPayError(null);

    try {
      const res = await fetch(`/api/customers/${selectedCustomerId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amt,
          method: payMethod,
          targetMode: payTargetMode,
          notes: payNotes,
          paidAt: payDate,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to record payment');
      }

      await fetchCustomers();
      await fetchCustomerDetail(selectedCustomerId);
      setShowPaymentModal(false);
      setPayAmount('');
      setPayNotes('');
    } catch (err: any) {
      setPayError(err.message);
    } finally {
      setSubmittingPay(false);
    }
  };

  const handleRecordLrPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLrForPayment) return;
    const amt = Number(lrPayAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setLrPayError('Please enter a valid payment amount.');
      return;
    }

    setSubmittingLrPay(true);
    setLrPayError(null);

    try {
      const res = await fetch(`/api/dockets/${selectedLrForPayment.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amt,
          method: lrPayMethod,
          notes: lrPayNotes || `Direct payment for ${selectedLrForPayment.docket_no}`,
          paidAt: lrPayDate,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to record LR payment');
      }

      await fetchCustomers();
      if (selectedCustomerId) {
        await fetchCustomerDetail(selectedCustomerId);
      }
      setSelectedLrForPayment(null);
      setLrPayAmount('');
      setLrPayNotes('');
    } catch (err: any) {
      setLrPayError(err.message);
    } finally {
      setSubmittingLrPay(false);
    }
  };

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.code.toLowerCase().includes(search.toLowerCase()) ||
      (c.contactPerson && c.contactPerson.toLowerCase().includes(search.toLowerCase())) ||
      (c.city && c.city.toLowerCase().includes(search.toLowerCase())) ||
      (c.phone && c.phone.includes(search)) ||
      (c.gstin && c.gstin.toLowerCase().includes(search.toLowerCase()))
  );

  const [sortField, setSortField] = useState<'name' | 'totalBilled' | 'outstandingCredit' | 'totalPaid'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const handleSort = (field: 'name' | 'totalBilled' | 'outstandingCredit' | 'totalPaid') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder(field === 'name' ? 'asc' : 'desc');
    }
  };

  const sortedCustomers = [...filteredCustomers].sort((a, b) => {
    let aVal: number | string = 0;
    let bVal: number | string = 0;

    if (sortField === 'name') {
      aVal = a.name.toLowerCase();
      bVal = b.name.toLowerCase();
    } else if (sortField === 'totalBilled') {
      aVal = a.totalBilled || 0;
      bVal = b.totalBilled || 0;
    } else if (sortField === 'outstandingCredit') {
      aVal = a.outstandingCredit || 0;
      bVal = b.outstandingCredit || 0;
    } else if (sortField === 'totalPaid') {
      aVal = a.totalPaid || 0;
      bVal = b.totalPaid || 0;
    }

    if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  const formatCurrency = (val?: number | null) => `₹${(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const handleExportCustomersCSV = () => {
    if (sortedCustomers.length === 0) return;
    const headers = [
      'Customer Code',
      'Company / Customer Name',
      'Contact Person',
      'Phone',
      'Email',
      'GSTIN',
      'Address',
      'City',
      'PIN Code',
      'Total LRs',
      'Total Billed (₹)',
      'Total Collected (₹)',
      'Outstanding Credit (₹)',
      'Notes',
    ];

    const rows = sortedCustomers.map((c) => [
      c.code || '',
      c.name || '',
      c.contactPerson || '',
      c.phone || '',
      c.email || '',
      c.gstin || '',
      c.address || '',
      c.city || '',
      c.pinCode || '',
      c.totalLRCount || 0,
      (c.totalBilled || 0).toFixed(2),
      (c.totalPaid || 0).toFixed(2),
      (c.outstandingCredit || 0).toFixed(2),
      c.notes || '',
    ]);

    const filename = `customer_profiles_${new Date().toISOString().split('T')[0]}.csv`;
    downloadCSV(headers, rows, filename);
  };

  const handleExportCustomerLedgerCSV = () => {
    if (!customerDetail) return;
    const headers = [
      'LR Number',
      'Booking Date',
      'From',
      'To',
      'Consignee',
      'Mode',
      'Payment Mode',
      'Grand Total (₹)',
      'Paid (₹)',
      'Credit Balance (₹)',
      'Status',
    ];

    const rows = (customerDetail.dockets || []).map((d) => [
      d.docket_no,
      d.booking_date,
      d.from_city,
      d.to_city,
      d.consignee_name,
      d.transport_mode,
      d.payment_mode,
      d.grand_total.toFixed(2),
      d.total_paid.toFixed(2),
      d.outstanding_amount.toFixed(2),
      d.status,
    ]);

    const sanitizedName = customerDetail.name.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `${customerDetail.code}_${sanitizedName}_ledger_${new Date().toISOString().split('T')[0]}.csv`;
    downloadCSV(headers, rows, filename);
  };

  /* ─────────────────────────────────────────────────────────────
     IF A CUSTOMER IS SELECTED: RENDER A COMPLETE NEW FULL-PAGE VIEW 
     (NOT A POPUP WINDOW)
  ───────────────────────────────────────────────────────────── */
  if (selectedCustomerId) {
    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        {/* Full Page Top Navigation & Action Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200/80 shadow-saas rounded-2xl p-6">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedCustomerId(null)}
              className="gap-2 text-slate-700 hover:text-slate-900 border-slate-300 shadow-2xs cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Customer Directory</span>
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCustomerLedgerCSV}
              className="gap-1.5 border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export LRs (CSV)</span>
            </Button>
            {customerDetail && ((customerDetail.outstandingCredit || 0) + (customerDetail.outstandingToPay || 0)) > 0 && (
              <Button
                size="sm"
                onClick={() => {
                  const totalOutstanding = (customerDetail.outstandingCredit || 0) + (customerDetail.outstandingToPay || 0);
                  setPayAmount(totalOutstanding > 0 ? totalOutstanding.toFixed(2) : '');
                  setPayTargetMode('all');
                  setPayError(null);
                  setShowPaymentModal(true);
                }}
                className="bg-[#0A2030] hover:bg-[#071520] text-white font-semibold gap-1.5 shadow-saas"
              >
                <CreditCard className="w-4 h-4" />
                <span>Record Bulk Settlement</span>
              </Button>
            )}
            {customerDetail && (
              <Button variant="outline" size="sm" onClick={() => openEditForm(customerDetail)} className="gap-1.5">
                <Pencil className="w-3.5 h-3.5" />
                <span>Edit Profile</span>
              </Button>
            )}
          </div>
        </div>

        {/* Customer Detail Full Page Main Content */}
        <Card className="border border-slate-200/80 shadow-saas bg-white rounded-2xl p-6 md:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-100 gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-3xl font-bold text-slate-900 tracking-tight font-heading">
                  {customerDetail?.name || 'Customer Account Profile'}
                </h1>
                <Badge variant="outline" className="font-mono text-sm text-[#0A2030] bg-[#0A2030]/5 border-[#0A2030]/20 px-2.5 py-0.5">
                  {customerDetail?.code}
                </Badge>
                {customerDetail && customerDetail.outstandingCredit! > 0 ? (
                  <Badge variant="outline" className="font-semibold text-xs text-[#D14343] bg-red-50/50 border-red-200 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 text-[#D14343]" />
                    Credit Outstanding: {formatCurrency(customerDetail.outstandingCredit)}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="font-semibold text-xs text-slate-700 bg-slate-50 border-slate-200 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-slate-500" />
                    Account in Good Standing
                  </Badge>
                )}
              </div>
              {customerDetail?.contactPerson && (
                <p className="text-xs text-slate-500 font-medium">
                  Primary Contact: <span className="text-slate-800 font-semibold">{customerDetail.contactPerson}</span>
                  {customerDetail.phone && <span> &bull; {customerDetail.phone}</span>}
                  {customerDetail.email && <span> &bull; {customerDetail.email}</span>}
                </p>
              )}
            </div>
          </div>

          {loadingDetail ? (
            <div className="py-16 text-center text-xs text-slate-400 font-mono">Loading complete customer financial ledger...</div>
          ) : customerDetail ? (
            <div className="space-y-6">
              {/* Financial KPI Dashboard Bar (Executive Style matching Main Dashboard) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Card 1: Cash Collected & Expected / Pending */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-saas transition-saas hover:-translate-y-0.5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      <span>Cash Collected</span>
                      <div className="w-8 h-8 rounded-lg bg-[#0A2030]/10 text-[#0A2030] flex items-center justify-center font-bold">
                        <Wallet className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="text-2xl sm:text-3xl font-bold text-slate-900 font-sans tracking-tight">
                      {formatCurrency(customerDetail.totalPaid)}
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-100 space-y-0.5">
                    <div className="text-xs font-medium text-slate-500">
                      Settled & cleared receipts
                    </div>
                    <div className="text-[11px] font-medium text-slate-500">
                      Expected / Pending:{' '}
                      <span className="font-semibold text-amber-600 font-mono">
                        {formatCurrency((customerDetail.outstandingCredit || 0) + (customerDetail.outstandingToPay || 0))}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card 2: Total Outstanding Due */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-saas transition-saas hover:-translate-y-0.5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      <span>Total Outstanding</span>
                      <div className={`w-8 h-8 rounded-lg ${((customerDetail.outstandingCredit || 0) + (customerDetail.outstandingToPay || 0)) > 0 ? 'bg-red-50 text-[#D14343]' : 'bg-slate-100 text-slate-500'} flex items-center justify-center font-bold`}>
                        <AlertCircle className="w-4 h-4" />
                      </div>
                    </div>
                    <div className={`text-2xl sm:text-3xl font-bold font-sans tracking-tight ${((customerDetail.outstandingCredit || 0) + (customerDetail.outstandingToPay || 0)) > 0 ? 'text-[#D14343]' : 'text-slate-900'}`}>
                      {formatCurrency((customerDetail.outstandingCredit || 0) + (customerDetail.outstandingToPay || 0))}
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-100 space-y-0.5">
                    <div className="text-[11px] text-slate-500 font-medium truncate">
                      Credit: <span className="font-semibold text-slate-700">{formatCurrency(customerDetail.outstandingCredit)}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-medium truncate">
                      To Pay: <span className="font-semibold text-slate-700">{formatCurrency(customerDetail.outstandingToPay)}</span>
                    </div>
                  </div>
                </div>

                {/* Card 3: Total Billed Revenue */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-saas transition-saas hover:-translate-y-0.5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      <span>Total Billed</span>
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                        <TrendingUp className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="text-2xl sm:text-3xl font-bold text-slate-900 font-sans tracking-tight">
                      {formatCurrency(customerDetail.totalBilled)}
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-100 space-y-0.5">
                    <div className="text-xs font-medium text-slate-500">
                      Total LRs: {customerDetail.totalLRCount || customerDetail.dockets?.length || 0}
                    </div>
                    <div className="text-[11px] text-slate-400 font-medium">
                      Lifetime billed volume
                    </div>
                  </div>
                </div>

                {/* Card 4: Settlement Rate */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-saas transition-saas hover:-translate-y-0.5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      <span>Settlement Rate</span>
                      <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="text-2xl sm:text-3xl font-bold text-slate-900 font-sans tracking-tight">
                      {(customerDetail.totalBilled && customerDetail.totalBilled > 0)
                        ? `${Math.min(100, ((customerDetail.totalPaid || 0) / customerDetail.totalBilled) * 100).toFixed(1)}%`
                        : '100%'}
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-100 space-y-0.5">
                    <div className="text-xs font-medium text-slate-500">
                      {customerDetail.dockets?.filter(d => (d.outstanding_amount || 0) <= 0).length || 0} Fully Paid LRs
                    </div>
                    <div className="text-[11px] text-slate-400 font-medium">
                      {customerDetail.dockets?.filter(d => (d.outstanding_amount || 0) > 0).length || 0} with pending balance
                    </div>
                  </div>
                </div>
              </div>

              {/* Profile Tabs */}
              <div className="border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-6">
                  <button
                    onClick={() => setActiveTab('lrs')}
                    className={`pb-3 text-sm font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
                      activeTab === 'lrs'
                        ? 'border-[#0A2030] text-[#0A2030]'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Receipt className="w-4 h-4" />
                    <span>Issued LRs ({customerDetail.dockets?.length || 0})</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('payments')}
                    className={`pb-3 text-sm font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
                      activeTab === 'payments'
                        ? 'border-[#0A2030] text-[#0A2030]'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <History className="w-4 h-4" />
                    <span>Payment History ({customerDetail.payments?.length || 0})</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('info')}
                    className={`pb-3 text-sm font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
                      activeTab === 'info'
                        ? 'border-[#0A2030] text-[#0A2030]'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Building2 className="w-4 h-4" />
                    <span>Account Details</span>
                  </button>
                </div>

                {activeTab === 'lrs' && (
                  <div className="flex items-center gap-1.5 pb-2">
                    {(['all', 'credit', 'unpaid', 'paid'] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setLrFilter(f)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold capitalize transition-saas cursor-pointer ${
                          lrFilter === f
                            ? 'bg-[#0A2030] text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {f === 'credit' ? 'Credit LRs' : f}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* TAB 1: LRs Issued Table with DIRECT PAY LR BUTTON */}
              {activeTab === 'lrs' && (
                <div className="space-y-3">
                  {(!customerDetail.dockets || customerDetail.dockets.length === 0) ? (
                    <div className="py-12 text-center text-xs text-slate-400 font-medium">
                      No LRs have been issued for this customer yet.
                    </div>
                  ) : (
                    <div className="border border-slate-200/90 rounded-2xl overflow-hidden shadow-2xs bg-white">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-[#F8FAFC] border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                            <tr>
                              <th className="px-4 py-3">LR Number</th>
                              <th className="px-4 py-3">Booking Date</th>
                              <th className="px-4 py-3">Route</th>
                              <th className="px-4 py-3">Consignee</th>
                              <th className="px-4 py-3">Mode</th>
                              <th className="px-4 py-3">Payment Mode</th>
                              <th className="px-4 py-3 text-right">Grand Total</th>
                              <th className="px-4 py-3 text-right">Paid</th>
                              <th className="px-4 py-3 text-right">Credit Balance</th>
                              <th className="px-4 py-3 text-center">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                            {customerDetail.dockets
                              .filter((d) => {
                                if (lrFilter === 'credit') return d.payment_mode === 'Credit';
                                if (lrFilter === 'unpaid') return d.outstanding_amount > 0;
                                if (lrFilter === 'paid') return d.outstanding_amount === 0;
                                return true;
                              })
                              .map((d) => (
                                <tr key={d.id} className="hover:bg-[#F8FAFC]">
                                  <td className="px-4 py-3 font-bold text-[#0A2030] font-mono">{d.docket_no}</td>
                                  <td className="px-4 py-3 text-slate-500 font-mono">
                                    {new Date(d.booking_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                  </td>
                                  <td className="px-4 py-3 text-slate-700 font-semibold">
                                    {d.from_city} → {d.to_city}
                                  </td>
                                  <td className="px-4 py-3 text-slate-700">{d.consignee_name}</td>
                                  <td className="px-4 py-3 text-slate-500">{d.transport_mode}</td>
                                  <td className="px-4 py-3">
                                    <span
                                      className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                        d.payment_mode === 'Credit'
                                          ? 'bg-amber-100 text-amber-900 border border-amber-200'
                                          : d.payment_mode === 'Paid'
                                          ? 'bg-slate-100 text-slate-800 border border-slate-200'
                                          : 'bg-blue-100 text-blue-900 border border-blue-200'
                                      }`}
                                    >
                                      {d.payment_mode}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-right font-bold font-mono">{formatCurrency(d.grand_total)}</td>
                                  <td className="px-4 py-3 text-right font-semibold text-slate-800 font-mono">{formatCurrency(d.total_paid)}</td>
                                  <td className={`px-4 py-3 text-right font-bold font-mono ${d.outstanding_amount > 0 ? 'text-[#D14343]' : 'text-slate-400'}`}>
                                    {formatCurrency(d.outstanding_amount)}
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    {d.outstanding_amount > 0 ? (
                                      <Button
                                        size="sm"
                                        onClick={() => {
                                          setSelectedLrForPayment({
                                            id: d.id,
                                            docket_no: d.docket_no,
                                            outstanding_amount: d.outstanding_amount,
                                          });
                                          setLrPayAmount(String(d.outstanding_amount));
                                          setLrPayError(null);
                                        }}
                                        className="h-7 text-[11px] px-3 bg-[#0A2030] hover:bg-[#071520] text-white font-semibold shadow-2xs whitespace-nowrap shrink-0"
                                      >
                                        Pay LR
                                      </Button>
                                    ) : (
                                      <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                        Settled
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: Payment History Ledger */}
              {activeTab === 'payments' && (
                <div className="space-y-3">
                  {(!customerDetail.payments || customerDetail.payments.length === 0) ? (
                    <div className="py-12 text-center text-xs text-slate-400 font-medium">
                      No payments have been recorded for this customer yet.
                    </div>
                  ) : (
                    <div className="border border-slate-200/90 rounded-2xl overflow-hidden shadow-2xs bg-white">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-[#F8FAFC] border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                          <tr>
                            <th className="px-4 py-3">Date</th>
                            <th className="px-4 py-3">LR Number</th>
                            <th className="px-4 py-3">Method</th>
                            <th className="px-4 py-3">Amount Paid</th>
                            <th className="px-4 py-3">Recorded By</th>
                            <th className="px-4 py-3">Notes</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                          {customerDetail.payments.map((p) => (
                            <tr key={p.id} className="hover:bg-[#F8FAFC]">
                              <td className="px-4 py-3 text-slate-500 font-mono">
                                {new Date(p.paid_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </td>
                              <td className="px-4 py-3 font-bold font-mono text-[#0A2030]">{p.docket_no}</td>
                              <td className="px-4 py-3">
                                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold border border-slate-200 text-[11px]">
                                  {p.method}
                                </span>
                              </td>
                              <td className="px-4 py-3 font-bold text-slate-900 font-mono">{formatCurrency(p.amount)}</td>
                              <td className="px-4 py-3 text-slate-600">{p.recorded_by_name || 'Staff'}</td>
                              <td className="px-4 py-3 text-slate-500 italic">{p.notes || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: Account Details */}
              {activeTab === 'info' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50/80 border border-slate-200/80 rounded-2xl p-6 text-xs space-y-2 md:space-y-0">
                  <div className="space-y-3">
                    <h3 className="font-bold text-sm text-slate-900 border-b border-slate-200 pb-2">Business & Billing Details</h3>
                    <div><span className="text-slate-500">Company Name:</span> <span className="font-semibold text-slate-900">{customerDetail.name}</span></div>
                    <div><span className="text-slate-500">Account Code:</span> <span className="font-mono font-semibold text-slate-900">{customerDetail.code}</span></div>
                    <div><span className="text-slate-500">GSTIN:</span> <span className="font-mono font-semibold text-slate-900">{customerDetail.gstin || 'N/A'}</span></div>
                    <div><span className="text-slate-500">Billing Address:</span> <span className="font-medium text-slate-900">{customerDetail.address || 'N/A'}, {customerDetail.city} {customerDetail.pinCode}</span></div>
                  </div>

                  <div className="space-y-3">
                    <h3 className="font-bold text-sm text-slate-900 border-b border-slate-200 pb-2">Contact Details</h3>
                    <div><span className="text-slate-500">Primary Contact Person:</span> <span className="font-semibold text-slate-900">{customerDetail.contactPerson || 'N/A'}</span></div>
                    <div><span className="text-slate-500">Phone:</span> <span className="font-semibold text-slate-900">{customerDetail.phone || 'N/A'}</span></div>
                    <div><span className="text-slate-500">Email:</span> <span className="font-semibold text-slate-900">{customerDetail.email || 'N/A'}</span></div>
                    {customerDetail.notes && (
                      <div className="pt-2 border-t border-slate-200"><span className="text-slate-500">Account Notes:</span> <p className="mt-1 italic text-slate-700 bg-white p-2.5 rounded-lg border border-slate-200">{customerDetail.notes}</p></div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </Card>

        {/* ── RECORD BULK SETTLEMENT MODAL ── */}
        {showPaymentModal && customerDetail && (
          <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4">
            <Card className="w-full max-w-md bg-white border border-slate-200 shadow-2xl rounded-3xl p-6">
              <CardHeader className="flex flex-row items-center justify-between pb-4 p-0 mb-4 border-b border-slate-100">
                <div>
                  <CardTitle className="text-lg font-bold text-slate-900">Record Bulk Settlement</CardTitle>
                  <CardDescription className="text-xs text-slate-500 mt-0.5">
                    Allocate payment across {customerDetail.name}'s outstanding LRs (oldest first).
                  </CardDescription>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setShowPaymentModal(false)}>
                  <X className="w-4 h-4 text-slate-500" />
                </Button>
              </CardHeader>

              <CardContent className="p-0">
                {payError && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-medium rounded-xl">
                    {payError}
                  </div>
                )}

                <form onSubmit={handleRecordPayment} className="space-y-4 text-xs">
                  <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-amber-900 font-semibold">Total Outstanding Balance:</span>
                      <span className="font-bold text-[#D14343] text-sm">
                        {formatCurrency((customerDetail.outstandingCredit || 0) + (customerDetail.outstandingToPay || 0))}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-amber-800/80 pt-1 border-t border-amber-200/60">
                      <span>Credit LRs: {formatCurrency(customerDetail.outstandingCredit)}</span>
                      <span>To Pay LRs: {formatCurrency(customerDetail.outstandingToPay)}</span>
                    </div>
                  </div>

                  {/* Target mode filter */}
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Apply Settlement To</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'all', label: 'All Unpaid LRs' },
                        { id: 'credit', label: 'Credit Only' },
                        { id: 'to_pay', label: 'To Pay Only' },
                      ].map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setPayTargetMode(t.id as any);
                            if (t.id === 'credit') {
                              setPayAmount((customerDetail.outstandingCredit || 0).toFixed(2));
                            } else if (t.id === 'to_pay') {
                              setPayAmount((customerDetail.outstandingToPay || 0).toFixed(2));
                            } else {
                              setPayAmount(((customerDetail.outstandingCredit || 0) + (customerDetail.outstandingToPay || 0)).toFixed(2));
                            }
                          }}
                          className={`p-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                            payTargetMode === t.id
                              ? 'border-[#0A2030] bg-[#0A2030]/5 text-[#0A2030] ring-1 ring-[#0A2030]'
                              : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Amount Received (₹) *</label>
                    <Input
                      type="number"
                      step="0.01"
                      required
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      placeholder="Enter amount"
                      className="h-10 font-mono text-sm"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Payment Method *</label>
                    <div className="grid grid-cols-3 gap-2">
                      {PAYMENT_METHODS.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setPayMethod(m)}
                          className={`p-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                            payMethod === m
                              ? 'border-[#0A2030] bg-[#0A2030]/5 text-[#0A2030] ring-1 ring-[#0A2030]'
                              : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Payment Date</label>
                    <Input
                      type="date"
                      value={payDate}
                      onChange={(e) => setPayDate(e.target.value)}
                      className="h-10"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Remarks / Transaction Reference</label>
                    <Input
                      value={payNotes}
                      onChange={(e) => setPayNotes(e.target.value)}
                      placeholder="e.g. NEFT Ref #998877 / Part settlement"
                      className="h-10 text-xs"
                    />
                  </div>

                  <div className="pt-2 flex justify-end gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => setShowPaymentModal(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" size="sm" disabled={submittingPay} className="bg-[#0A2030] hover:bg-[#071520] text-white font-semibold">
                      {submittingPay ? 'Recording...' : 'Record Settlement'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── RECORD SINGLE LR PAYMENT MODAL ── */}
        {selectedLrForPayment && (
          <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4">
            <Card className="w-full max-w-md bg-white border border-slate-200 shadow-2xl rounded-3xl p-6">
              <CardHeader className="flex flex-row items-center justify-between pb-4 p-0 mb-4 border-b border-slate-100">
                <div>
                  <CardTitle className="text-lg font-bold text-slate-900">
                    Record Payment for {selectedLrForPayment.docket_no}
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 mt-0.5">
                    Collect payment directly for LR {selectedLrForPayment.docket_no}.
                  </CardDescription>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setSelectedLrForPayment(null)}>
                  <X className="w-4 h-4 text-slate-500" />
                </Button>
              </CardHeader>

              <CardContent className="p-0">
                {lrPayError && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-medium rounded-xl">
                    {lrPayError}
                  </div>
                )}

                <form onSubmit={handleRecordLrPayment} className="space-y-4 text-xs">
                  <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex items-center justify-between">
                    <span className="text-slate-600 font-medium">LR Balance Outstanding:</span>
                    <span className="font-bold text-[#D14343] text-sm font-mono">{formatCurrency(selectedLrForPayment.outstanding_amount)}</span>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Amount Received (₹) *</label>
                    <Input
                      type="number"
                      step="0.01"
                      required
                      value={lrPayAmount}
                      onChange={(e) => setLrPayAmount(e.target.value)}
                      placeholder="Enter amount"
                      className="h-10 font-mono text-sm"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Payment Method *</label>
                    <div className="grid grid-cols-3 gap-2">
                      {PAYMENT_METHODS.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setLrPayMethod(m)}
                          className={`p-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                            lrPayMethod === m
                              ? 'border-[#0A2030] bg-[#0A2030]/5 text-[#0A2030] ring-1 ring-[#0A2030]'
                              : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Payment Date</label>
                    <Input
                      type="date"
                      value={lrPayDate}
                      onChange={(e) => setLrPayDate(e.target.value)}
                      className="h-10"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Remarks / Transaction Ref</label>
                    <Input
                      value={lrPayNotes}
                      onChange={(e) => setLrPayNotes(e.target.value)}
                      placeholder="e.g. UPI Ref #12345 / Cheque #004"
                      className="h-10 text-xs"
                    />
                  </div>

                  <div className="pt-2 flex justify-end gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => setSelectedLrForPayment(null)}>
                      Cancel
                    </Button>
                    <Button type="submit" size="sm" disabled={submittingLrPay} className="bg-[#0A2030] hover:bg-[#071520] text-white font-semibold">
                      {submittingLrPay ? 'Recording...' : 'Record Payment'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    );
  }

  /* ─────────────────────────────────────────────────────────────
     CUSTOMER DIRECTORY TABLE LIST VIEW (WHEN NO CUSTOMER IS SELECTED)
  ───────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-6">
      <Card className="border border-slate-200/80 shadow-saas bg-white rounded-2xl p-6 md:p-8">
        <CardHeader className="flex flex-row items-center justify-between pb-4 p-0 mb-6 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2.5">
              <CardTitle className="text-2xl font-bold text-slate-900 tracking-tight font-heading">
                Customer Directory & Accounts
              </CardTitle>
              <Badge variant="info" className="font-mono text-xs">
                {customers.length} Accounts
              </Badge>
            </div>
            <CardDescription className="text-xs text-slate-500 font-medium mt-1">
              Select any customer row to view their complete profile, credit ledger, and order breakdown.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="md"
              onClick={handleExportCustomersCSV}
              disabled={filteredCustomers.length === 0}
              className="gap-2 border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Export CSV</span>
            </Button>
            <Button size="md" onClick={openNewForm} className="gap-2 shadow-saas bg-[#0A2030] hover:bg-[#071520] text-white">
              <Plus className="w-4 h-4" />
              <span>Add Customer</span>
            </Button>
            {onClose && (
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close modal">
                <X className="w-4 h-4 text-slate-500" />
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-6 p-0">
          {/* Executive Customer Portfolio KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Total Portfolio Cash Collected with Expected/Pending below */}
            <div className="bg-[#F8FAFC] border border-slate-200/80 rounded-2xl p-5 shadow-2xs transition-saas hover:-translate-y-0.5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  <span>Cash Collected</span>
                  <div className="w-8 h-8 rounded-lg bg-[#0A2030]/10 text-[#0A2030] flex items-center justify-center font-bold">
                    <Wallet className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-slate-900 font-sans tracking-tight">
                  {formatCurrency(customers.reduce((sum, c) => sum + (c.totalPaid || 0), 0))}
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-200/70 space-y-0.5">
                <div className="text-xs font-medium text-slate-500">
                  Total settled payments
                </div>
                <div className="text-[11px] font-medium text-slate-500">
                  Expected / Pending:{' '}
                  <span className="font-semibold text-amber-600 font-mono">
                    {formatCurrency(
                      customers.reduce(
                        (sum, c) => sum + ((c.outstandingCredit || 0) + (c.outstandingToPay || 0) || c.outstandingAmount || 0),
                        0
                      )
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Card 2: Total Outstanding Receivables */}
            <div className="bg-[#F8FAFC] border border-slate-200/80 rounded-2xl p-5 shadow-2xs transition-saas hover:-translate-y-0.5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  <span>Outstanding Receivables</span>
                  <div className="w-8 h-8 rounded-lg bg-red-50 text-[#D14343] flex items-center justify-center font-bold">
                    <AlertCircle className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-[#D14343] font-sans tracking-tight">
                  {formatCurrency(
                    customers.reduce(
                      (sum, c) => sum + ((c.outstandingCredit || 0) + (c.outstandingToPay || 0) || c.outstandingAmount || 0),
                      0
                    )
                  )}
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-200/70 space-y-0.5">
                <div className="text-xs font-medium text-slate-500">
                  Across {customers.filter((c) => ((c.outstandingCredit || 0) + (c.outstandingToPay || 0) || (c.outstandingAmount || 0)) > 0).length} customer accounts
                </div>
                <div className="text-[11px] text-slate-400 font-medium">
                  Active pending balances
                </div>
              </div>
            </div>

            {/* Card 3: Total Billed Revenue */}
            <div className="bg-[#F8FAFC] border border-slate-200/80 rounded-2xl p-5 shadow-2xs transition-saas hover:-translate-y-0.5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  <span>Total Billed Volume</span>
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-slate-900 font-sans tracking-tight">
                  {formatCurrency(customers.reduce((sum, c) => sum + (c.totalBilled || 0), 0))}
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-200/70 space-y-0.5">
                <div className="text-xs font-medium text-slate-500">
                  All customer ledger revenue
                </div>
                <div className="text-[11px] text-slate-400 font-medium">
                  Gross billed LRs
                </div>
              </div>
            </div>

            {/* Card 4: Total Customer Accounts */}
            <div className="bg-[#F8FAFC] border border-slate-200/80 rounded-2xl p-5 shadow-2xs transition-saas hover:-translate-y-0.5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  <span>Customer Accounts</span>
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
                    <Users className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-slate-900 font-sans tracking-tight">
                  {customers.length}
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-200/70 space-y-0.5">
                <div className="text-xs font-medium text-slate-500">
                  {customers.filter((c) => (c.totalBilled || 0) > 0).length} transacting accounts
                </div>
                <div className="text-[11px] text-slate-400 font-medium">
                  {customers.filter((c) => !c.totalBilled || c.totalBilled === 0).length} newly registered
                </div>
              </div>
            </div>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Input
              type="text"
              placeholder="Search by customer name, code, contact person, city, phone, or GSTIN..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-11 h-12 text-sm bg-[#F8FAFC] border-slate-200/80 shadow-saas"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-4 top-4 pointer-events-none" />
          </div>

          {/* ── SIMPLE CLEAN CUSTOMER LIST TABLE ── */}
          {loading ? (
            <div className="py-12 text-center text-xs text-slate-400 font-mono">Loading customer accounts...</div>
          ) : filteredCustomers.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400 font-medium">
              No customer accounts found. Click "Add Customer" to create one.
            </div>
          ) : (
            <div className="border border-slate-200/90 rounded-2xl overflow-hidden shadow-2xs bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-[#F8FAFC] border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                    <tr>
                      <th
                        onClick={() => handleSort('name')}
                        className="px-5 py-3.5 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Customer Name</span>
                          {sortField === 'name' ? (
                            sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-[#0A2030]" /> : <ArrowDown className="w-3.5 h-3.5 text-[#0A2030]" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-400" />
                          )}
                        </div>
                      </th>
                      <th className="px-4 py-3.5">Contact Person</th>
                      <th className="px-4 py-3.5">City & Phone</th>
                      <th
                        onClick={() => handleSort('totalBilled')}
                        className="px-4 py-3.5 text-right cursor-pointer hover:bg-slate-100 transition-colors select-none"
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          <span>Total Billed</span>
                          {sortField === 'totalBilled' ? (
                            sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-[#0A2030]" /> : <ArrowDown className="w-3.5 h-3.5 text-[#0A2030]" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-400" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort('outstandingCredit')}
                        className="px-4 py-3.5 text-right cursor-pointer hover:bg-slate-100 transition-colors select-none"
                      >
                        <div className="flex items-center justify-end gap-1.5 text-amber-950">
                          <span>Accumulated Credit</span>
                          {sortField === 'outstandingCredit' ? (
                            sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-[#D14343]" /> : <ArrowDown className="w-3.5 h-3.5 text-[#D14343]" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-400" />
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort('totalPaid')}
                        className="px-4 py-3.5 text-right cursor-pointer hover:bg-slate-100 transition-colors select-none"
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          <span>Total Paid</span>
                          {sortField === 'totalPaid' ? (
                            sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-[#0A2030]" /> : <ArrowDown className="w-3.5 h-3.5 text-[#0A2030]" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-400" />
                          )}
                        </div>
                      </th>
                      <th className="px-4 py-3.5 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                    {sortedCustomers.map((c) => {
                      const credDue = c.outstandingCredit ?? 0;
                      const totPaid = c.totalPaid ?? 0;
                      const totBilled = c.totalBilled ?? 0;

                      return (
                        <tr
                          key={c.id}
                          onClick={() => setSelectedCustomerId(c.id)}
                          className="hover:bg-[#F8FAFC] transition-colors cursor-pointer group"
                        >
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2.5">
                              <span className="font-bold text-sm text-slate-900 group-hover:text-[#0A2030] transition-colors">
                                {c.name}
                              </span>
                            </div>
                            {c.gstin && (
                              <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                                GST: {c.gstin}
                              </div>
                            )}
                          </td>

                          <td className="px-4 py-4 text-slate-700">
                            {c.contactPerson ? (
                              <div className="flex items-center gap-1.5">
                                <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span>{c.contactPerson}</span>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">Not set</span>
                            )}
                          </td>

                          <td className="px-4 py-4 text-slate-600">
                            <div className="space-y-0.5">
                              {c.city && (
                                <div className="flex items-center gap-1.5 font-medium">
                                  <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                                  <span>{c.city}</span>
                                </div>
                              )}
                              {c.phone && (
                                <div className="flex items-center gap-1.5 font-medium text-slate-500">
                                  <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                                  <span>{c.phone}</span>
                                </div>
                              )}
                            </div>
                          </td>

                          <td className="px-4 py-4 text-right font-bold font-mono text-slate-900">
                            {formatCurrency(totBilled)}
                          </td>

                          <td className="px-4 py-4 text-right">
                            {credDue > 0 ? (
                              <span className="inline-flex items-center gap-1 font-bold text-[#D14343] font-mono bg-red-50 px-2 py-0.5 rounded border border-red-200/60">
                                <AlertCircle className="w-3 h-3 shrink-0" />
                                {formatCurrency(credDue)}
                              </span>
                            ) : (
                              <span className="font-semibold text-slate-400 font-mono">₹0.00</span>
                            )}
                          </td>

                          <td className="px-4 py-4 text-right font-semibold text-slate-800 font-mono">
                            {formatCurrency(totPaid)}
                          </td>

                          <td className="px-4 py-4 text-center">
                            <div className="flex items-center justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                              {onSelectCustomer ? (
                                <Button size="sm" variant="outline" onClick={() => onSelectCustomer(c)} className="text-xs shadow-saas">
                                  Select
                                </Button>
                              ) : null}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setSelectedCustomerId(c.id)}
                                className="h-8 px-2.5 text-xs font-semibold gap-1.5 bg-[#0A2030]/5 text-[#0A2030] border-[#0A2030]/20 hover:bg-[#0A2030] hover:text-white transition-all shadow-2xs"
                              >
                                <Eye className="w-4 h-4" />
                                <span>Details</span>
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openEditForm(c)}
                                aria-label={`Edit ${c.name}`}
                                className="h-8 px-2.5 text-xs font-semibold gap-1.5 border-slate-300 text-slate-700 hover:bg-slate-50 shadow-2xs"
                              >
                                <Pencil className="w-4 h-4 text-slate-700" />
                                <span>Edit</span>
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => { setDeleteTarget(c); setDeleteError(null); }}
                                aria-label={`Delete ${c.name}`}
                                className="h-8 px-2.5 text-xs font-semibold gap-1.5 border-red-200 text-red-600 hover:bg-red-50 shadow-2xs"
                              >
                                <Trash2 className="w-4 h-4 text-red-600" />
                                <span>Delete</span>
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── NEW / EDIT CUSTOMER MODAL ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="w-full max-w-lg bg-white border border-slate-200/90 shadow-2xl rounded-3xl p-6">
            <CardHeader className="flex flex-row items-center justify-between pb-4 p-0 mb-4 border-b border-slate-100">
              <CardTitle className="text-lg font-bold text-slate-900">
                {editingCustomer ? 'Edit Customer Profile' : 'Add New Customer Account'}
              </CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setShowModal(false)} aria-label="Close modal">
                <X className="w-4 h-4 text-slate-500" />
              </Button>
            </CardHeader>

            <CardContent className="p-0 max-h-[80vh] overflow-y-auto pr-1">
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-medium rounded-xl">
                  {error}
                </div>
              )}

              <form onSubmit={handleSaveCustomer} className="space-y-3.5 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Company / Customer Name *</label>
                  <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tata Consumer Products Ltd" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Contact Person</label>
                    <Input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} placeholder="e.g. Rajesh Sharma (Manager)" />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Phone Number</label>
                    <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 9822019482" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">GSTIN Number</label>
                    <Input value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="27AAACT2727Q1ZB" className="font-mono text-[11px]" />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Email Address</label>
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="logistics@tataconsumer.com" />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Billing Address</label>
                  <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Plot No. 12, Kagal Five Star MIDC" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">City</label>
                    <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Kolhapur" />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">PIN Code</label>
                    <Input value={pinCode} onChange={(e) => setPinCode(e.target.value)} placeholder="416236" className="font-mono" />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Internal Account Notes</label>
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Special delivery instructions, account notes..." />
                </div>

                <div className="pt-3 flex justify-end gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowModal(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={submitting} className="bg-[#0A2030] hover:bg-[#071520] text-white">
                    {submitting ? 'Saving...' : 'Save Profile'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full border border-slate-300 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-[#D14343]">Delete Customer Account</h3>
            <p className="text-xs text-slate-600">
              Are you sure you want to delete "{deleteTarget.name}" ({deleteTarget.code})? This will unlink historical dockets.
            </p>
            {deleteError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-medium rounded-xl">
                {deleteError}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setDeleteTarget(null); setDeleteError(null); }}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleDeleteCustomer}
                disabled={deleting}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
