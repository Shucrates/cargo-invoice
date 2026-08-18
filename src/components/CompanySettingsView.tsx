'use client';

import { useState, useEffect } from 'react';
import {
  Building2,
  QrCode,
  FileText,
  Save,
  CheckCircle,
  RefreshCw,
  Plus,
  Trash2,
  Edit3,
  X,
  Lock,
  Unlock,
  Check,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CompanySettings, DEFAULT_COMPANY_SETTINGS, SavedPaymentQr, getCompanySettings } from '@/lib/companyConfig';

export default function CompanySettingsView() {
  const [settings, setSettings] = useState<CompanySettings>(DEFAULT_COMPANY_SETTINGS);
  const [draft, setDraft] = useState<CompanySettings>(DEFAULT_COMPANY_SETTINGS);
  const [isEditing, setIsEditing] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    const loaded = getCompanySettings();
    setSettings(loaded);
    setDraft(loaded);
  }, []);

  const handleStartEdit = () => {
    setDraft(JSON.parse(JSON.stringify(settings)));
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setDraft(JSON.parse(JSON.stringify(settings)));
    setIsEditing(false);
  };

  const handleSave = () => {
    localStorage.setItem('cargoflow_company_settings', JSON.stringify(draft));
    setSettings(draft);
    setIsEditing(false);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3500);
  };

  const buildUpiQrUrl = (upiId: string) => {
    if (!upiId) return '';
    const upiUri = `upi://pay?pa=${upiId}&pn=${draft.tradeName}&cu=INR`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upiUri)}`;
  };

  const updateQrEntry = (id: string, patch: Partial<SavedPaymentQr>) => {
    const updatedList = draft.savedQrCodes.map((q) => {
      if (q.id !== id) return q;
      const merged = { ...q, ...patch };
      if (patch.gpayNo !== undefined || patch.upiId !== undefined) {
        const upiId = merged.upiId || (merged.gpayNo ? `${merged.gpayNo}@upi` : '');
        merged.upiId = upiId;
        merged.qrCodeUrl = buildUpiQrUrl(upiId);
      }
      return merged;
    });
    const next: CompanySettings = { ...draft, savedQrCodes: updatedList };
    if (draft.activeQrCodeId === id) {
      const entry = updatedList.find((q) => q.id === id)!;
      next.gpayNo = entry.gpayNo;
      next.upiId = entry.upiId;
      next.qrCodeUrl = entry.qrCodeUrl;
    }
    setDraft(next);
  };

  const setActiveQr = (id: string) => {
    const entry = (isEditing ? draft : settings).savedQrCodes.find((q) => q.id === id);
    if (!entry) return;
    const current = isEditing ? draft : settings;
    const next = {
      ...current,
      activeQrCodeId: id,
      gpayNo: entry.gpayNo,
      upiId: entry.upiId,
      qrCodeUrl: entry.qrCodeUrl,
    };
    if (isEditing) {
      setDraft(next);
    } else {
      localStorage.setItem('cargoflow_company_settings', JSON.stringify(next));
      setSettings(next);
      setDraft(next);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    }
  };

  const addQrEntry = () => {
    const id = `qr_${Date.now()}`;
    const entry: SavedPaymentQr = {
      id,
      label: `QR ${draft.savedQrCodes.length + 1}`,
      gpayNo: '',
      upiId: '',
      qrCodeUrl: '',
    };
    setDraft({ ...draft, savedQrCodes: [...draft.savedQrCodes, entry] });
  };

  const removeQrEntry = (id: string) => {
    if (draft.savedQrCodes.length <= 1) return;
    const remaining = draft.savedQrCodes.filter((q) => q.id !== id);
    const next: CompanySettings = { ...draft, savedQrCodes: remaining };
    if (draft.activeQrCodeId === id) {
      const fallback = remaining[0];
      next.activeQrCodeId = fallback.id;
      next.gpayNo = fallback.gpayNo;
      next.upiId = fallback.upiId;
      next.qrCodeUrl = fallback.qrCodeUrl;
    }
    setDraft(next);
  };

  const generateQrForEntry = (id: string) => {
    const entry = draft.savedQrCodes.find((q) => q.id === id);
    if (!entry) return;
    updateQrEntry(id, { upiId: entry.upiId || `${entry.gpayNo}@upi` });
  };

  const updateTerm = (index: number, val: string) => {
    const updated = [...draft.terms];
    updated[index] = val;
    setDraft({ ...draft, terms: updated });
  };

  const activeState = isEditing ? draft : settings;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header with Mode Control */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Company & Payment QR Settings</h1>
            {isEditing ? (
              <span className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                <Unlock className="w-3 h-3" />
                Editing Mode
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                <Lock className="w-3 h-3 text-slate-400" />
                Protected View
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {isEditing
              ? 'Make changes to company profile, payment methods, or terms, then click Save Changes.'
              : 'Click "Edit Information" to safely update company details, payment QR codes, and bank accounts.'}
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 shrink-0">
          {savedSuccess && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold animate-in fade-in duration-200">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              <span>Settings Saved</span>
            </div>
          )}

          {!isEditing ? (
            <Button
              onClick={handleStartEdit}
              className="bg-[#2563EB] hover:bg-blue-700 text-white gap-2 font-semibold text-xs rounded-xl shadow-saas cursor-pointer px-4 h-10 transition-all"
            >
              <Edit3 className="w-4 h-4" />
              <span>Edit Information</span>
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleCancelEdit}
                className="gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-xl h-10 px-3.5"
              >
                <X className="w-4 h-4" />
                <span>Cancel</span>
              </Button>
              <Button
                onClick={handleSave}
                className="bg-[#2563EB] hover:bg-blue-700 text-white gap-1.5 font-semibold text-xs rounded-xl shadow-saas h-10 px-4 transition-all"
              >
                <Save className="w-4 h-4" />
                <span>Save Changes</span>
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Supplier Profile Card */}
        <Card
          className={`p-6 space-y-4 border transition-all rounded-2xl bg-white shadow-2xs ${
            isEditing ? 'border-blue-300 ring-2 ring-blue-500/10' : 'border-slate-200/80'
          }`}
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5 text-sm font-bold text-slate-900">
              <Building2 className="w-4 h-4 text-[#2563EB]" />
              <span>Supplier Company Profile</span>
            </div>
            {isEditing && (
              <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                Editable
              </span>
            )}
          </div>

          <div className="space-y-3.5">
            <div>
              <label className="text-xs font-semibold text-slate-700">Trade / Company Name</label>
              <Input
                disabled={!isEditing}
                value={activeState.tradeName}
                onChange={(e) => setDraft({ ...draft, tradeName: e.target.value })}
                className={`mt-1 text-xs font-bold transition-all ${
                  isEditing
                    ? 'bg-white border-blue-300 text-slate-900 focus:border-[#2563EB]'
                    : 'bg-slate-50/80 border-slate-200 text-slate-800 cursor-default'
                }`}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">GSTIN Number</label>
              <Input
                disabled={!isEditing}
                value={activeState.gstin}
                onChange={(e) => setDraft({ ...draft, gstin: e.target.value })}
                className={`mt-1 text-xs font-mono uppercase font-bold transition-all ${
                  isEditing
                    ? 'bg-white border-blue-300 text-slate-900 focus:border-[#2563EB]'
                    : 'bg-slate-50/80 border-slate-200 text-slate-800 cursor-default'
                }`}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Company Address</label>
              <Input
                disabled={!isEditing}
                value={activeState.address}
                onChange={(e) => setDraft({ ...draft, address: e.target.value })}
                className={`mt-1 text-xs transition-all ${
                  isEditing
                    ? 'bg-white border-blue-300 text-slate-900 focus:border-[#2563EB]'
                    : 'bg-slate-50/80 border-slate-200 text-slate-800 cursor-default'
                }`}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">Primary Phone</label>
                <Input
                  disabled={!isEditing}
                  value={activeState.phone1}
                  onChange={(e) => setDraft({ ...draft, phone1: e.target.value })}
                  className={`mt-1 text-xs transition-all ${
                    isEditing
                      ? 'bg-white border-blue-300 text-slate-900 focus:border-[#2563EB]'
                      : 'bg-slate-50/80 border-slate-200 text-slate-800 cursor-default'
                  }`}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">Secondary Phone</label>
                <Input
                  disabled={!isEditing}
                  value={activeState.phone2}
                  onChange={(e) => setDraft({ ...draft, phone2: e.target.value })}
                  className={`mt-1 text-xs transition-all ${
                    isEditing
                      ? 'bg-white border-blue-300 text-slate-900 focus:border-[#2563EB]'
                      : 'bg-slate-50/80 border-slate-200 text-slate-800 cursor-default'
                  }`}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Email Address</label>
              <Input
                disabled={!isEditing}
                value={activeState.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                className={`mt-1 text-xs transition-all ${
                  isEditing
                    ? 'bg-white border-blue-300 text-slate-900 focus:border-[#2563EB]'
                    : 'bg-slate-50/80 border-slate-200 text-slate-800 cursor-default'
                }`}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Default Origin City</label>
              <Input
                disabled={!isEditing}
                value={activeState.defaultOriginCity}
                onChange={(e) => setDraft({ ...draft, defaultOriginCity: e.target.value })}
                placeholder="Mumbai"
                className={`mt-1 text-xs font-semibold transition-all ${
                  isEditing
                    ? 'bg-white border-blue-300 text-slate-900 focus:border-[#2563EB]'
                    : 'bg-slate-50/80 border-slate-200 text-slate-800 cursor-default'
                }`}
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Prefills new LR &ldquo;From&rdquo; city and picks which quotation sheet auto-prices freight by default.
              </p>
            </div>
          </div>
        </Card>

        {/* Google Pay QR & Bank Account Card */}
        <Card
          className={`p-6 space-y-4 border transition-all rounded-2xl bg-white shadow-2xs ${
            isEditing ? 'border-blue-300 ring-2 ring-blue-500/10' : 'border-slate-200/80'
          }`}
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5 text-sm font-bold text-slate-900">
              <QrCode className="w-4 h-4 text-[#2563EB]" />
              <span>Payment QR Codes</span>
            </div>
            {isEditing && (
              <Button
                type="button"
                size="sm"
                onClick={addQrEntry}
                className="h-7 text-[11px] font-bold gap-1 bg-[#2563EB] hover:bg-blue-700 text-white rounded-lg cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>Add QR</span>
              </Button>
            )}
          </div>

          <div className="space-y-3">
            {activeState.savedQrCodes.map((qr) => {
              const isActive = activeState.activeQrCodeId === qr.id;
              return (
                <div
                  key={qr.id}
                  className={`p-3 rounded-xl border space-y-3 transition-all ${
                    isActive ? 'bg-blue-50/60 border-blue-300 ring-1 ring-blue-200' : 'bg-slate-50/60 border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 bg-white border border-slate-300 rounded-lg p-1 shrink-0 flex items-center justify-center shadow-xs">
                      {qr.qrCodeUrl ? (
                        <img src={qr.qrCodeUrl} alt={qr.label} className="w-full h-full object-contain" />
                      ) : (
                        <div className="text-[9px] text-slate-400 text-center font-mono">No QR</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <Input
                          disabled={!isEditing}
                          value={qr.label}
                          onChange={(e) => updateQrEntry(qr.id, { label: e.target.value })}
                          placeholder="Label (e.g. Primary GPay)"
                          className={`h-7 text-xs font-bold transition-all ${
                            isEditing ? 'bg-white border-slate-300 text-slate-900' : 'bg-transparent border-transparent text-slate-800 cursor-default px-0'
                          }`}
                        />
                        {isActive && (
                          <span className="shrink-0 flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                            <Check className="w-3 h-3" />
                            Used for invoice
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 pt-0.5">
                        {!isActive && (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => setActiveQr(qr.id)}
                            className="h-6 text-[10px] font-bold bg-[#2563EB] hover:bg-blue-700 text-white rounded-lg cursor-pointer"
                          >
                            Use for invoice
                          </Button>
                        )}
                        {isEditing && (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => generateQrForEntry(qr.id)}
                              className="h-6 text-[10px] font-bold gap-1 bg-white hover:bg-slate-50 cursor-pointer"
                            >
                              <RefreshCw className="w-3 h-3" />
                              Generate
                            </Button>
                            {draft.savedQrCodes.length > 1 && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => removeQrEntry(qr.id)}
                                title="Delete this QR"
                                className="h-6 text-[10px] font-bold bg-red-50 border-red-200 hover:bg-red-100 hover:border-red-300 text-red-600 gap-1 cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" />
                                Delete
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-semibold text-slate-700">Google Pay Mobile No.</label>
                      <Input
                        disabled={!isEditing}
                        value={qr.gpayNo}
                        onChange={(e) => updateQrEntry(qr.id, { gpayNo: e.target.value })}
                        className={`mt-1 h-7 text-xs font-mono font-bold transition-all ${
                          isEditing
                            ? 'bg-white border-blue-300 text-slate-900'
                            : 'bg-slate-50/90 border-slate-200 text-slate-800 cursor-default'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-slate-700">UPI VPA Address</label>
                      <Input
                        disabled={!isEditing}
                        value={qr.upiId}
                        onChange={(e) => updateQrEntry(qr.id, { upiId: e.target.value })}
                        placeholder="9821541984@upi"
                        className={`mt-1 h-7 text-xs font-mono font-bold transition-all ${
                          isEditing
                            ? 'bg-white border-blue-300 text-slate-900'
                            : 'bg-slate-50/90 border-slate-200 text-slate-800 cursor-default'
                        }`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold text-slate-700">QR Code Image / API URL</label>
                    <Input
                      disabled={!isEditing}
                      value={qr.qrCodeUrl}
                      onChange={(e) => updateQrEntry(qr.id, { qrCodeUrl: e.target.value })}
                      className={`mt-1 h-7 text-xs font-mono transition-all ${
                        isEditing
                          ? 'bg-white border-blue-300 text-slate-900'
                          : 'bg-slate-50/90 border-slate-200 text-slate-600 cursor-default truncate'
                      }`}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-4 pt-1">
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
              <div>
                <label className="text-xs font-semibold text-slate-700">Bank Name</label>
                <Input
                  disabled={!isEditing}
                  value={activeState.bankName}
                  onChange={(e) => setDraft({ ...draft, bankName: e.target.value })}
                  className={`mt-1 text-xs font-semibold transition-all ${
                    isEditing
                      ? 'bg-white border-blue-300 text-slate-900'
                      : 'bg-slate-50/80 border-slate-200 text-slate-800 cursor-default'
                  }`}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">Branch</label>
                <Input
                  disabled={!isEditing}
                  value={activeState.branch}
                  onChange={(e) => setDraft({ ...draft, branch: e.target.value })}
                  className={`mt-1 text-xs font-semibold transition-all ${
                    isEditing
                      ? 'bg-white border-blue-300 text-slate-900'
                      : 'bg-slate-50/80 border-slate-200 text-slate-800 cursor-default'
                  }`}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">Account Number</label>
                <Input
                  disabled={!isEditing}
                  value={activeState.accountNo}
                  onChange={(e) => setDraft({ ...draft, accountNo: e.target.value })}
                  className={`mt-1 text-xs font-mono font-bold transition-all ${
                    isEditing
                      ? 'bg-white border-blue-300 text-slate-900'
                      : 'bg-slate-50/80 border-slate-200 text-slate-800 cursor-default'
                  }`}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">IFSC Code</label>
                <Input
                  disabled={!isEditing}
                  value={activeState.ifsc}
                  onChange={(e) => setDraft({ ...draft, ifsc: e.target.value })}
                  className={`mt-1 text-xs font-mono uppercase font-bold transition-all ${
                    isEditing
                      ? 'bg-white border-blue-300 text-slate-900'
                      : 'bg-slate-50/80 border-slate-200 text-slate-800 cursor-default'
                  }`}
                />
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Invoice Terms & Conditions Card */}
      <Card
        className={`p-6 space-y-4 border transition-all rounded-2xl bg-white shadow-2xs ${
          isEditing ? 'border-blue-300 ring-2 ring-blue-500/10' : 'border-slate-200/80'
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5 text-sm font-bold text-slate-900">
            <FileText className="w-4 h-4 text-[#2563EB]" />
            <span>Default Invoice Terms & Conditions</span>
          </div>
          {isEditing && (
            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
              Editable
            </span>
          )}
        </div>

        <div className="space-y-2.5">
          {activeState.terms.map((term, idx) => (
            <div key={idx} className="flex items-center gap-3">
              <span className="text-xs font-mono text-slate-400 font-bold w-4">{idx + 1}.</span>
              <Input
                disabled={!isEditing}
                value={term}
                onChange={(e) => updateTerm(idx, e.target.value)}
                className={`text-xs flex-1 font-medium transition-all ${
                  isEditing
                    ? 'bg-white border-blue-300 text-slate-900'
                    : 'bg-slate-50/80 border-slate-200 text-slate-800 cursor-default'
                }`}
              />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
