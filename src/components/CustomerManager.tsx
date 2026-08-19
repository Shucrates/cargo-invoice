'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, Plus, Search, Building2, Phone, Mail, FileText, MapPin, X, Pencil, Trash2 } from 'lucide-react';

export interface CustomerProfile {
  id: string;
  code: string;
  name: string;
  address?: string | null;
  city?: string | null;
  pinCode?: string | null;
  phone?: string | null;
  gstin?: string | null;
  email?: string | null;
  totalBilled?: number;
  totalPaid?: number;
  outstandingAmount?: number;
  outstandingCredit?: number;
  outstandingToPay?: number;
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

  // Form states
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [gstin, setGstin] = useState('');
  const [email, setEmail] = useState('');
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

  useEffect(() => {
    fetchCustomers();
  }, []);

  const openNewForm = () => {
    setEditingCustomer(null);
    setName('');
    setPhone('');
    setAddress('');
    setCity('');
    setPinCode('');
    setGstin('');
    setEmail('');
    setError(null);
    setShowModal(true);
  };

  const openEditForm = (c: CustomerProfile) => {
    setEditingCustomer(c);
    setName(c.name);
    setPhone(c.phone || '');
    setAddress(c.address || '');
    setCity(c.city || '');
    setPinCode(c.pinCode || '');
    setGstin(c.gstin || '');
    setEmail(c.email || '');
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
      const payload = { name, phone, address, city, pinCode, gstin, email };
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
      setShowModal(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.code.toLowerCase().includes(search.toLowerCase()) ||
      (c.city && c.city.toLowerCase().includes(search.toLowerCase())) ||
      (c.phone && c.phone.includes(search)) ||
      (c.gstin && c.gstin.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <Card className="border border-slate-200/80 shadow-saas bg-white rounded-2xl p-6 md:p-8">
      <CardHeader className="flex flex-row items-center justify-between pb-4 p-0 mb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <CardTitle className="text-xl font-bold text-slate-900 tracking-tight">Customer Profiles</CardTitle>
            <Badge variant="info" className="font-mono text-xs">
              {customers.length} Accounts
            </Badge>
          </div>
          <CardDescription className="text-xs text-slate-500 font-medium mt-1">
            Manage client directory and auto-populate invoice billing details.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button size="md" onClick={openNewForm} className="gap-2 shadow-saas">
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

      <CardContent className="space-y-5 p-0">
        {/* Search Input */}
        <div className="relative">
          <Input
            type="text"
            placeholder="Search by customer name, code, city, phone, or GSTIN..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-11 h-12 text-sm bg-[#F8FAFC] border-slate-200/80 shadow-saas"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-4 top-4 pointer-events-none" />
        </div>

        {/* Customer Directory List */}
        {loading ? (
          <div className="py-12 text-center text-xs text-slate-400 font-mono">Loading customer profiles...</div>
        ) : filteredCustomers.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400 font-medium">
            No customer accounts found. Click "Add Customer" to create one.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 border border-slate-200/80 rounded-2xl overflow-hidden max-h-[440px] overflow-y-auto shadow-2xs">
            {filteredCustomers.map((c) => (
              <div key={c.id} className="p-4 hover:bg-[#F8FAFC] transition-saas flex items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2.5">
                    <span className="font-semibold text-sm text-slate-900">{c.name}</span>
                    <Badge variant="outline" className="font-mono text-xs text-slate-600">
                      {c.code}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                    {c.phone && (
                      <span className="flex items-center gap-1.5 font-medium">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        {c.phone}
                      </span>
                    )}
                    {c.gstin && (
                      <span className="flex items-center gap-1.5 font-mono text-xs text-slate-600">
                        <FileText className="w-3.5 h-3.5 text-slate-400" />
                        GST: {c.gstin}
                      </span>
                    )}
                    {(c.city || c.address) && (
                      <span className="flex items-center gap-1.5 text-slate-500 truncate max-w-xs font-medium">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        {c.city ? `${c.city}${c.address ? `, ${c.address}` : ''}` : c.address} {c.pinCode ? `(${c.pinCode})` : ''}
                      </span>
                    )}
                  </div>
                  {!!c.totalBilled && (
                    <div className="flex items-center gap-x-4 text-xs font-mono flex-wrap">
                      <span className={c.outstandingCredit ? 'text-[#D14343] font-semibold' : 'text-slate-400'}>
                        Credit Due: ₹{(c.outstandingCredit ?? 0).toLocaleString('en-IN')}
                      </span>
                      <span className={c.outstandingToPay ? 'text-[#B7791F] font-semibold' : 'text-slate-400'}>
                        To Pay Due: ₹{(c.outstandingToPay ?? 0).toLocaleString('en-IN')}
                      </span>
                      <span className="text-[#1F8A4C] font-semibold">
                        Paid: ₹{(c.totalPaid ?? 0).toLocaleString('en-IN')}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {onSelectCustomer && (
                    <Button size="sm" variant="outline" onClick={() => onSelectCustomer(c)} className="text-xs shadow-saas">
                      Select Profile
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => openEditForm(c)}
                    aria-label={`Edit ${c.name}`}
                    className="text-slate-400 hover:text-[#2563EB]"
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => { setDeleteTarget(c); setDeleteError(null); }}
                    aria-label={`Delete ${c.name}`}
                    className="text-slate-400 hover:text-[#D14343]"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* New / Edit Customer Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-white border border-slate-200/90 shadow-saas-modal rounded-3xl p-6">
            <CardHeader className="flex flex-row items-center justify-between pb-4 p-0 mb-4 border-b border-slate-100">
              <CardTitle className="text-base font-bold text-slate-900">
                {editingCustomer ? 'Edit Customer Profile' : 'Add New Customer'}
              </CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setShowModal(false)} aria-label="Close modal">
                <X className="w-4 h-4 text-slate-500" />
              </Button>
            </CardHeader>

            <CardContent className="p-0">
              {error && (
                <div className="mb-4 p-3 bg-[#FDECEC] border border-red-100 text-[#D14343] text-xs font-medium rounded-xl">
                  {error}
                </div>
              )}

              <form onSubmit={handleSaveCustomer} className="space-y-3 text-xs">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Company / Customer Name *</label>
                  <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme Enterprises Pvt Ltd" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Phone Number</label>
                    <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">GSTIN Number</label>
                    <Input value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="27ABCDE1234F1Z5" className="font-mono text-[11px]" />
                  </div>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Address</label>
                  <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Building No, Street, Industrial Area" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">City</label>
                    <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Mumbai" />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">PIN Code</label>
                    <Input value={pinCode} onChange={(e) => setPinCode(e.target.value)} placeholder="400001" className="font-mono" />
                  </div>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Email Address</label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="billing@acme.com" />
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowModal(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={submitting}>
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
          <div className="bg-white rounded-lg p-6 max-w-md w-full border border-slate-300 shadow-xl">
            <h3 className="text-base font-bold text-red-700 mb-2">Delete Customer</h3>
            <p className="text-xs text-slate-600 mb-4">
              Delete "{deleteTarget.name}" ({deleteTarget.code})? This cannot be undone.
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
    </Card>
  );
}
