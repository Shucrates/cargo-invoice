'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { UserPlus, Trash2, Pencil, ShieldCheck, User as UserIcon, X, Mail } from 'lucide-react';

interface StaffAccount {
  id: string;
  email: string;
  full_name: string | null;
  role: 'admin' | 'staff';
  created_at: string;
}

export default function StaffManager() {
  const { data: session } = useSession();
  const currentUserId = (session?.user as { id?: string } | undefined)?.id;

  const [users, setUsers] = useState<StaffAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<StaffAccount | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'staff' | 'admin'>('staff');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<StaffAccount | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        setUsers(await res.json());
      }
    } catch (err) {
      console.error('Failed to fetch staff accounts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const openNewForm = () => {
    setEditingUser(null);
    setEmail('');
    setPassword('');
    setFullName('');
    setRole('staff');
    setError(null);
    setShowModal(true);
  };

  const openEditForm = (u: StaffAccount) => {
    setEditingUser(u);
    setEmail(u.email);
    setPassword('');
    setFullName(u.full_name || '');
    setRole(u.role);
    setError(null);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const url = editingUser ? `/api/users/${editingUser.id}` : '/api/users';
      const method = editingUser ? 'PATCH' : 'POST';
      const body: Record<string, unknown> = { email, full_name: fullName, role };
      if (!editingUser || password) {
        body.password = password;
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to save account');
      }
      await fetchUsers();
      setShowModal(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save account');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/users/${deleteTarget.id}`, { method: 'DELETE' });
      if (res.ok) {
        setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
        setDeleteTarget(null);
      } else {
        const errJson = await res.json();
        setDeleteError(errJson.error || 'Failed to delete account');
      }
    } catch (err) {
      console.error('Failed to delete staff account:', err);
      setDeleteError('Failed to delete account.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-center pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Staff Accounts</h1>
          <p className="text-xs text-slate-500 mt-1">
            Create, review, and remove staff and admin logins.
          </p>
        </div>
        <Button onClick={openNewForm} className="bg-[#2563EB] hover:bg-blue-700 text-white gap-2 font-medium text-xs shadow-sm">
          <UserPlus className="w-4 h-4" />
          <span>Add Staff Account</span>
        </Button>
      </div>

      <Card className="border border-slate-200 shadow-2xs bg-white rounded-xl">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base font-bold text-slate-900">Accounts</CardTitle>
            <Badge variant="secondary" className="font-mono text-[10px]">
              {users.length} Total
            </Badge>
          </div>
          <CardDescription className="text-xs text-slate-500">
            Admins can create, edit, reset passwords for, and delete accounts. You cannot delete your own account, change your own role, or remove the last remaining admin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-xs text-slate-400 font-mono">Loading accounts...</div>
          ) : users.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">No accounts found.</div>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200/80 rounded-lg overflow-hidden">
              {users.map((u) => (
                <div key={u.id} className="p-3.5 hover:bg-slate-50 transition-colors flex items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-slate-900">{u.full_name || u.email}</span>
                      <Badge
                        variant="outline"
                        className={`font-mono text-[10px] uppercase ${
                          u.role === 'admin' ? 'text-[#2563EB] border-blue-200 bg-blue-50' : 'text-slate-600'
                        }`}
                      >
                        {u.role === 'admin' ? <ShieldCheck className="w-3 h-3 mr-1" /> : <UserIcon className="w-3 h-3 mr-1" />}
                        {u.role}
                      </Badge>
                      {u.id === currentUserId && (
                        <Badge variant="secondary" className="text-[10px]">You</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-slate-500">
                      <Mail className="w-3 h-3 text-slate-400" />
                      {u.email}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => openEditForm(u)}
                      aria-label={`Edit ${u.email}`}
                      className="text-slate-500 hover:text-[#2563EB]"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => { setDeleteTarget(u); setDeleteError(null); }}
                      disabled={u.id === currentUserId}
                      aria-label={`Delete ${u.email}`}
                      className="text-slate-500 hover:text-red-600 disabled:opacity-30"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit Staff Account Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-white border border-slate-200 shadow-xl rounded-xl">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm font-bold text-slate-900">
                {editingUser ? 'Edit Staff Account' : 'Add Staff Account'}
              </CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setShowModal(false)} aria-label="Close modal">
                <X className="w-4 h-4 text-slate-500" />
              </Button>
            </CardHeader>
            <CardContent>
              {error && (
                <div className="mb-4 p-2.5 bg-red-50 border border-red-200 text-red-700 text-xs font-medium rounded-md">
                  {error}
                </div>
              )}
              <form onSubmit={handleSave} className="space-y-3 text-xs">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Full Name</label>
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Priya Sharma" />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Email *</label>
                  <Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="staff@rudracargo.com" />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    {editingUser ? 'Reset Password' : 'Password *'}
                  </label>
                  <Input
                    required={!editingUser}
                    type="password"
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={editingUser ? 'Leave blank to keep current password' : 'At least 8 characters'}
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Role</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as 'staff' | 'admin')}
                    disabled={editingUser?.id === currentUserId}
                    className="w-full h-9 px-3 border border-slate-200 rounded-lg bg-white text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  >
                    <option value="staff">Staff</option>
                    <option value="admin">Admin</option>
                  </select>
                  {editingUser?.id === currentUserId && (
                    <p className="text-[11px] text-slate-400 mt-1">You cannot change your own role.</p>
                  )}
                </div>
                <div className="pt-2 flex justify-end gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowModal(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={submitting}>
                    {submitting ? 'Saving...' : editingUser ? 'Save Changes' : 'Create Account'}
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
          <div className="bg-white rounded-lg p-6 max-w-md w-full border border-slate-300 shadow-xl">
            <h3 className="text-base font-bold text-red-700 mb-2">Delete Staff Account</h3>
            <p className="text-xs text-slate-600 mb-4">
              Delete "{deleteTarget.full_name || deleteTarget.email}" ({deleteTarget.email})? This cannot be undone.
            </p>
            {deleteError && (
              <div className="mb-4 p-2.5 bg-red-50 border border-red-200 text-red-700 text-xs font-medium rounded-md">
                {deleteError}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setDeleteTarget(null); setDeleteError(null); }}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleDelete}
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
