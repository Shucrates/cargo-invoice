'use client';

import { useState, useEffect } from 'react';
import { Building2, QrCode, FileText, Save, CheckCircle, RefreshCw, Plus, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CompanySettings, DEFAULT_COMPANY_SETTINGS, SavedPaymentQr, getCompanySettings } from '@/lib/companyConfig';

export default function CompanySettingsView() {
  const [settings, setSettings] = useState<CompanySettings>(DEFAULT_COMPANY_SETTINGS);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    setSettings(getCompanySettings());
  }, []);

  const handleSave = () => {
    localStorage.setItem('cargoflow_company_settings', JSON.stringify(settings));
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const buildUpiQrUrl = (upiId: string) => {
    if (!upiId) return '';
    const upiUri = `upi://pay?pa=${upiId}&pn=${settings.tradeName}&cu=INR`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upiUri)}`;
  };

  const updateQrEntry = (id: string, patch: Partial<SavedPaymentQr>) => {
    const updatedList = settings.savedQrCodes.map((q) => {
      if (q.id !== id) return q;
      const merged = { ...q, ...patch };
      // Re-derive the scannable image whenever the payee identity changes so
      // the QR on screen can never go stale relative to the typed UPI ID.
      if (patch.gpayNo !== undefined || patch.upiId !== undefined) {
        const upiId = merged.upiId || (merged.gpayNo ? `${merged.gpayNo}@upi` : '');
        merged.upiId = upiId;
        merged.qrCodeUrl = buildUpiQrUrl(upiId);
      }
      return merged;
    });
    const next: CompanySettings = { ...settings, savedQrCodes: updatedList };
    if (settings.activeQrCodeId === id) {
      const entry = updatedList.find((q) => q.id === id)!;
      next.gpayNo = entry.gpayNo;
      next.upiId = entry.upiId;
      next.qrCodeUrl = entry.qrCodeUrl;
    }
    setSettings(next);
  };

  const setActiveQr = (id: string) => {
    const entry = settings.savedQrCodes.find((q) => q.id === id);
    if (!entry) return;
    setSettings({ ...settings, activeQrCodeId: id, gpayNo: entry.gpayNo, upiId: entry.upiId, qrCodeUrl: entry.qrCodeUrl });
  };

  const addQrEntry = () => {
    const id = `qr_${Date.now()}`;
    const entry: SavedPaymentQr = { id, label: `QR ${settings.savedQrCodes.length + 1}`, gpayNo: '', upiId: '', qrCodeUrl: '' };
    setSettings({ ...settings, savedQrCodes: [...settings.savedQrCodes, entry] });
  };

  const removeQrEntry = (id: string) => {
    if (settings.savedQrCodes.length <= 1) return;
    const remaining = settings.savedQrCodes.filter((q) => q.id !== id);
    const next: CompanySettings = { ...settings, savedQrCodes: remaining };
    if (settings.activeQrCodeId === id) {
      const fallback = remaining[0];
      next.activeQrCodeId = fallback.id;
      next.gpayNo = fallback.gpayNo;
      next.upiId = fallback.upiId;
      next.qrCodeUrl = fallback.qrCodeUrl;
    }
    setSettings(next);
  };

  const generateQrForEntry = (id: string) => {
    const entry = settings.savedQrCodes.find((q) => q.id === id);
    if (!entry) return;
    updateQrEntry(id, { upiId: entry.upiId || `${entry.gpayNo}@upi` });
  };

  const updateTerm = (index: number, val: string) => {
    const updated = [...settings.terms];
    updated[index] = val;
    setSettings({ ...settings, terms: updated });
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Company & Payment QR Settings</h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage your supplier details, default Google Pay QR Code, Bank accounts, and Tax Invoice terms.
          </p>
        </div>
        <Button onClick={handleSave} className="bg-[#2563EB] hover:bg-blue-700 text-white gap-2 font-medium text-xs shadow-sm">
          {savedSuccess ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Save className="w-4 h-4" />}
          <span>{savedSuccess ? 'Settings Saved!' : 'Save Settings'}</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Supplier Profile Card */}
        <Card className="p-6 space-y-4 border border-slate-200 shadow-2xs rounded-xl bg-white">
          <div className="flex items-center gap-2.5 text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
            <Building2 className="w-4 h-4 text-[#2563EB]" />
            <span>Supplier Company Profile</span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-700">Trade / Company Name</label>
              <Input
                value={settings.tradeName}
                onChange={(e) => setSettings({ ...settings, tradeName: e.target.value })}
                className="mt-1 text-xs text-blue-700 font-bold"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">GSTIN Number</label>
              <Input
                value={settings.gstin}
                onChange={(e) => setSettings({ ...settings, gstin: e.target.value })}
                className="mt-1 text-xs font-mono uppercase text-blue-700 font-bold"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Company Address</label>
              <Input
                value={settings.address}
                onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                className="mt-1 text-xs text-blue-700"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">Primary Phone</label>
                <Input
                  value={settings.phone1}
                  onChange={(e) => setSettings({ ...settings, phone1: e.target.value })}
                  className="mt-1 text-xs text-blue-700"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">Secondary Phone</label>
                <Input
                  value={settings.phone2}
                  onChange={(e) => setSettings({ ...settings, phone2: e.target.value })}
                  className="mt-1 text-xs text-blue-700"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Email Address</label>
              <Input
                value={settings.email}
                onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                className="mt-1 text-xs text-blue-700"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Default Origin City</label>
              <Input
                value={settings.defaultOriginCity}
                onChange={(e) => setSettings({ ...settings, defaultOriginCity: e.target.value })}
                placeholder="Mumbai"
                className="mt-1 text-xs text-blue-700 font-semibold"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Prefills new LR &ldquo;From&rdquo; city and picks which quotation sheet auto-prices freight by default.
              </p>
            </div>
          </div>
        </Card>

        {/* Google Pay QR & Bank Account Card */}
        <Card className="p-6 space-y-4 border border-slate-200 shadow-2xs rounded-xl bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5 text-sm font-bold text-slate-900">
              <QrCode className="w-4 h-4 text-[#2563EB]" />
              <span>Payment QR Codes</span>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={addQrEntry}
              className="h-7 text-[11px] font-bold gap-1"
            >
              <Plus className="w-3 h-3" />
              <span>Add QR</span>
            </Button>
          </div>

          <div className="space-y-3">
            {settings.savedQrCodes.map((qr) => {
              const isActive = settings.activeQrCodeId === qr.id;
              return (
                <div
                  key={qr.id}
                  className={`p-3 rounded-xl border space-y-3 ${
                    isActive ? 'bg-blue-50/60 border-blue-300' : 'bg-slate-50/60 border-slate-200'
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
                          value={qr.label}
                          onChange={(e) => updateQrEntry(qr.id, { label: e.target.value })}
                          placeholder="Label (e.g. Personal GPay)"
                          className="h-7 text-xs font-bold text-slate-900"
                        />
                        {isActive && (
                          <span className="shrink-0 flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-1 rounded-full">
                            <CheckCircle className="w-3 h-3" />
                            Used for invoice
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {!isActive && (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => setActiveQr(qr.id)}
                            className="h-6 text-[10px] font-bold bg-[#2563EB] hover:bg-blue-700 text-white"
                          >
                            Use for invoice
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => generateQrForEntry(qr.id)}
                          className="h-6 text-[10px] font-bold gap-1"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Generate
                        </Button>
                        {settings.savedQrCodes.length > 1 && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => removeQrEntry(qr.id)}
                            title="Delete this QR"
                            className="h-6 text-[10px] font-bold bg-red-50 border-red-200 hover:bg-red-100 hover:border-red-300 text-red-600 gap-1"
                          >
                            <Trash2 className="w-3 h-3" />
                            Delete
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-semibold text-slate-700">Google Pay Mobile No.</label>
                      <Input
                        value={qr.gpayNo}
                        onChange={(e) => updateQrEntry(qr.id, { gpayNo: e.target.value })}
                        className="mt-1 h-7 text-xs font-mono text-blue-700 font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-slate-700">UPI VPA Address</label>
                      <Input
                        value={qr.upiId}
                        onChange={(e) => updateQrEntry(qr.id, { upiId: e.target.value })}
                        placeholder="9821541984@upi"
                        className="mt-1 h-7 text-xs font-mono text-blue-700 font-bold"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold text-slate-700">QR Code Image / API URL</label>
                    <Input
                      value={qr.qrCodeUrl}
                      onChange={(e) => updateQrEntry(qr.id, { qrCodeUrl: e.target.value })}
                      className="mt-1 h-7 text-xs text-blue-700 font-mono"
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
                  value={settings.bankName}
                  onChange={(e) => setSettings({ ...settings, bankName: e.target.value })}
                  className="mt-1 text-xs text-blue-700 font-semibold"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">Branch</label>
                <Input
                  value={settings.branch}
                  onChange={(e) => setSettings({ ...settings, branch: e.target.value })}
                  className="mt-1 text-xs text-blue-700 font-semibold"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">Account Number</label>
                <Input
                  value={settings.accountNo}
                  onChange={(e) => setSettings({ ...settings, accountNo: e.target.value })}
                  className="mt-1 text-xs font-mono text-blue-700 font-bold"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">IFSC Code</label>
                <Input
                  value={settings.ifsc}
                  onChange={(e) => setSettings({ ...settings, ifsc: e.target.value })}
                  className="mt-1 text-xs font-mono uppercase text-blue-700 font-bold"
                />
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Invoice Terms & Conditions Card */}
      <Card className="p-6 space-y-4 border border-slate-200 shadow-2xs rounded-xl bg-white">
        <div className="flex items-center gap-2.5 text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
          <FileText className="w-4 h-4 text-[#2563EB]" />
          <span>Default Invoice Terms & Conditions</span>
        </div>

        <div className="space-y-2.5">
          {settings.terms.map((term, idx) => (
            <div key={idx} className="flex items-center gap-3">
              <span className="text-xs font-mono text-slate-400 font-bold w-4">{idx + 1}.</span>
              <Input
                value={term}
                onChange={(e) => updateTerm(idx, e.target.value)}
                className="text-xs flex-1 text-blue-700 font-medium"
              />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
