import { useState } from 'react';
import { CargoDocket } from '@/types/cargo';
import { generateInvoicePDF } from '@/lib/pdfGenerator';
import { ArrowLeft } from 'lucide-react';

export default function CargoDocketForm({ 
  onCreated, 
  onBack 
}: { 
  onCreated?: () => void; 
  onBack?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form State
  const [bookingDate, setBookingDate] = useState(new Date().toISOString().split('T')[0]);
  const [transportMode, setTransportMode] = useState<'Road' | 'Air' | 'Train'>('Road');
  const [fromCity, setFromCity] = useState('');
  const [toCity, setToCity] = useState('');

  // Consignor
  const [consignorName, setConsignorName] = useState('');
  const [consignorAddress, setConsignorAddress] = useState('');
  const [consignorPin, setConsignorPin] = useState('');
  const [consignorPhone, setConsignorPhone] = useState('');
  const [consignorGstin, setConsignorGstin] = useState('');

  // Consignee
  const [consigneeName, setConsigneeName] = useState('');
  const [consigneeAddress, setConsigneeAddress] = useState('');
  const [consigneePin, setConsigneePin] = useState('');
  const [consigneePhone, setConsigneePhone] = useState('');
  const [consigneeGstin, setConsigneeGstin] = useState('');

  // Goods
  const [packageCount, setPackageCount] = useState(1);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceValue, setInvoiceValue] = useState(0);
  const [actualWeightKg, setActualWeightKg] = useState(0);
  const [chargedWeightKg, setChargedWeightKg] = useState(0);
  const [goodsDescription, setGoodsDescription] = useState('');

  // Charges
  const [freightAmount, setFreightAmount] = useState(0);
  const [handlingCharge, setHandlingCharge] = useState(0);
  const [riskCharge, setRiskCharge] = useState(0);
  const [docketCharge, setDocketCharge] = useState(150);
  const [pickupDeliveryCharge, setPickupDeliveryCharge] = useState(0);
  const [otherCharge, setOtherCharge] = useState(0);
  const [gstPercentage, setGstPercentage] = useState(18);
  const [paymentMode, setPaymentMode] = useState<'Paid' | 'To Pay' | 'Credit'>('To Pay');

  // Calculated Totals
  const subtotal = freightAmount + handlingCharge + riskCharge + docketCharge + pickupDeliveryCharge + otherCharge;
  const gstAmount = (subtotal * gstPercentage) / 100;
  const grandTotal = subtotal + gstAmount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    const newDocketPayload = {
      booking_date: bookingDate,
      transport_mode: transportMode,
      from_city: fromCity,
      to_city: toCity,
      consignor_name: consignorName,
      consignor_address: consignorAddress,
      consignor_pin: consignorPin,
      consignor_phone: consignorPhone,
      consignor_gstin: consignorGstin,
      consignee_name: consigneeName,
      consignee_address: consigneeAddress,
      consignee_pin: consigneePin,
      consignee_phone: consigneePhone,
      consignee_gstin: consigneeGstin,
      package_count: Number(packageCount),
      invoice_no: invoiceNo,
      invoice_value: Number(invoiceValue),
      actual_weight_kg: Number(actualWeightKg),
      charged_weight_kg: Number(chargedWeightKg),
      goods_description: goodsDescription,
      freight_amount: Number(freightAmount),
      handling_charge: Number(handlingCharge),
      risk_charge: Number(riskCharge),
      docket_charge: Number(docketCharge),
      pickup_delivery_charge: Number(pickupDeliveryCharge),
      other_charge: Number(otherCharge),
      subtotal,
      gst_percentage: Number(gstPercentage),
      gst_amount: gstAmount,
      grand_total: grandTotal,
      payment_mode: paymentMode,
    };

    try {
      const res = await fetch('/api/dockets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newDocketPayload),
      });

      const data = await res.json();

      if (!res.ok) {
        setMsg({ type: 'error', text: data.error || 'Failed to issue docket.' });
      } else {
        const issuedDocketNo = data.docket_no || data.docketNo;
        setMsg({ type: 'success', text: `Docket issued successfully! Assigned No: ${issuedDocketNo}` });
        
        // Auto-trigger PDF generation
        generateInvoicePDF({
          ...newDocketPayload,
          id: data.id,
          docket_no: issuedDocketNo,
          created_by: data.created_by || data.createdBy,
          status: 'issued',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as CargoDocket);

        if (onCreated) onCreated();
      }
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'An error occurred.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-[#A1A1A1] rounded-lg p-6 shadow-md space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-[#E2DDDA] pb-4">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition flex items-center gap-1 border border-slate-300"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Overview</span>
            </button>
          )}
          <div>
            <h2 className="text-lg font-bold text-[#111111] uppercase tracking-wide">Issue New Cargo LR Docket</h2>
            <p className="text-xs text-slate-500">Fill details to issue docket & generate tax invoice</p>
          </div>
        </div>
        <span className="text-xs font-mono bg-[#193746] text-white px-3 py-1.5 rounded-md font-bold">Auto Sequential Docket No</span>
      </div>

      {msg && (
        <div className={`p-3 rounded text-sm font-medium ${msg.type === 'success' ? 'bg-green-100 text-green-800 border border-green-300' : 'bg-red-100 text-red-800 border border-red-300'}`}>
          {msg.text}
        </div>
      )}

      {/* Header Fields */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Booking Date</label>
          <input type="date" required value={bookingDate} onChange={(e) => setBookingDate(e.target.value)} className="w-full p-2 border border-[#A1A1A1] rounded text-sm bg-white" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Mode</label>
          <select value={transportMode} onChange={(e) => setTransportMode(e.target.value as any)} className="w-full p-2 border border-[#A1A1A1] rounded text-sm bg-white font-medium">
            <option value="Road">Road Freight</option>
            <option value="Air">Air Freight</option>
            <option value="Train">Train Freight</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">From City</label>
          <input type="text" required placeholder="e.g. Jaipur" value={fromCity} onChange={(e) => setFromCity(e.target.value)} className="w-full p-2 border border-[#A1A1A1] rounded text-sm bg-white" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">To City</label>
          <input type="text" required placeholder="e.g. Mumbai" value={toCity} onChange={(e) => setToCity(e.target.value)} className="w-full p-2 border border-[#A1A1A1] rounded text-sm bg-white" />
        </div>
      </div>

      {/* Consignor & Consignee */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
        <div className="space-y-3 bg-[#F9F3F1] p-4 border border-[#CECAC8] rounded-md">
          <h3 className="text-xs font-bold text-[#1C3E4E] uppercase border-b border-[#A1A1A1] pb-1">Consignor (Sender)</h3>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Company / Name *</label>
            <input type="text" required value={consignorName} onChange={(e) => setConsignorName(e.target.value)} className="w-full p-2 border border-[#A1A1A1] rounded text-sm bg-white" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Phone</label>
              <input type="text" value={consignorPhone} onChange={(e) => setConsignorPhone(e.target.value)} className="w-full p-2 border border-[#A1A1A1] rounded text-sm bg-white" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">GSTIN / TIN</label>
              <input type="text" value={consignorGstin} onChange={(e) => setConsignorGstin(e.target.value)} className="w-full p-2 border border-[#A1A1A1] rounded text-sm bg-white" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Address</label>
            <input type="text" value={consignorAddress} onChange={(e) => setConsignorAddress(e.target.value)} className="w-full p-2 border border-[#A1A1A1] rounded text-sm bg-white" />
          </div>
        </div>

        <div className="space-y-3 bg-[#F9F3F1] p-4 border border-[#CECAC8] rounded-md">
          <h3 className="text-xs font-bold text-[#1C3E4E] uppercase border-b border-[#A1A1A1] pb-1">Consignee (Receiver)</h3>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Company / Name *</label>
            <input type="text" required value={consigneeName} onChange={(e) => setConsigneeName(e.target.value)} className="w-full p-2 border border-[#A1A1A1] rounded text-sm bg-white" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Phone</label>
              <input type="text" value={consigneePhone} onChange={(e) => setConsigneePhone(e.target.value)} className="w-full p-2 border border-[#A1A1A1] rounded text-sm bg-white" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">GSTIN / TIN</label>
              <input type="text" value={consigneeGstin} onChange={(e) => setConsigneeGstin(e.target.value)} className="w-full p-2 border border-[#A1A1A1] rounded text-sm bg-white" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Address</label>
            <input type="text" value={consigneeAddress} onChange={(e) => setConsigneeAddress(e.target.value)} className="w-full p-2 border border-[#A1A1A1] rounded text-sm bg-white" />
          </div>
        </div>
      </div>

      {/* Shipment & Charges */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Package Count</label>
          <input type="number" min="1" value={packageCount} onChange={(e) => setPackageCount(Number(e.target.value))} className="w-full p-2 border border-[#A1A1A1] rounded text-sm bg-white" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Actual Wt (kg)</label>
          <input type="number" value={actualWeightKg} onChange={(e) => setActualWeightKg(Number(e.target.value))} className="w-full p-2 border border-[#A1A1A1] rounded text-sm bg-white" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Charged Wt (kg)</label>
          <input type="number" value={chargedWeightKg} onChange={(e) => setChargedWeightKg(Number(e.target.value))} className="w-full p-2 border border-[#A1A1A1] rounded text-sm bg-white" />
        </div>
      </div>

      <div className="border-t border-[#CECAC8] pt-4">
        <h3 className="text-xs font-bold text-[#1C3E4E] uppercase mb-3">Freight & Charges Breakdown (INR)</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700">Freight Charge</label>
            <input type="number" value={freightAmount} onChange={(e) => setFreightAmount(Number(e.target.value))} className="w-full p-2 border border-[#A1A1A1] rounded text-sm font-mono bg-white" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Handling Charge</label>
            <input type="number" value={handlingCharge} onChange={(e) => setHandlingCharge(Number(e.target.value))} className="w-full p-2 border border-[#A1A1A1] rounded text-sm font-mono bg-white" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Docket Charge</label>
            <input type="number" value={docketCharge} onChange={(e) => setDocketCharge(Number(e.target.value))} className="w-full p-2 border border-[#A1A1A1] rounded text-sm font-mono bg-white" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Pickup/Delivery</label>
            <input type="number" value={pickupDeliveryCharge} onChange={(e) => setPickupDeliveryCharge(Number(e.target.value))} className="w-full p-2 border border-[#A1A1A1] rounded text-sm font-mono bg-white" />
          </div>
        </div>

        <div className="mt-4 p-4 bg-[#D6D3BA]/30 border border-[#9E9C8A]/50 rounded-md flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#111111] uppercase">Payment Mode</label>
            <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as any)} className="mt-1 p-2 border border-[#A1A1A1] rounded text-sm font-bold bg-white">
              <option value="To Pay">To Pay</option>
              <option value="Paid">Paid</option>
              <option value="Credit">Credit</option>
            </select>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-600 font-medium">Subtotal: ₹{subtotal.toFixed(2)} | GST (18%): ₹{gstAmount.toFixed(2)}</div>
            <div className="text-xl font-extrabold text-[#1C3E4E] font-mono">Grand Total: ₹{grandTotal.toFixed(2)}</div>
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3.5 bg-[#1C3E4E] hover:bg-[#224D5F] text-white font-bold text-sm uppercase rounded shadow-lg transition duration-200 disabled:opacity-50 tracking-wider"
      >
        {loading ? 'Issuing Docket...' : 'Issue Docket & Download PDF Invoice'}
      </button>
    </form>
  );
}
