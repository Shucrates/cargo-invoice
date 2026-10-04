'use client';

import { useState, useEffect, useMemo } from 'react';
import { BillDraft } from '@/types/cargo';
import { FileText, Edit2, Trash2, Search, User } from 'lucide-react';

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function BillDraftList({ onEdit }: { onEdit: (draft: BillDraft) => void }) {
  const [drafts, setDrafts] = useState<BillDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<BillDraft | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState('');

  const fetchDrafts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/billing/drafts');
      if (res.ok) {
        const data = await res.json();
        setDrafts((data.drafts ?? []) as BillDraft[]);
      } else {
        setDrafts([]);
      }
    } catch (err) {
      console.error('Failed to fetch bill drafts:', err);
      setDrafts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDrafts();
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null); // Close modal instantly

    // Optimistic UI update
    setDrafts((prev) => prev.filter((d) => d.id !== target.id));

    try {
      const res = await fetch(`/api/billing/drafts/${target.id}`, { method: 'DELETE' });
      if (!res.ok) {
        setDrafts((prev) => [target, ...prev]);
        alert('Failed to delete bill draft.');
      }
    } catch (err) {
      console.error('Failed to delete bill draft:', err);
      setDrafts((prev) => [target, ...prev]);
      alert('Failed to delete bill draft.');
    }
  };

  const filteredDrafts = useMemo(() => {
    if (!search.trim()) return drafts;
    const q = search.toLowerCase();
    return drafts.filter((d) => {
      const data = d.data || {};
      return (
        (d.label && d.label.toLowerCase().includes(q)) ||
        (data.customer_name && String(data.customer_name).toLowerCase().includes(q)) ||
        (data.customer_gstin && String(data.customer_gstin).toLowerCase().includes(q)) ||
        (d.created_by_name && String(d.created_by_name).toLowerCase().includes(q))
      );
    });
  }, [drafts, search]);

  return (
    <div className="space-y-4">
      {drafts.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <div className="relative max-w-sm flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search invoice drafts by customer, creator..."
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400 transition-colors"
            />
          </div>
          <span className="text-xs text-slate-500 font-normal">
            {drafts.length} saved draft{drafts.length === 1 ? '' : 's'}
          </span>
        </div>
      )}

      {loading ? (
        <div className="text-center py-14 text-xs text-slate-400 font-medium">Loading drafts...</div>
      ) : drafts.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-slate-200 rounded-xl bg-white space-y-1.5">
          <FileText className="w-7 h-7 text-slate-300 mx-auto" />
          <p className="text-xs text-slate-500">No saved bill drafts. Click "Save as Draft" during billing to resume later.</p>
        </div>
      ) : filteredDrafts.length === 0 ? (
        <div className="text-center py-10 border border-slate-200 rounded-xl bg-white text-xs text-slate-400">
          No drafts matching "{search}"
        </div>
      ) : (
        <div className="space-y-3.5">
          {filteredDrafts.map((draft) => {
            const data = draft.data || {};
            const customerName = data.customer_name || 'Customer Pending';
            const itemCount = (data.docket_ids?.length || 0) + (data.items?.length || 0);
            const grandTotal = Number(data.grand_total || data.subtotal || 0);
            const docType = data.doc_type === 'gst_invoice' ? 'GST Invoice' : 'Bill';
            const creatorName = draft.created_by_name || 'Staff';

            return (
              <div
                key={draft.id}
                className="p-5 bg-white border border-slate-200/90 rounded-xl hover:border-slate-300 transition-colors shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-5"
              >
                {/* Left: Label, Type, Customer, Creator */}
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-bold text-slate-900 truncate">
                      {customerName}
                    </span>
                    <span className="text-[11px] font-medium text-slate-600 bg-slate-100 border border-slate-200/80 px-2 py-0.5 rounded">
                      {docType}
                    </span>
                    {data.category && (
                      <span className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded">
                        {data.category}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">
                    Label: <span className="text-slate-700 font-medium">{draft.label}</span>
                    {data.customer_gstin && <span className="ml-2 font-mono">GSTIN: {data.customer_gstin}</span>}
                  </div>

                  {/* Creator & Timestamp */}
                  <div className="flex flex-wrap items-center gap-x-3 text-[11px] text-slate-400 pt-0.5">
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3 text-slate-400" />
                      <span>Created by <strong className="font-medium text-slate-600">{creatorName}</strong></span>
                    </span>
                    <span>&middot;</span>
                    <span>Saved {timeAgo(draft.updated_at)}</span>
                  </div>
                </div>

                {/* Middle: Details (Items & Amount) */}
                <div className="flex items-center gap-6 text-xs text-slate-600 shrink-0">
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-slate-400 block uppercase font-medium">Line Items</span>
                    <span className="font-semibold text-slate-900 text-sm">{itemCount} items</span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-slate-400 block uppercase font-medium">Est. Amount</span>
                    <span className="font-semibold text-slate-900 text-sm">
                      {grandTotal > 0 ? `₹${grandTotal.toLocaleString('en-IN')}` : '—'}
                    </span>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2.5 shrink-0">
                  <button
                    onClick={() => onEdit(draft)}
                    className="h-9 px-4 text-xs font-semibold rounded-lg bg-[#0A2030] hover:bg-slate-800 text-white transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Resume</span>
                  </button>
                  <button
                    onClick={() => setDeleteTarget(draft)}
                    className="h-9 w-9 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors cursor-pointer border border-transparent hover:border-red-100"
                    title="Delete draft"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-5 max-w-sm w-full border border-slate-200 shadow-lg space-y-3">
            <h3 className="text-sm font-bold text-slate-900">Delete Bill Draft</h3>
            <p className="text-xs text-slate-500">
              Delete "{deleteTarget.label}"? This draft cannot be recovered.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-3 py-1.5 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg cursor-pointer"
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


