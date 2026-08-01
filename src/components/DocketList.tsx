'use client';

import { useState, useEffect } from 'react';
import { CargoDocket } from '@/types/cargo';
import { generateInvoicePDF } from '@/lib/pdfGenerator';
import { exportToCSV, exportSummaryPDF } from '@/lib/exportUtils';

export default function DocketList({ refreshKey }: { refreshKey: number }) {
  const [dockets, setDockets] = useState<CargoDocket[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Filters
  const [durationPreset, setDurationPreset] = useState<'all' | 'this_month' | 'last_month' | 'custom'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [modeFilter, setModeFilter] = useState<'all' | 'Road' | 'Air' | 'Train'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'issued' | 'voided'>('all');

  // Void modal
  const [voidModalDocket, setVoidModalDocket] = useState<CargoDocket | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchDockets = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dockets');
      if (res.ok) {
        const data = await res.json();
        setDockets(data as CargoDocket[]);
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

  // Filter Logic
  const filteredDockets = dockets.filter(d => {
    // 1. Text Search Filter
    const matchesSearch = 
      d.docket_no.toLowerCase().includes(search.toLowerCase()) ||
      d.consignor_name.toLowerCase().includes(search.toLowerCase()) ||
      d.consignee_name.toLowerCase().includes(search.toLowerCase()) ||
      d.from_city.toLowerCase().includes(search.toLowerCase()) ||
      d.to_city.toLowerCase().includes(search.toLowerCase());
    
    if (!matchesSearch) return false;

    // 2. Mode Filter
    if (modeFilter !== 'all' && d.transport_mode !== modeFilter) {
      return false;
    }

    // 3. Status Filter
    if (statusFilter !== 'all' && d.status !== statusFilter) {
      return false;
    }

    // 4. Duration / Date Filter
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
    return 'All Records';
  };

  return (
    <div className="bg-white border border-slate-300 rounded-md p-6 shadow-sm space-y-6">
      {/* Title & Top Search Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wide">
            Cargo Docket Audit History
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Database audit trail, filtering & export tools</p>
        </div>

        <input
          type="text"
          placeholder="Search Docket No, Consignor, City..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="p-2 border border-slate-300 rounded text-sm w-full md:w-72 focus:outline-none focus:ring-1 focus:ring-slate-800"
        />
      </div>

      {/* Filter & Export Toolbar */}
      <div className="bg-slate-50 border border-slate-200 rounded p-4 flex flex-col space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
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
              className="flex-1 py-2 px-3 bg-[#60899B] hover:bg-[#486675] text-white rounded text-xs font-bold uppercase transition tracking-wider flex items-center justify-center gap-1 shadow-sm"
              title="Export filtered dockets to Excel / CSV spreadsheet"
            >
              📊 Export CSV / Excel
            </button>

            <button
              onClick={() => exportSummaryPDF(filteredDockets, getFilterLabel())}
              className="flex-1 py-2 px-3 bg-[#1C3E4E] hover:bg-[#224D5F] text-white rounded text-xs font-bold uppercase transition tracking-wider flex items-center justify-center gap-1 shadow-sm"
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

        {/* Filter Summary Count */}
        <div className="text-[11px] text-slate-500 font-medium flex justify-between items-center">
          <span>
            Showing <strong className="text-slate-800">{filteredDockets.length}</strong> of <strong className="text-slate-800">{dockets.length}</strong> total records ({getFilterLabel()})
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
                <th className="p-3">Date / Mode</th>
                <th className="p-3">Consignor → Consignee</th>
                <th className="p-3">Route</th>
                <th className="p-3 text-right">Grand Total</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredDockets.map((d) => (
                <tr key={d.id} className={d.status === 'voided' ? 'bg-red-50/50 opacity-75' : 'hover:bg-slate-50'}>
                  <td className="p-3 font-mono font-bold text-slate-800">{d.docket_no}</td>
                  <td className="p-3">{d.booking_date}<br/><span className="text-slate-400">{d.transport_mode}</span></td>
                  <td className="p-3 font-medium">
                    <span className="text-slate-800">{d.consignor_name}</span>
                    <br/>
                    <span className="text-slate-500">→ {d.consignee_name}</span>
                  </td>
                  <td className="p-3">{d.from_city} → {d.to_city}</td>
                  <td className="p-3 text-right font-mono font-bold text-slate-900">
                    ₹{d.grand_total.toFixed(2)}
                    <br/>
                    <span className="text-[10px] text-slate-400 font-normal">{d.payment_mode}</span>
                  </td>
                  <td className="p-3">
                    {d.status === 'issued' ? (
                      <span className="bg-green-100 text-green-800 text-[10px] font-bold px-2 py-0.5 rounded uppercase">ISSUED</span>
                    ) : (
                      <span className="bg-red-100 text-red-800 text-[10px] font-bold px-2 py-0.5 rounded uppercase" title={d.void_reason}>VOIDED</span>
                    )}
                  </td>
                  <td className="p-3 text-center space-x-2">
                    <button
                      onClick={() => generateInvoicePDF(d)}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-900 text-white rounded font-medium"
                      title="Download Individual Invoice PDF"
                    >
                      PDF
                    </button>
                    {d.status === 'issued' && (
                      <button
                        onClick={() => setVoidModalDocket(d)}
                        className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded font-medium"
                      >
                        Void
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
