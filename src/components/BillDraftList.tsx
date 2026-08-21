'use client';

import { useState, useEffect } from 'react';
import { BillDraft } from '@/types/cargo';
import { Receipt, Edit2, Trash2, Users } from 'lucide-react';

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
    setDeleting(true);
    try {
      const res = await fetch(`/api/billing/drafts/${deleteTarget.id}`, { method: 'DELETE' });
      if (res.ok) {
        setDrafts((prev) => prev.filter((d) => d.id !== deleteTarget.id));
        setDeleteTarget(null);
      }
    } catch (err) {
      console.error('Failed to delete bill draft:', err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="text-center py-16 text-sm text-slate-400">Loading drafts...</div>
      ) : drafts.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-200 rounded-xl bg-white">
          <Receipt className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No saved bill drafts. Half-configure a bill and click "Save as Draft" to see it here (auto-deleted after 30 days).</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {drafts.map((draft) => (
            <div
              key={draft.id}
              className="border border-slate-200 shadow-2xs rounded-xl bg-white p-4 space-y-3 flex flex-col"
            >
              <div className="flex-1 space-y-1.5">
                <div className="text-sm font-bold text-slate-900 truncate">{draft.label}</div>
                {draft.data.customer_name && (
                  <div className="flex items-center gap-1 text-xs text-slate-500">
                    <Users className="w-3 h-3" />
                    <span>{draft.data.customer_name}</span>
                  </div>
                )}
                <div className="text-[11px] text-slate-400">Updated {timeAgo(draft.updated_at)}</div>
              </div>
              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => onEdit(draft)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-[#0A2030] bg-[#0A2030]/10 hover:bg-[#0A2030]/15 transition-all cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  Resume
                </button>
                <button
                  onClick={() => setDeleteTarget(draft)}
                  className="px-3 py-2 rounded-lg text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition-all cursor-pointer"
                  aria-label="Delete bill draft"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full border border-slate-300 shadow-xl">
            <h3 className="text-base font-bold text-red-700 mb-2">Delete Bill Draft</h3>
            <p className="text-xs text-slate-600 mb-4">
              Delete "{deleteTarget.label}"? This cannot be undone.
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
