'use client';

import { useState, useEffect } from 'react';
import { DocketDraft } from '@/types/cargo';
import { FileText, Edit2, Trash2, MapPin } from 'lucide-react';

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

export default function DraftList({ onEdit }: { onEdit: (draft: DocketDraft) => void }) {
  const [drafts, setDrafts] = useState<DocketDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<DocketDraft | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchDrafts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dockets/drafts');
      if (res.ok) {
        const data = await res.json();
        setDrafts((data.drafts ?? []) as DocketDraft[]);
      } else {
        setDrafts([]);
      }
    } catch (err) {
      console.error('Failed to fetch drafts:', err);
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
      const res = await fetch(`/api/dockets/drafts/${deleteTarget.id}`, { method: 'DELETE' });
      if (res.ok) {
        setDrafts((prev) => prev.filter((d) => d.id !== deleteTarget.id));
        setDeleteTarget(null);
      }
    } catch (err) {
      console.error('Failed to delete draft:', err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Drafts</h1>
        <p className="text-xs text-slate-500 font-medium">Half-filled LRs saved for later (auto-deleted after 30 days) &middot; {drafts.length} draft{drafts.length === 1 ? '' : 's'}</p>
      </div>

      {loading ? (
        <div className="text-center py-16 text-sm text-slate-400">Loading drafts...</div>
      ) : drafts.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-200 rounded-xl bg-white">
          <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No saved drafts. Half-fill an LR and click "Save as Draft" to see it here.</p>
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
                {(draft.data.from_city || draft.data.to_city) && (
                  <div className="flex items-center gap-1 text-xs text-slate-500">
                    <MapPin className="w-3 h-3" />
                    <span>{draft.data.from_city || '?'} &rarr; {draft.data.to_city || '?'}</span>
                  </div>
                )}
                <div className="text-[11px] text-slate-400">Updated {timeAgo(draft.updated_at)}</div>
              </div>
              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => onEdit(draft)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-[#2563EB] bg-blue-50 hover:bg-blue-100 transition-all cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  Edit
                </button>
                <button
                  onClick={() => setDeleteTarget(draft)}
                  className="px-3 py-2 rounded-lg text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition-all cursor-pointer"
                  aria-label="Delete draft"
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
            <h3 className="text-base font-bold text-red-700 mb-2">Delete Draft</h3>
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
