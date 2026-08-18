'use client';

import { useState, useEffect, Fragment } from 'react';
import { Receipt, Download, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { Bill } from '@/types/cargo';
import { generateBillPDF, BillLineDocket } from '@/lib/pdfGenerator';
import { formatCreatedAt } from '@/lib/formatDate';

export default function BillHistoryList() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedDockets, setExpandedDockets] = useState<BillLineDocket[]>([]);
  const [expandLoading, setExpandLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Bill | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchBills = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/billing?limit=200');
      if (res.ok) {
        const data = await res.json();
        setBills((data.bills ?? []) as Bill[]);
      } else {
        setBills([]);
      }
    } catch (err) {
      console.error('Failed to fetch bills:', err);
      setBills([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBills();
  }, []);

  const fetchDetail = async (id: string) => {
    const res = await fetch(`/api/billing/${id}`);
    if (!res.ok) throw new Error('Failed to load bill detail');
    return res.json();
  };

  const handleToggleView = async (bill: Bill) => {
    if (expandedId === bill.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(bill.id);
    setExpandLoading(true);
    try {
      const detail = await fetchDetail(bill.id);
      setExpandedDockets(detail.dockets ?? []);
    } catch (err) {
      console.error(err);
      setExpandedDockets([]);
    } finally {
      setExpandLoading(false);
    }
  };

  const handleDownload = async (bill: Bill) => {
    setDownloadingId(bill.id);
    try {
      const detail = await fetchDetail(bill.id);
      generateBillPDF(bill, detail.dockets ?? []);
    } catch (err) {
      console.error('Failed to download bill PDF:', err);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async () => {
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

  if (loading) {
    return <div className="text-center py-16 text-sm text-slate-400">Loading bills...</div>;
  }

  if (bills.length === 0) {
    return (
      <div className="text-center py-16 border border-dashed border-slate-200 rounded-xl bg-white">
        <Receipt className="w-8 h-8 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-500">No bills issued yet. Configure one in "New Bill" and click "Issue Bill".</p>
      </div>
    );
  }

  return (
    <div className="border border-slate-200 shadow-2xs rounded-xl bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
            <tr>
              <th className="px-4 py-3">Bill No.</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">LRs</th>
              <th className="px-4 py-3">Issued By</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {bills.map((b) => (
              <Fragment key={b.id}>
                <tr className="hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-mono font-bold text-blue-700">{b.bill_no}</td>
                  <td className="px-4 py-3 text-slate-500">{b.invoice_date}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{b.customer_name}</td>
                  <td className="px-4 py-3 font-mono text-slate-600">{b.docket_ids.length}</td>
                  <td className="px-4 py-3 text-slate-500" title={`${b.created_by_email || ''}${b.created_at ? ` · ${formatCreatedAt(b.created_at)}` : ''}`}>
                    <div>{b.created_by_name || 'Staff'}</div>
                    {b.created_at && (
                      <div className="text-[10px] text-slate-400 font-mono">{formatCreatedAt(b.created_at)}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                    ₹{Number(b.grand_total).toLocaleString('en-IN')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleToggleView(b)}
                        className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
                        title="View line items"
                      >
                        {expandedId === b.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => handleDownload(b)}
                        disabled={downloadingId === b.id}
                        className="p-1.5 rounded-lg text-[#2563EB] hover:bg-blue-50 cursor-pointer disabled:opacity-50"
                        title="Download PDF"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(b)}
                        className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 cursor-pointer"
                        title="Delete bill"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
                {expandedId === b.id && (
                  <tr className="bg-slate-50/60">
                    <td colSpan={7} className="px-4 py-3">
                      {expandLoading ? (
                        <div className="text-xs text-slate-400 py-2">Loading line items...</div>
                      ) : (
                        <div className="space-y-1">
                          {expandedDockets.map((d) => (
                            <div key={d.docket_no} className="flex items-center justify-between text-[11px] py-1 border-b border-slate-100 last:border-0">
                              <span className="font-mono font-semibold text-blue-700">{d.docket_no}</span>
                              <span className="text-slate-500">{d.consignor_name}</span>
                              <span className="text-slate-500">{d.from_city} → {d.to_city}</span>
                              <span className="font-mono text-slate-700">₹{Number(d.grand_total).toLocaleString('en-IN')}</span>
                            </div>
                          ))}
                          <div className="flex justify-between text-[11px] pt-2 text-slate-600 font-semibold">
                            <span>Sub Amount: ₹{Number(b.subtotal).toLocaleString('en-IN')}</span>
                            <span>GST: ₹{Number(b.gst_amount).toLocaleString('en-IN')}</span>
                            {b.discount > 0 && <span>Discount: -₹{Number(b.discount).toLocaleString('en-IN')}</span>}
                            <span>Round Off: ₹{Number(b.round_off).toFixed(2)}</span>
                            <span className="text-slate-900">Net: ₹{Number(b.grand_total).toLocaleString('en-IN')}</span>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full border border-slate-300 shadow-xl">
            <h3 className="text-base font-bold text-red-700 mb-2">Delete Bill</h3>
            <p className="text-xs text-slate-600 mb-4">
              Delete bill "{deleteTarget.bill_no}" for {deleteTarget.customer_name}? This cannot be undone, and its LRs will become available to bill again.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 border border-slate-300 rounded text-sm font-semibold text-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-bold uppercase disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
