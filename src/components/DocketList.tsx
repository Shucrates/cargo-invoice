'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { CargoDocket } from '@/types/cargo';
import { generateInvoicePDF } from '@/lib/pdfGenerator';
import { exportToCSV, exportSummaryPDF } from '@/lib/exportUtils';
import { User, AlertCircle, Truck, ExternalLink, CheckCircle2, Clock, MapPin, Plus, Edit2, ShieldAlert } from 'lucide-react';
import { formatCreatedAt } from '@/lib/formatDate';

export default function DocketList({ refreshKey }: { refreshKey: number }) {
  const { data: session } = useSession();
  // Voiding is admin-only server-side; hide the control so staff never hit a 403.
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === 'admin';

  const [dockets, setDockets] = useState<CargoDocket[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Filters
  const [durationPreset, setDurationPreset] = useState<'all' | 'this_month' | 'last_month' | 'custom'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [modeFilter, setModeFilter] = useState<'all' | 'Road' | 'Air' | 'Train'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'issued' | 'voided'>('all');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'Paid' | 'To Pay' | 'Credit'>('all');

  // Void modal
  const [voidModalDocket, setVoidModalDocket] = useState<CargoDocket | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Live Tracking modal
  const [trackingModalDocket, setTrackingModalDocket] = useState<CargoDocket | null>(null);
  const [trackingData, setTrackingData] = useState<any | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);

  // Edit / Add Tracking Modal
  const [editTrackingDocket, setEditTrackingDocket] = useState<CargoDocket | null>(null);
  const [editCourierPartner, setEditCourierPartner] = useState('FedEx');
  const [editTrackingNo, setEditTrackingNo] = useState('');
  const [editTrackingLoading, setEditTrackingLoading] = useState(false);

  const fetchDockets = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dockets?limit=500');
      if (res.ok) {
        const data = await res.json();
        setDockets((data.dockets ?? []) as CargoDocket[]);
      } else {
        setDockets([]);
      }
    } catch (err) {
      console.error('Failed to fetch dockets:', err);
      setDockets([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDockets();
  }, [refreshKey]);

  const handleVoidDocket = async () => {
    if (!voidModalDocket || !voidReason.trim()) return;
    setActionLoading(true);

    try {
      const res = await fetch(`/api/dockets/${voidModalDocket.id}/void`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ void_reason: voidReason.trim() }),
      });

      const data = await res.json();

      if (res.ok) {
        setVoidModalDocket(null);
        setVoidReason('');
        fetchDockets();
      } else {
        alert(`Failed to void docket: ${data.error || 'Server error'}`);
      }
    } catch (err: any) {
      alert(`Failed to void docket: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenTracking = async (docket: CargoDocket) => {
    setTrackingModalDocket(docket);
    setTrackingLoading(true);
    setTrackingData(null);

    try {
      const res = await fetch(`/api/tracking/${docket.id}`);
      if (res.ok) {
        const data = await res.json();
        setTrackingData(data);
      } else {
        const errJson = await res.json();
        alert(`Tracking unavailable: ${errJson.error || 'No tracking info'}`);
        setTrackingModalDocket(null);
      }
    } catch (err: any) {
      console.error('Tracking fetch error:', err);
    } finally {
      setTrackingLoading(false);
    }
  };

  const handleSaveTrackingInfo = async () => {
    if (!editTrackingDocket || !editTrackingNo.trim()) return;
    setEditTrackingLoading(true);

    try {
      const res = await fetch(`/api/dockets/${editTrackingDocket.id}/tracking`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courier_partner: editCourierPartner,
          tracking_no: editTrackingNo.trim(),
        }),
      });

      const data = await res.json();

      if (res.ok) {
        const targetDocket = {
          ...editTrackingDocket,
          courier_partner: editCourierPartner,
          tracking_no: editTrackingNo.trim(),
        };
        setEditTrackingDocket(null);
        setEditTrackingNo('');
        await fetchDockets();
        // Automatically open live tracking modal after saving!
        handleOpenTracking(targetDocket);
      } else {
        alert(`Failed to save tracking: ${data.error || 'Server error'}`);
      }
    } catch (err: any) {
      alert(`Failed to update tracking: ${err.message}`);
    } finally {
      setEditTrackingLoading(false);
    }
  };

  // Filter Logic
  const filteredDockets = dockets.filter((d) => {
    const matchesSearch = 
      d.docket_no.toLowerCase().includes(search.toLowerCase()) ||
      d.consignor_name.toLowerCase().includes(search.toLowerCase()) ||
      d.consignee_name.toLowerCase().includes(search.toLowerCase()) ||
      d.from_city.toLowerCase().includes(search.toLowerCase()) ||
      d.to_city.toLowerCase().includes(search.toLowerCase()) ||
      (d.tracking_no && d.tracking_no.toLowerCase().includes(search.toLowerCase())) ||
      (d.courier_partner && d.courier_partner.toLowerCase().includes(search.toLowerCase())) ||
      (d.created_by_name && d.created_by_name.toLowerCase().includes(search.toLowerCase()));
    
    if (!matchesSearch) return false;

    if (modeFilter !== 'all' && d.transport_mode !== modeFilter) return false;
    if (statusFilter !== 'all' && d.status !== statusFilter) return false;
    if (paymentFilter !== 'all' && d.payment_mode !== paymentFilter) return false;

    if (durationPreset === 'this_month') {
      const dDate = new Date(d.booking_date);
      const now = new Date();
      if (dDate.getMonth() !== now.getMonth() || dDate.getFullYear() !== now.getFullYear()) {
        return false;
      }
    } else if (durationPreset === 'last_month') {
      const dDate = new Date(d.booking_date);
      const now = new Date();
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      if (dDate.getMonth() !== lastMonth.getMonth() || dDate.getFullYear() !== lastMonth.getFullYear()) {
        return false;
      }
    } else if (durationPreset === 'custom') {
      if (startDate && d.booking_date < startDate) return false;
      if (endDate && d.booking_date > endDate) return false;
    }

    return true;
  });

  const getFilterLabel = () => {
    if (durationPreset === 'this_month') return 'This Month';
    if (durationPreset === 'last_month') return 'Last Month';
    if (durationPreset === 'custom') return `Custom (${startDate || 'start'} to ${endDate || 'end'})`;
    return 'All Time';
  };

  const getFilterSummaryDetails = () => {
    const parts = [getFilterLabel()];
    if (modeFilter !== 'all') parts.push(`${modeFilter} Freight`);
    if (paymentFilter !== 'all') parts.push(paymentFilter);
    if (statusFilter !== 'all') parts.push(statusFilter.toUpperCase());
    return parts.join(' · ');
  };

  const getPaymentBadgeStyle = (mode: string) => {
    switch (mode) {
      case 'Credit':
        return 'bg-amber-50 text-amber-800 border border-amber-200';
      case 'To Pay':
        return 'bg-blue-50 text-blue-800 border border-blue-200';
      case 'Paid':
        return 'bg-emerald-50 text-emerald-800 border border-emerald-200';
      default:
        return 'bg-slate-100 text-slate-700 border border-slate-200';
    }
  };

  const getCourierBadge = (courier?: string) => {
    switch (courier?.toLowerCase()) {
      case 'fedex':
        return <span className="bg-indigo-100 text-indigo-900 border border-indigo-300 px-1.5 py-0.5 rounded font-bold text-[10px]">FedEx</span>;
      case 'dhl':
        return <span className="bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded font-bold text-[10px]">DHL</span>;
      case 'ups':
        return <span className="bg-slate-800 text-amber-400 border border-slate-700 px-1.5 py-0.5 rounded font-bold text-[10px]">UPS</span>;
      case 'aramex':
        return <span className="bg-red-100 text-red-900 border border-red-300 px-1.5 py-0.5 rounded font-bold text-[10px]">aramex</span>;
      case 'blue dart':
      case 'bluedart':
        return <span className="bg-blue-100 text-blue-900 border border-blue-300 px-1.5 py-0.5 rounded font-bold text-[10px]">BLUE DART</span>;
      default:
        return <span className="bg-slate-100 text-slate-600 border border-slate-300 px-1.5 py-0.5 rounded font-semibold text-[10px]">Self</span>;
    }
  };

  return (
    <div className="bg-white border border-slate-300 rounded-md p-6 shadow-sm space-y-6">
      {/* Title & Top Search Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wide">
            Cargo Docket Audit History & Package Tracker
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Live tracking for FedEx, DHL, UPS, Aramex, Blue Dart & Self Network</p>
        </div>

        <input
          type="text"
          placeholder="Search Docket No, Tracking No, Consignor, City..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="p-2 border border-slate-300 rounded text-sm w-full md:w-80 focus:outline-none focus:ring-1 focus:ring-slate-800"
        />
      </div>

      {/* Filter & Export Toolbar */}
      <div className="bg-slate-50 border border-slate-200 rounded p-4 flex flex-col space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Duration Filter Dropdown */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Duration Filter</label>
            <select
              value={durationPreset}
              onChange={(e) => setDurationPreset(e.target.value as any)}
              className="w-full p-2 border border-slate-300 rounded text-xs font-semibold bg-white"
            >
              <option value="all">All Time</option>
              <option value="this_month">This Month</option>
              <option value="last_month">Last Month</option>
              <option value="custom">Custom Date Range</option>
            </select>
          </div>

          {/* Mode Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Transport Mode</label>
            <select
              value={modeFilter}
              onChange={(e) => setModeFilter(e.target.value as any)}
              className="w-full p-2 border border-slate-300 rounded text-xs font-semibold bg-white"
            >
              <option value="all">All Modes</option>
              <option value="Road">Road Freight</option>
              <option value="Air">Air Freight</option>
              <option value="Train">Train Freight</option>
            </select>
          </div>

          {/* Payment Mode Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Payment Mode</label>
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value as any)}
              className="w-full p-2 border border-slate-300 rounded text-xs font-semibold bg-white"
            >
              <option value="all">All Payments</option>
              <option value="To Pay">To Pay</option>
              <option value="Credit">Credit</option>
              <option value="Paid">Paid</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full p-2 border border-slate-300 rounded text-xs font-semibold bg-white"
            >
              <option value="all">All Statuses</option>
              <option value="issued">Issued</option>
              <option value="voided">Voided</option>
            </select>
          </div>

          {/* Export Action Buttons */}
          <div className="flex items-end gap-2">
            <button
              onClick={() => exportToCSV(filteredDockets, `cargo_dockets_${durationPreset}.csv`)}
              className="flex-1 py-2 px-2.5 bg-[#60899B] hover:bg-[#486675] text-white rounded text-[11px] font-bold uppercase transition tracking-wider flex items-center justify-center gap-1 shadow-sm"
              title="Export filtered dockets to Excel / CSV spreadsheet"
            >
              📊 CSV / Excel
            </button>

            <button
              onClick={() => exportSummaryPDF(filteredDockets, getFilterSummaryDetails())}
              className="flex-1 py-2 px-2.5 bg-[#1C3E4E] hover:bg-[#224D5F] text-white rounded text-[11px] font-bold uppercase transition tracking-wider flex items-center justify-center gap-1 shadow-sm"
              title="Export formatted summary PDF audit report"
            >
              📄 Summary PDF
            </button>
          </div>
        </div>

        {/* Custom Date Range Controls */}
        {durationPreset === 'custom' && (
          <div className="flex flex-wrap gap-3 items-center pt-2 border-t border-slate-200">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-semibold">From:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="p-1.5 border border-slate-300 rounded text-xs bg-white"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-semibold">To:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="p-1.5 border border-slate-300 rounded text-xs bg-white"
              />
            </div>
            {(startDate || endDate) && (
              <button
                onClick={() => { setStartDate(''); setEndDate(''); }}
                className="text-xs text-red-600 underline font-semibold"
              >
                Clear Dates
              </button>
            )}
          </div>
        )}

        {/* Active Filter Summary Indicator */}
        <div className="text-[11px] text-slate-500 font-medium flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <span>
            Showing <strong className="text-slate-800">{filteredDockets.length}</strong> of{' '}
            <strong className="text-slate-800">{dockets.length}</strong> total records —{' '}
            <span className="text-[#1C3E4E] font-semibold bg-[#1C3E4E]/10 px-2 py-0.5 rounded">
              {getFilterSummaryDetails()}
            </span>
          </span>
          {filteredDockets.length > 0 && (
            <span className="font-mono text-slate-700">
              Filtered Total: <strong>₹{filteredDockets.reduce((sum, d) => sum + (d.grand_total || 0), 0).toFixed(2)}</strong>
            </span>
          )}
        </div>
      </div>

      {/* Table Section */}
      {loading ? (
        <div className="text-center py-8 text-slate-500 font-medium">Loading docket records...</div>
      ) : filteredDockets.length === 0 ? (
        <div className="text-center py-8 text-slate-400 font-medium">No docket records found matching current filters.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs text-left">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-300 text-slate-700 font-bold uppercase">
                <th className="p-3">Docket No</th>
                <th className="p-3">Courier / Tracking</th>
                <th className="p-3">Date / Mode</th>
                <th className="p-3">Consignor → Consignee</th>
                <th className="p-3">Route</th>
                <th className="p-3">Weight</th>
                <th className="p-3">Created By</th>
                <th className="p-3">Payment</th>
                <th className="p-3 text-right">Grand Total</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredDockets.map((d) => {
                const hasTrackingNumber = Boolean(d.tracking_no && d.tracking_no.trim().length > 0);

                return (
                  <tr key={d.id} className={d.status === 'voided' ? 'bg-red-50/60 opacity-85' : 'hover:bg-slate-50'}>
                    {/* Docket No */}
                    <td className="p-3 font-mono font-bold text-slate-800">{d.docket_no}</td>

                    {/* Courier & Tracking No */}
                    <td className="p-3">
                      <div className="flex flex-col gap-1 items-start">
                        {getCourierBadge(d.courier_partner)}
                        {hasTrackingNumber ? (
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-[11px] text-slate-700 font-semibold">
                              {d.tracking_no}
                            </span>
                            <button
                              onClick={() => {
                                setEditTrackingDocket(d);
                                setEditCourierPartner(d.courier_partner || 'FedEx');
                                setEditTrackingNo(d.tracking_no || '');
                              }}
                              className="text-slate-400 hover:text-slate-800 p-0.5"
                              title="Edit tracking / waybill number"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setEditTrackingDocket(d);
                              setEditCourierPartner(d.courier_partner || 'FedEx');
                              setEditTrackingNo('');
                            }}
                            className="text-[11px] text-indigo-700 hover:text-indigo-900 font-bold underline flex items-center gap-0.5"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Add Waybill No</span>
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Date & Mode */}
                    <td className="p-3">{d.booking_date}<br/><span className="text-slate-400 font-medium">{d.transport_mode}</span></td>

                    {/* Consignor -> Consignee */}
                    <td className="p-3 font-medium">
                      <span className="text-slate-800">{d.consignor_name}</span>
                      <br/>
                      <span className="text-slate-500">→ {d.consignee_name}</span>
                    </td>

                    {/* Route */}
                    <td className="p-3 font-medium">{d.from_city} → {d.to_city}</td>

                    {/* Charged Weight Column */}
                    <td className="p-3 font-mono font-bold text-slate-700">
                      {d.charged_weight_kg || 0} kg
                    </td>

                    {/* Created By Staff Column */}
                    <td className="p-3">
                      <div
                        className="flex items-center gap-1.5"
                        title={`${d.created_by_email || d.created_by}${d.created_at ? ` · ${formatCreatedAt(d.created_at)}` : ''}`}
                      >
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-800 truncate max-w-[110px]">
                            {d.created_by_name || 'Staff'}
                          </div>
                          {d.created_at && (
                            <div className="text-[10px] text-slate-400 font-mono truncate max-w-[110px]">
                              {formatCreatedAt(d.created_at)}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Payment Mode Column */}
                    <td className="p-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${getPaymentBadgeStyle(d.payment_mode)}`}>
                        {d.payment_mode}
                      </span>
                    </td>

                    {/* Grand Total */}
                    <td className="p-3 text-right font-mono font-bold text-slate-900">
                      ₹{d.grand_total.toFixed(2)}
                    </td>

                    {/* Status & Surfaced Void Details */}
                    <td className="p-3">
                      {d.status === 'issued' ? (
                        <span className="bg-green-100 text-green-800 text-[10px] font-bold px-2 py-0.5 rounded uppercase">ISSUED</span>
                      ) : (
                        <div className="space-y-1">
                          <span 
                            className="bg-red-100 text-red-800 text-[10px] font-bold px-2 py-0.5 rounded uppercase cursor-help inline-flex items-center gap-1"
                            title={`Voided by: ${d.voided_by_name || 'Admin'} | Reason: ${d.void_reason || 'N/A'}`}
                          >
                            <AlertCircle className="w-3 h-3 text-red-600" />
                            <span>VOIDED</span>
                          </span>
                          <div className="text-[10px] text-red-700 italic max-w-[130px] leading-tight">
                            by {d.voided_by_name || 'Admin'}: "{d.void_reason}"
                          </div>
                        </div>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="p-3 text-center space-x-1">
                      {/* Track Button ONLY shown when tracking/waybill number exists */}
                      {hasTrackingNumber ? (
                        <button
                          onClick={() => handleOpenTracking(d)}
                          className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-medium inline-flex items-center gap-1"
                          title="Track Live Package Status"
                        >
                          <Truck className="w-3 h-3" />
                          <span>Track</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setEditTrackingDocket(d);
                            setEditCourierPartner(d.courier_partner || 'FedEx');
                            setEditTrackingNo('');
                          }}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded font-medium inline-flex items-center gap-1"
                          title="Attach Waybill Number to Enable Tracking"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Add Waybill</span>
                        </button>
                      )}

                      <button
                        onClick={() => generateInvoicePDF(d)}
                        className="px-2 py-1 bg-slate-800 hover:bg-slate-900 text-white rounded font-medium"
                        title="Download Individual Invoice PDF"
                      >
                        PDF
                      </button>
                      {d.status === 'issued' && isAdmin && (
                        <button
                          onClick={() => setVoidModalDocket(d)}
                          className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded font-medium"
                        >
                          Void
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit / Add Tracking Waybill Number Modal */}
      {editTrackingDocket && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full border border-slate-300 shadow-xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-[#1C3E4E] uppercase tracking-wide">
                Attach Courier & Waybill No
              </h3>
              <button
                onClick={() => setEditTrackingDocket(null)}
                className="text-slate-400 hover:text-slate-700 font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Attach a courier partner and tracking waybill number to docket <strong>#{editTrackingDocket.docket_no}</strong>:
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Courier Partner</label>
                <select
                  value={editCourierPartner}
                  onChange={(e) => setEditCourierPartner(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded text-xs font-bold bg-white text-[#1C3E4E]"
                >
                  <option value="FedEx">FedEx Express</option>
                  <option value="DHL">DHL Express</option>
                  <option value="UPS">UPS Logistics</option>
                  <option value="Aramex">Aramex</option>
                  <option value="Blue Dart">Blue Dart</option>
                  <option value="Self Network">Self Network</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Waybill / Tracking No *</label>
                <input
                  type="text"
                  required
                  value={editTrackingNo}
                  onChange={(e) => setEditTrackingNo(e.target.value)}
                  placeholder="e.g. 1Z9999999999999999 or 774839201"
                  className="w-full p-2 border border-slate-300 rounded text-sm font-mono bg-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                onClick={() => setEditTrackingDocket(null)}
                className="px-4 py-2 border border-slate-300 rounded text-xs font-bold text-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTrackingInfo}
                disabled={editTrackingLoading || !editTrackingNo.trim()}
                className="px-4 py-2 bg-[#1C3E4E] hover:bg-[#224D5F] text-white rounded text-xs font-bold uppercase transition disabled:opacity-50"
              >
                {editTrackingLoading ? 'Saving...' : 'Save & Track Package'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live Package Tracking Timeline Modal */}
      {trackingModalDocket && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-xl w-full border border-slate-300 shadow-2xl overflow-hidden">
            {/* Modal Top Header */}
            <div className="bg-[#1C3E4E] text-white p-5 flex justify-between items-center">
              <div>
                <div className="flex items-center gap-2">
                  <Truck className="w-5 h-5 text-amber-400" />
                  <h3 className="font-bold text-base uppercase tracking-wide">
                    {trackingModalDocket.courier_partner || 'Courier'} Package Tracking
                  </h3>
                </div>
                <p className="text-xs text-slate-300 font-mono mt-0.5">
                  Waybill #{trackingModalDocket.tracking_no || trackingModalDocket.docket_no} · Docket #{trackingModalDocket.docket_no}
                </p>
              </div>
              <button
                onClick={() => { setTrackingModalDocket(null); setTrackingData(null); }}
                className="text-slate-400 hover:text-white font-bold text-xl px-2"
              >
                ✕
              </button>
            </div>

            {/* Modal Body Content */}
            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              {trackingLoading ? (
                <div className="text-center py-12 text-slate-500 font-medium space-y-2">
                  <div className="w-8 h-8 border-4 border-[#1C3E4E] border-t-transparent rounded-full animate-spin mx-auto"></div>
                  <p className="text-xs font-semibold">Connecting to carrier tracking gateway...</p>
                </div>
              ) : trackingData ? (
                <>
                  {/* Feed Type Badge: Live API vs Schedule Forecast */}
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-medium">Tracking Source:</span>
                    {trackingData.is_live_feed ? (
                      <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 px-2.5 py-0.5 rounded-full font-bold text-[10px] flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
                        Live Carrier API Feed
                      </span>
                    ) : (
                      <span className="bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-0.5 rounded-full font-semibold text-[10px] flex items-center gap-1">
                        <ShieldAlert className="w-3 h-3 text-amber-600" />
                        Transit Milestone Schedule Forecast
                      </span>
                    )}
                  </div>

                  {/* Route & Shipment Overview Card */}
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div>
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Freight Corridor</span>
                      <h4 className="text-base font-extrabold text-slate-800 flex items-center gap-2 mt-0.5">
                        <span>{trackingData.from_city}</span>
                        <span className="text-slate-400">➔</span>
                        <span>{trackingData.to_city}</span>
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {trackingData.consignor_name} ➔ {trackingData.consignee_name} ({trackingData.charged_weight_kg} kg)
                      </p>
                    </div>

                    <div className="text-right">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase ${
                        trackingData.status === 'Delivered'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : trackingData.status === 'Out for Delivery'
                          ? 'bg-blue-100 text-blue-800 border border-blue-300'
                          : trackingData.status === 'Voided'
                          ? 'bg-red-100 text-red-800 border border-red-300'
                          : 'bg-amber-100 text-amber-800 border border-amber-300'
                      }`}>
                        {trackingData.status === 'Delivered' && <CheckCircle2 className="w-3.5 h-3.5" />}
                        {trackingData.status === 'In Transit' && <Clock className="w-3.5 h-3.5" />}
                        <span>{trackingData.status}</span>
                      </span>
                    </div>
                  </div>

                  {/* 4-Stage Progress Bar */}
                  {trackingData.status !== 'Voided' && (
                    <div className="py-2">
                      <div className="flex justify-between items-center text-[11px] font-bold text-slate-600 mb-2">
                        <span className="text-emerald-700">1. Picked Up</span>
                        <span className={['In Transit', 'Out for Delivery', 'Delivered'].includes(trackingData.status) ? 'text-emerald-700' : 'text-slate-400'}>2. In Transit</span>
                        <span className={['Out for Delivery', 'Delivered'].includes(trackingData.status) ? 'text-emerald-700' : 'text-slate-400'}>3. Out for Delivery</span>
                        <span className={trackingData.status === 'Delivered' ? 'text-emerald-700' : 'text-slate-400'}>4. Delivered</span>
                      </div>
                      <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden flex">
                        <div className="bg-emerald-500 h-full flex-1"></div>
                        <div className={`h-full flex-1 transition-all ${['In Transit', 'Out for Delivery', 'Delivered'].includes(trackingData.status) ? 'bg-emerald-500' : 'bg-slate-200'}`}></div>
                        <div className={`h-full flex-1 transition-all ${['Out for Delivery', 'Delivered'].includes(trackingData.status) ? 'bg-emerald-500' : 'bg-slate-200'}`}></div>
                        <div className={`h-full flex-1 transition-all ${trackingData.status === 'Delivered' ? 'bg-emerald-500' : 'bg-slate-200'}`}></div>
                      </div>
                    </div>
                  )}

                  {/* Event Timeline */}
                  <div className="space-y-3">
                    <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-[#1C3E4E]" />
                      <span>Tracking Event History</span>
                    </h5>

                    <div className="relative pl-5 space-y-4 border-l-2 border-slate-200 ml-2">
                      {trackingData.events && trackingData.events.map((ev: any, idx: number) => (
                        <div key={idx} className="relative group">
                          <div className={`absolute -left-[27px] top-1 w-3.5 h-3.5 rounded-full border-2 bg-white ${idx === 0 ? 'border-emerald-600 bg-emerald-600' : 'border-slate-400'}`}></div>
                          <div>
                            <div className="flex justify-between items-center">
                              <span className="text-xs font-bold text-slate-800">{ev.status}</span>
                              <span className="text-[10px] text-slate-400 font-mono">{ev.timestamp}</span>
                            </div>
                            <p className="text-xs font-medium text-[#1C3E4E]">{ev.location}</p>
                            <p className="text-[11px] text-slate-500 mt-0.5">{ev.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* External Direct Carrier Link */}
                  {trackingData.official_url && (
                    <div className="pt-3 border-t border-slate-200 flex justify-between items-center">
                      <span className="text-xs text-slate-500">Official Portal Link:</span>
                      <a
                        href={trackingData.official_url}
                        target="_blank"
                        rel="noreferrer"
                        className="py-1.5 px-3 bg-[#1C3E4E] hover:bg-[#224D5F] text-white rounded text-xs font-bold transition inline-flex items-center gap-1.5 shadow-sm"
                      >
                        <span>Open {trackingData.courier_partner} Portal</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-6 text-slate-400">Unable to load tracking details.</div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => { setTrackingModalDocket(null); setTrackingData(null); }}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-xs font-bold uppercase transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Void Modal */}
      {voidModalDocket && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full border border-slate-300 shadow-xl">
            <h3 className="text-base font-bold text-red-700 uppercase mb-2">Void Docket #{voidModalDocket.docket_no}</h3>
            <p className="text-xs text-slate-600 mb-4">
              Permanent records cannot be deleted. Voiding preserves full audit history. Please state the reason for voiding this record:
            </p>
            <textarea
              required
              rows={3}
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="e.g. Data entry error / Customer cancelled booking"
              className="w-full p-2 border border-slate-300 rounded text-sm mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setVoidModalDocket(null)}
                className="px-4 py-2 border border-slate-300 rounded text-sm font-semibold text-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={handleVoidDocket}
                disabled={actionLoading || !voidReason.trim()}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-bold uppercase disabled:opacity-50"
              >
                {actionLoading ? 'Voiding...' : 'Confirm Void'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
