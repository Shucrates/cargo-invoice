import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import { CargoDocket, Bill, ExpenseLedger, ExpenseEntry } from '@/types/cargo';
import { getCompanySettings } from '@/lib/companyConfig';
import { RUDRA_LOGO_BASE64 } from '@/lib/logoData';

function numberToWords(num: number): string {
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  if (!num || num === 0) return 'Zero Rupees Only';

  const inWords = (n: number): string => {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : '');
    if (n < 1000) return a[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' ' + inWords(n % 100) : '');
    if (n < 100000) return inWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 !== 0 ? ' ' + inWords(n % 1000) : '');
    if (n < 10000000) return inWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 !== 0 ? ' ' + inWords(n % 100000) : '');
    return inWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 !== 0 ? ' ' + inWords(n % 10000000) : '');
  };

  return inWords(Math.floor(num)) + ' Rupees Only';
}

export async function buildInvoicePDF(docket: CargoDocket): Promise<jsPDF> {
  const settings = getCompanySettings();

  // Precise Calculation Audit
  const freight = Number(docket.freight_amount || 0);
  const handling = Number(docket.handling_charge || 0);
  const risk = Number(docket.risk_charge || 0);
  const docketChg = Number(docket.docket_charge || 0);
  const pickup = Number(docket.pickup_delivery_charge || 0);
  const other = Number(docket.other_charge || 0);

  const calculatedSubtotal = freight + handling + risk + docketChg + pickup + other;
  const subtotal = Number(docket.subtotal || calculatedSubtotal);

  const isAir = docket.transport_mode === 'Air';
  const serviceCharge = isAir ? Math.round(subtotal * 0.35 * 100) / 100 : 0;

  const gstPercentage = Number(docket.gst_percentage || 18);
  const calculatedGST = Math.round(subtotal * (gstPercentage / 100));
  const gstAmount = Number(docket.gst_amount || calculatedGST);

  const grandTotal = Number(docket.grand_total || (subtotal + serviceCharge + gstAmount));

  // A4 Landscape Mode (297mm x 210mm)
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const marginX = 10;
  const marginY = 8;
  const pageW = 277;
  const pageH = 194;

  // Template Style: Slate Gray Form Labels & Grid
  const setTemplateStyle = () => {
    doc.setTextColor(71, 85, 105); // #475569 Dark Slate
    doc.setDrawColor(148, 163, 184); // #94A3B8 Border Lines
  };

  // Dynamic Data Ink Style: Black Ink (#0F172A)
  const setDataStyle = (fontSize: number = 9) => {
    doc.setTextColor(15, 23, 42); // #0F172A Dark Black Ink
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(fontSize);
  };

  doc.setLineWidth(0.4);

  // Outer Docket Border Box
  setTemplateStyle();
  doc.rect(marginX, marginY, pageW, pageH);

  // ==========================================
  // TOP BAR: Transport Mode Checkboxes & Docket Number
  // ==========================================
  const drawCheckbox = (x: number, y: number, label: string, isChecked: boolean) => {
    setTemplateStyle();
    doc.rect(x, y, 3.5, 3.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(label, x + 5, y + 2.8);

    if (isChecked) {
      setDataStyle(8.5);
      doc.text('X', x + 0.9, y + 2.8);
      setTemplateStyle();
    }
  };

  drawCheckbox(105, marginY + 1.5, 'International', Boolean(docket.is_international));
  drawCheckbox(132, marginY + 1.5, 'Air', docket.transport_mode === 'Air');
  drawCheckbox(150, marginY + 1.5, 'Road', docket.transport_mode === 'Road');
  drawCheckbox(170, marginY + 1.5, 'Train', docket.transport_mode === 'Train');

  // Top Right No. Box
  setTemplateStyle();
  doc.setFontSize(9);
  doc.text('No.', 198, marginY + 4.5);

  // DOCKET NUMBER (Royal Blue Ink)
  setDataStyle(13);
  doc.text(docket.docket_no, 208, marginY + 5);

  setTemplateStyle();
  doc.line(marginX, marginY + 7, marginX + pageW, marginY + 7);

  // ==========================================
  // HEADER SECTION (Company Logo & Info)
  // ==========================================
  setTemplateStyle();
  doc.line(130, marginY + 7, 130, marginY + 29.5);
  doc.line(196, marginY + 7, 196, marginY + 29.5);

  // Left Company Logo Graphic
  try {
    doc.addImage(RUDRA_LOGO_BASE64, 'PNG', marginX + 2, marginY + 8, 19, 18);
  } catch (e) {
    console.error('Failed to render company logo on PDF:', e);
  }

  // Left Company Title (Dark Black) - Shifted to marginX + 23 to sit beside logo
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(settings.tradeName, marginX + 23, marginY + 12);

  setTemplateStyle();
  doc.setFontSize(7.5);
  doc.text(`GSTIN : ${settings.gstin}`, marginX + 23, marginY + 16);
  doc.setFont('helvetica', 'normal');
  doc.text(settings.address, marginX + 23, marginY + 20);
  doc.text(`Ph: ${settings.phone1} | Email: ${settings.email}`, marginX + 23, marginY + 24);

  // Middle FROM / TO Box
  setTemplateStyle();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('F', 132, marginY + 11);
  doc.text('R', 132, marginY + 14);
  doc.text('O', 132, marginY + 17);
  doc.text('M', 132, marginY + 20);

  // FROM CITY (Royal Blue Ink)
  setDataStyle(11);
  doc.text(docket.from_city || 'MUMBAI', 140, marginY + 15);

  setTemplateStyle();
  doc.line(130, marginY + 21.5, 196, marginY + 21.5);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text('T', 132, marginY + 25.5);
  doc.text('O', 132, marginY + 27.5);

  // TO CITY (Royal Blue Ink)
  setDataStyle(11);
  doc.text(docket.to_city || 'GUWAHATI', 140, marginY + 27);

  // Right Header Docket Type, Date & Tracking Info
  setTemplateStyle();
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text('NON-NEGOTIABLE DOCKET', 198, marginY + 11);

  doc.line(196, marginY + 12.5, marginX + pageW, marginY + 12.5);

  // Row 2: DATE
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text('DATE:', 198, marginY + 16.5);
  setDataStyle(7.5);
  doc.text(docket.booking_date, 236, marginY + 16.5);

  setTemplateStyle();
  doc.line(196, marginY + 18, marginX + pageW, marginY + 18);

  // Row 3: LR DOCKET NO
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text('LR DOCKET NO:', 198, marginY + 22);
  setDataStyle(7.5);
  doc.text(docket.docket_no, 236, marginY + 22);

  let headerBottomY = marginY + 23.5;

  if (docket.tracking_no && docket.physical_docket_no) {
    setTemplateStyle();
    doc.line(196, marginY + 23.5, marginX + pageW, marginY + 23.5);

    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text(`WAYBILL (${docket.courier_partner || 'Self'}):`, 198, marginY + 27.5);
    setDataStyle(7.5);
    doc.text(docket.tracking_no, 236, marginY + 27.5);

    setTemplateStyle();
    doc.line(196, marginY + 29, marginX + pageW, marginY + 29);

    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text('PAPER LR NO:', 198, marginY + 33);
    setDataStyle(7.5);
    doc.text(docket.physical_docket_no, 236, marginY + 33);

    headerBottomY = marginY + 34.5;
  } else if (docket.tracking_no) {
    setTemplateStyle();
    doc.line(196, marginY + 23.5, marginX + pageW, marginY + 23.5);

    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text(`WAYBILL (${docket.courier_partner || 'Self'}):`, 198, marginY + 27.5);
    setDataStyle(7.5);
    doc.text(docket.tracking_no, 236, marginY + 27.5);

    headerBottomY = marginY + 29;
  } else if (docket.physical_docket_no) {
    setTemplateStyle();
    doc.line(196, marginY + 23.5, marginX + pageW, marginY + 23.5);

    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text('PAPER LR NO:', 198, marginY + 27.5);
    setDataStyle(7.5);
    doc.text(docket.physical_docket_no, 236, marginY + 27.5);

    headerBottomY = marginY + 29;
  }

  setTemplateStyle();
  doc.line(130, marginY + 7, 130, headerBottomY);
  doc.line(196, marginY + 7, 196, headerBottomY);
  doc.line(marginX, headerBottomY, marginX + pageW, headerBottomY);

  // ==========================================
  // LEFT COLUMN: CONSIGNOR, CONSIGNEE, INSURANCE, PAYMENT
  // ==========================================
  const leftColW = 125;
  const rightColX = marginX + leftColW; // 135

  doc.line(rightColX, headerBottomY, rightColX, marginY + 178);

  // --- 1. CONSIGNOR BOX ---
  let curY = headerBottomY;
  setTemplateStyle();
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('CONSIGNOR', marginX + 2, curY + 4);

  // CONSIGNOR NAME (Royal Blue Ink)
  setDataStyle(9.5);
  doc.text(docket.consignor_name || '', marginX + 24, curY + 4);

  setTemplateStyle();
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  if (docket.consignor_address) {
    setDataStyle(8);
    doc.text(docket.consignor_address, marginX + 2, curY + 9);
    setTemplateStyle();
  }

  // PIN boxes
  const extractPinCode = (pin?: string | null, address?: string | null): string => {
    if (pin && pin.trim().length >= 6) return pin.trim();
    if (address) {
      const match = address.match(/\b\d{6}\b/);
      if (match) return match[0];
    }
    return pin ? pin.trim() : '';
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('PIN :', marginX + 70, curY + 9);
  const pin1 = extractPinCode(docket.consignor_pin, docket.consignor_address).padEnd(6, ' ');
  for (let i = 0; i < 6; i++) {
    const px = marginX + 80 + i * 3.5;
    doc.rect(px, curY + 6.5, 3.2, 3.2);
    if (pin1[i] && pin1[i] !== ' ') {
      setDataStyle(8);
      doc.text(pin1[i], px + 0.8, curY + 9);
      setTemplateStyle();
    }
  }

  doc.text('PH. :', marginX + 70, curY + 14);
  if (docket.consignor_phone) {
    setDataStyle(8);
    doc.text(docket.consignor_phone, marginX + 77, curY + 14);
    setTemplateStyle();
  }

  doc.text('CST/LST No./TIN No. :', marginX + 2, curY + 14);
  if (docket.consignor_gstin) {
    setDataStyle(8);
    doc.text(docket.consignor_gstin, marginX + 32, curY + 14);
    setTemplateStyle();
  }

  doc.line(marginX, curY + 16, rightColX, curY + 16);

  // --- 2. CONSIGNEE BOX ---
  curY += 16;
  setTemplateStyle();
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('CONSIGNEE', marginX + 2, curY + 4);

  // CONSIGNEE NAME (Royal Blue Ink)
  setDataStyle(9.5);
  doc.text(docket.consignee_name || '', marginX + 24, curY + 4);

  setTemplateStyle();
  doc.setFontSize(7.5);
  if (docket.consignee_address) {
    setDataStyle(8);
    doc.text(docket.consignee_address, marginX + 2, curY + 9);
    setTemplateStyle();
  }

  // PIN boxes
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('PIN :', marginX + 70, curY + 9);
  const pin2 = extractPinCode(docket.consignee_pin, docket.consignee_address).padEnd(6, ' ');
  for (let i = 0; i < 6; i++) {
    const px = marginX + 80 + i * 3.5;
    doc.rect(px, curY + 6.5, 3.2, 3.2);
    if (pin2[i] && pin2[i] !== ' ') {
      setDataStyle(8);
      doc.text(pin2[i], px + 0.8, curY + 9);
      setTemplateStyle();
    }
  }

  doc.text('PH. :', marginX + 70, curY + 14);
  if (docket.consignee_phone) {
    setDataStyle(8);
    doc.text(docket.consignee_phone, marginX + 77, curY + 14);
    setTemplateStyle();
  }

  doc.text('CST/LST No./TIN No. :', marginX + 2, curY + 14);
  if (docket.consignee_gstin) {
    setDataStyle(8);
    doc.text(docket.consignee_gstin, marginX + 32, curY + 14);
    setTemplateStyle();
  }

  doc.line(marginX, curY + 16, rightColX, curY + 16);

  // --- 3. MODE OF DESPATCH & OCTROI GRID ---
  curY += 16;
  setTemplateStyle();
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');

  doc.text('MODE OF DESPATCH', marginX + 2, curY + 3.5);
  doc.line(marginX + 32, curY, marginX + 32, curY + 10);

  doc.text('OCTROI WILL BE BORNED BY', marginX + 34, curY + 3.5);
  doc.line(marginX + 76, curY, marginX + 76, curY + 10);

  doc.text('MODVAT COPY', marginX + 78, curY + 3.5);
  doc.line(marginX + 100, curY, marginX + 100, curY + 10);

  doc.text('DOD', marginX + 103, curY + 3.5);
  doc.line(marginX + 112, curY, marginX + 112, curY + 10);

  doc.text('DACC', marginX + 115, curY + 3.5);

  doc.line(marginX, curY + 5, rightColX, curY + 5);

  doc.setFontSize(7.5);
  doc.text('CONSIGNOR [  ]', marginX + 2, curY + 8.5);
  doc.text('CONSIGNEE [  ]', marginX + 34, curY + 8.5);

  doc.line(marginX, curY + 10, rightColX, curY + 10);

  // --- 4. AT OWNER'S RISK & PAYMENT MODE BOX ---
  curY += 10;
  setTemplateStyle();
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text("AT OWNER'S RISK / CARRIER'S RISK", marginX + 12, curY + 3.5);

  doc.line(marginX + 70, curY, marginX + 70, curY + 38);
  doc.text('MODE OF PAYMENT', marginX + 74, curY + 4);

  doc.line(marginX, curY + 8, rightColX, curY + 8);

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('Policy No. ............................. Date ....................', marginX + 2, curY + 13);
  doc.text('Insurance Company .................................................', marginX + 2, curY + 18);
  doc.text('Insurance Value .....................................................', marginX + 2, curY + 23);

  // Payment Mode Checkboxes
  setTemplateStyle();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);

  doc.text('CREDIT', marginX + 73, curY + 13);
  doc.rect(marginX + 92, curY + 10, 3.5, 3.5);
  if (docket.payment_mode === 'Credit') {
    setDataStyle(8.5);
    doc.text('X', marginX + 92.8, curY + 12.8);
    setTemplateStyle();
  }

  doc.text('PAID', marginX + 73, curY + 21);
  doc.rect(marginX + 92, curY + 18, 3.5, 3.5);
  if (docket.payment_mode === 'Paid') {
    setDataStyle(8.5);
    doc.text('X', marginX + 92.8, curY + 20.8);
    setTemplateStyle();
    if (docket.payment_method) {
      setDataStyle(6);
      doc.text(`(${docket.payment_method})`, marginX + 97, curY + 21);
      setTemplateStyle();
      doc.setFontSize(7.5);
    }
  }

  doc.text('TO PAY', marginX + 73, curY + 29);
  doc.rect(marginX + 92, curY + 26, 3.5, 3.5);
  if (docket.payment_mode === 'To Pay') {
    setDataStyle(8.5);
    doc.text('X', marginX + 92.8, curY + 28.8);
    setTemplateStyle();
  }

  doc.line(marginX, curY + 26, marginX + 70, curY + 26);

  doc.setFontSize(6);
  doc.text('(Received above shipment in order', marginX + 2, curY + 29.5);
  doc.text(' and in good condition)', marginX + 2, curY + 32.5);
  doc.text('Date :', marginX + 2, curY + 36);
  doc.text('Time :', marginX + 35, curY + 36);

  doc.line(marginX, curY + 38, rightColX, curY + 38);

  // --- 5. CONDITION OF CARRIAGE BOX ---
  curY += 38;
  setTemplateStyle();
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');
  doc.text('CONDITION OF CARRIAGE', marginX + 2, curY + 3.5);

  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.text('[X] This is a Non-Negotiable Docket', marginX + 2, curY + 7);
  doc.text('[X] Standard Conditions of Carriage are given on reverse', marginX + 2, curY + 10.5);
  doc.text('[X] Liability limited to Rs. 1,000/- only', marginX + 2, curY + 14);
  doc.text("[X] We Carry under the carrier's Act", marginX + 2, curY + 17.5);

  // ==========================================
  // RIGHT COLUMN: PACKAGES, WEIGHT, CHARGES GRID & SIGNATURES
  // ==========================================
  let tableY = headerBottomY;

  setTemplateStyle();
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');

  doc.text('No. of PKGS.', rightColX + 2, tableY + 3.5);
  doc.line(rightColX + 20, tableY, rightColX + 20, tableY + 14);

  doc.text('Method of Packing', rightColX + 21, tableY + 3.5);
  doc.line(rightColX + 45, tableY, rightColX + 45, tableY + 14);

  doc.text('Invoice No.', rightColX + 47, tableY + 3.5);
  doc.line(rightColX + 68, tableY, rightColX + 68, tableY + 14);

  doc.text('Invoice Value', rightColX + 70, tableY + 3.5);
  doc.line(rightColX + 92, tableY, rightColX + 92, tableY + 14);

  doc.text('Description - (Said to Content)', rightColX + 94, tableY + 3.5);

  doc.line(rightColX, tableY + 5, marginX + pageW, tableY + 5);

  // Values Row 1 (Royal Blue Ink)
  setDataStyle(10);
  doc.text(`(${docket.package_count || 1})`, rightColX + 5, tableY + 11);

  setDataStyle(8);
  doc.text(docket.packing_method || 'Box', rightColX + 23, tableY + 11);
  doc.text(docket.invoice_no || '-', rightColX + 49, tableY + 11);
  doc.text(docket.invoice_value ? `Rs. ${docket.invoice_value}` : '-', rightColX + 72, tableY + 11);
  doc.text(docket.goods_description || 'Apparels / General Goods', rightColX + 95, tableY + 11);

  setTemplateStyle();
  doc.line(rightColX, tableY + 14, marginX + pageW, tableY + 14);

  // Row 2: Actual Weight & Charged Weight
  tableY += 14;
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Actual Weight', rightColX + 2, tableY + 4);
  doc.line(rightColX + 22, tableY, rightColX + 22, tableY + 7);

  doc.text('Charged Weight', rightColX + 24, tableY + 4);
  doc.line(rightColX + 45, tableY, rightColX + 45, tableY + 7);

  // Weight Values (Royal Blue Ink)
  setDataStyle(9.5);
  doc.text(`${docket.actual_weight_kg || 0} kg`, rightColX + 3, tableY + 11);
  doc.text(`${docket.charged_weight_kg || 0} kg`, rightColX + 25, tableY + 11);

  setTemplateStyle();
  doc.line(rightColX, tableY + 7, rightColX + 45, tableY + 7);

  // Row 3: Dimensions
  doc.setFontSize(7);
  doc.text("Dimension 'L'+'B'+'H' (Inches)", rightColX + 2, tableY + 17);
  if (docket.dimensions_lhb) {
    setDataStyle(8);
    doc.text(docket.dimensions_lhb, rightColX + 2, tableY + 22);
    setTemplateStyle();
  }

  // Row 4: E-Way Bill No. (optional)
  if (docket.eway_bill_no) {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text('E-Way Bill No.', rightColX + 2, tableY + 32);
    setDataStyle(8);
    doc.text(docket.eway_bill_no, rightColX + 2, tableY + 37);
    setTemplateStyle();
  }

  // CHARGES TABLE GRID
  doc.line(rightColX + 45, tableY, rightColX + 45, tableY + 110);

  let chargeY = tableY;
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text('CHARGES', rightColX + 47, chargeY + 4);
  doc.text('FREIGHT', rightColX + 97, chargeY + 4);

  doc.setFontSize(6.5);
  doc.text('INSTRUCTIONS', rightColX + 138, chargeY + 4, { align: 'center' });

  doc.line(rightColX + 45, chargeY + 6, marginX + pageW, chargeY + 6);

  doc.line(rightColX + 95, chargeY + 6, rightColX + 95, chargeY + 80);
  doc.line(rightColX + 125, chargeY + 6, rightColX + 125, chargeY + 80);

  const chargesList = [
    { name: 'Freight', val: freight },
    { name: 'Risk Charge/F.O.V.', val: risk },
    { name: 'Handling Charges', val: handling },
    { name: 'Docket Charges', val: docketChg },
    { name: 'DOD, DACC Service Charges', val: 0 },
    { name: 'OSC', val: 0 },
    { name: 'Pick-up & Delivery Charges', val: pickup },
    { name: 'Other Charges', val: other },
    { name: 'Subtotal', val: subtotal },
    ...(isAir ? [{ name: 'Air Service Charge (35%)', val: serviceCharge }] : []),
    { name: `GST ${gstPercentage}%`, val: gstAmount },
  ];

  let rY = chargeY + 11;

  chargesList.forEach((c) => {
    setTemplateStyle();
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.text(c.name, rightColX + 47, rY);

    if (c.val && c.val > 0) {
      setDataStyle(8);
      const valFormatted = c.val.toFixed(2);
      doc.text(valFormatted, rightColX + 122, rY, { align: 'right' });
      setTemplateStyle();
    }

    doc.line(rightColX + 45, rY + 2, rightColX + 125, rY + 2);
    rY += 6.5;
  });

  // GRAND TOTAL ROW
  setTemplateStyle();
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Grand Total:', rightColX + 47, rY + 1);

  setDataStyle(9.5);
  const grandTotalFormatted = grandTotal.toFixed(2);
  doc.text(grandTotalFormatted, rightColX + 122, rY + 1, { align: 'right' });

  setTemplateStyle();
  doc.line(rightColX + 45, rY + 3, marginX + pageW, rY + 3);

  // Rs. (In words)
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Rs. (In words) :', rightColX + 47, rY + 8);

  setDataStyle(7.5);
  doc.text(numberToWords(grandTotal), rightColX + 70, rY + 8);

  setTemplateStyle();
  doc.line(rightColX, marginY + 150, marginX + pageW, marginY + 150);

  // --- GOOGLE PAY PAYMENT QR CODE & SIGNATURES AREA (3 Equal Columns) ---
  let sigY = marginY + 150;

  // 1. Google Pay QR Box on PDF (X = 135 to X = 180, width 45mm)
  // Left Column Text (X = 137 to X = 156, width 19mm)
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('PAYMENT QR', rightColX + 2, sigY + 4);
  doc.text('CODE', rightColX + 2, sigY + 7.5);

  doc.setFontSize(5.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`GPay: ${settings.gpayNo}`, rightColX + 2, sigY + 12);

  const displayUpi = settings.upiId.length > 16 ? settings.upiId.substring(0, 15) + '...' : settings.upiId;
  doc.text(`UPI: ${displayUpi}`, rightColX + 2, sigY + 16);

  doc.setFontSize(6);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Scan & Pay', rightColX + 2, sigY + 22);

  // Render Scannable GPay UPI QR Code Image (Size 20mm x 20mm at X = rightColX + 23 = 158mm to 178mm)
  try {
    let qrDataUrl = settings.qrCodeUrl;
    if (!qrDataUrl || !qrDataUrl.startsWith('data:image/')) {
      const upiUri = `upi://pay?pa=${settings.upiId || '9821541984@upi'}&pn=${encodeURIComponent(settings.tradeName)}&cu=INR`;
      qrDataUrl = await QRCode.toDataURL(upiUri, {
        margin: 0,
        width: 250,
        color: { dark: '#000000', light: '#ffffff' },
      });
    }
    doc.addImage(qrDataUrl, 'PNG', rightColX + 23, sigY + 3.5, 20, 20);
  } catch (e) {
    console.error('Failed to generate GPay QR Code image on PDF:', e);
  }

  // Vertical Divider 1 at X = 180
  setTemplateStyle();
  doc.line(rightColX + 45, sigY, rightColX + 45, marginY + 178);

  // 2. Booking Staff Signature Box (X = 180 to X = 230)
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text('SIGNATURE OF BOOKING STAFF', rightColX + 46, sigY + 5);

  if (settings.staffSignatureUrl) {
    try {
      doc.addImage(settings.staffSignatureUrl, 'PNG', rightColX + 48, sigY + 7, 40, 15);
    } catch (e) {
      // Ignore invalid or missing signature image
    }
  }

  // Vertical Divider 2 at X = 230
  doc.line(rightColX + 95, sigY, rightColX + 95, marginY + 178);

  // 3. Received by RCS Box (X = 230 to X = 287)
  doc.text('Received by RCS', rightColX + 98, sigY + 5);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('Name : ............................................', rightColX + 98, sigY + 10);
  doc.text('Date : ................... Time : ................', rightColX + 98, sigY + 14);
  doc.text('Sign of Booking Staff', rightColX + 98, sigY + 22);

  doc.line(marginX, marginY + 178, marginX + pageW, marginY + 178);

  // ==========================================
  // FOOTER SECTION (Phone, Email, Address)
  // ==========================================
  let footY = marginY + 182;
  setTemplateStyle();
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`Phone : ${settings.phone1} and ${settings.phone2} | Email : ${settings.email}`, marginX + 3, footY);

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text(`(${settings.address})`, marginX + 3, footY + 4);
  doc.setFont('helvetica', 'bold');
  doc.text('INTERNATIONAL SELF NETWORK COURIER TO 200+ COUNTRIES', marginX + 3, footY + 8);

  // Reset text color
  doc.setTextColor(0, 0, 0);

  return doc;
}

export async function generateInvoicePDF(docket: CargoDocket) {
  const doc = await buildInvoicePDF(docket);
  doc.save(`${docket.docket_no}.pdf`);
}

export async function getInvoicePDFBlobUrl(docket: CargoDocket): Promise<string> {
  const doc = await buildInvoicePDF(docket);
  const blob = doc.output('blob');
  return URL.createObjectURL(blob);
}


/** The line items a consolidated bill's PDF renders — see /api/billing/[id]. */
export interface BillLineDocket {
  docket_no: string;
  booking_date: string;
  from_city: string;
  to_city: string;
  consignor_name: string;
  package_count: number;
  invoice_no?: string;
  charged_weight_kg: number;
  grand_total: number;
  transport_mode?: string;
  particulars?: string;
  other_charges?: string;
}

/** Renders a past consolidated GST tax invoice (Bill) as a downloadable PDF,
 *  laid out to match the company's printed "RCT" invoice template. */
export async function generateBillPDF(bill: Bill, dockets: BillLineDocket[]) {
  const settings = getCompanySettings();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const marginX = 10;
  const pageW = 190; // content width, x = 10..200
  const rightX = marginX + pageW;

  const slate = () => doc.setTextColor(71, 85, 105);
  const ink = () => doc.setTextColor(15, 23, 42);
  const dark = () => doc.setTextColor(15, 23, 42);
  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.3);

  // ==========================================
  // SUPPLIER BLOCK + LOGO
  // ==========================================
  let y = 10;
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  slate();
  doc.text('SUPPLIER:', marginX, y + 3);

  doc.setFontSize(13);
  dark();
  doc.text(settings.tradeName, marginX, y + 9);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  slate();
  doc.text(settings.gstin, marginX, y + 13.5);
  doc.text(`Address: ${settings.address}`, marginX, y + 18, { maxWidth: 150 });

  try {
    doc.addImage(RUDRA_LOGO_BASE64, 'PNG', rightX - 24, y, 24, 22);
  } catch (e) {
    console.error('Failed to render company logo on Tax Invoice PDF:', e);
  }

  y += 26;
  doc.setDrawColor(100, 116, 139);
  doc.line(marginX, y, rightX, y);

  // ==========================================
  // TAX INVOICE BAR + INVOICE META (right) / CUSTOMER (left)
  // ==========================================
  doc.setFillColor(226, 232, 240);
  doc.rect(marginX, y, pageW, 6, 'F');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  dark();
  doc.text('TAX INVOICE', marginX + pageW / 2, y + 4.2, { align: 'center' });
  y += 6;

  const custColX = marginX;
  const custColW = 118;
  const metaColX = marginX + custColW;
  const blockTop = y;

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  slate();
  doc.text('CUSTOMER:', custColX + 2, y + 4);
  doc.setFontSize(9);
  ink();
  doc.text(bill.customer_name, custColX + 26, y + 4);

  const custRows: Array<[string, string]> = [
    ['GSTIN', bill.customer_gstin || '-'],
    ['Address', bill.customer_address || '-'],
    ['Email ID', bill.customer_email || '-'],
    ['Contact No.', bill.customer_phone || '-'],
  ];
  let cy = y + 4;
  custRows.forEach(([label, value]) => {
    cy += 5;
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    slate();
    doc.text(label, custColX + 2, cy);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    ink();
    doc.text(doc.splitTextToSize(value, custColW - 32), custColX + 26, cy);
  });

  const metaRows: Array<[string, string]> = [
    ['Invoice No.', bill.bill_no],
    ['Invoice Date', bill.invoice_date],
    ['Category', bill.category],
    ['Document Type', bill.doc_type],
    ['Is Services', bill.is_services ? 'Yes' : 'No'],
  ];
  let my = y;
  metaRows.forEach(([label, value]) => {
    my += 5;
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    slate();
    doc.text(label, metaColX + 2, my);
    doc.setFont('helvetica', 'normal');
    ink();
    doc.text(value, metaColX + 30, my);
  });

  const blockBottom = Math.max(cy + 2, my + 2);
  doc.setDrawColor(100, 116, 139);
  doc.line(metaColX, blockTop, metaColX, blockBottom);
  doc.line(marginX, blockBottom, rightX, blockBottom);
  doc.rect(marginX, blockTop, pageW, blockBottom - blockTop);

  y = blockBottom + 4;

  // ==========================================
  // LINE ITEMS TABLE
  // ==========================================
  const rateFor = (amount: number, weight: number) => (weight > 0 ? (amount / weight).toFixed(0) : '-');

  autoTable(doc, {
    startY: y,
    head: [['Sr', 'Date', 'Particulars', 'Origin', 'Destination', 'Mode', 'L.R.No', 'Invoice No', 'Pcs', 'Other Charges', 'Gross Wt (KG)', 'Rate/KG', 'Total Amount']],
    body: dockets.map((d, idx) => [
      idx + 1,
      d.booking_date,
      d.particulars || 'RMG',
      (d.from_city || '-').toUpperCase(),
      (d.to_city || '-').toUpperCase(),
      (d.transport_mode || 'Road').toUpperCase(),
      d.docket_no,
      d.invoice_no || '-',
      d.package_count,
      d.other_charges || '-',
      Number(d.charged_weight_kg || 0),
      rateFor(Number(d.grand_total), Number(d.charged_weight_kg || 0)),
      Number(d.grand_total).toFixed(2),
    ]),
    theme: 'grid',
    styles: { fontSize: 6.8, cellPadding: 1.3, textColor: [71, 85, 105], lineColor: [100, 116, 139] },
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 6.8 },
    bodyStyles: { textColor: [29, 78, 216], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 7, halign: 'center', textColor: [71, 85, 105] },
      1: { cellWidth: 14, textColor: [71, 85, 105] },
      2: { cellWidth: 14, textColor: [71, 85, 105] },
      3: { cellWidth: 20 },
      4: { cellWidth: 20 },
      5: { cellWidth: 12, textColor: [71, 85, 105] },
      6: { cellWidth: 17 },
      7: { cellWidth: 18 },
      8: { cellWidth: 8, halign: 'center' },
      9: { cellWidth: 16, textColor: [71, 85, 105] },
      10: { cellWidth: 14, halign: 'right' },
      11: { cellWidth: 12, halign: 'right', textColor: [71, 85, 105] },
      12: { cellWidth: 18, halign: 'right' },
    },
  });

  // @ts-expect-error jspdf-autotable augments jsPDF with lastAutoTable at runtime
  const finalY = (doc.lastAutoTable?.finalY as number) || y + 20;

  // ==========================================
  // TERMS & CONDITIONS (left) / TOTALS (right)
  // ==========================================
  const totalsColW = 62;
  const totalsColX = rightX - totalsColW;
  const termsColW = pageW - totalsColW - 2;

  const totalsRows: Array<[string, string]> = [
    ['Discount', `Rs. ${Number(bill.discount).toFixed(2)}`],
    ['Sub Amount', `Rs. ${Number(bill.subtotal).toFixed(2)}`],
    [`GST Amount @${bill.gst_percentage ?? 18}%`, `Rs. ${Number(bill.gst_amount).toFixed(2)}`],
    ['Total Invoice Amt (With GST)', `Rs. ${(Number(bill.subtotal) + Number(bill.gst_amount)).toFixed(2)}`],
    ['Round Off', `Rs. ${Number(bill.round_off).toFixed(2)}`],
  ];

  const rowH = 5;
  const totalsTop = finalY + 3;
  doc.setDrawColor(100, 116, 139);
  doc.rect(totalsColX, totalsTop, totalsColW, rowH * totalsRows.length);
  totalsRows.forEach(([label, value], i) => {
    const rowY = totalsTop + i * rowH;
    if (i > 0) doc.line(totalsColX, rowY, totalsColX + totalsColW, rowY);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    slate();
    doc.text(label, totalsColX + 2, rowY + 3.5);
    doc.setFont('helvetica', 'normal');
    dark();
    doc.text(value, totalsColX + totalsColW - 2, rowY + 3.5, { align: 'right' });
  });

  const netY = totalsTop + rowH * totalsRows.length;
  doc.setFillColor(226, 232, 240);
  doc.rect(totalsColX, netY, totalsColW, 6.5, 'F');
  doc.rect(totalsColX, netY, totalsColW, 6.5);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  dark();
  doc.text('Net Invoice Amount', totalsColX + 2, netY + 4.3);
  ink();
  doc.text(`Rs. ${Number(bill.grand_total).toFixed(2)}`, totalsColX + totalsColW - 2, netY + 4.3, { align: 'right' });

  // Terms & Conditions box, height-matched to totals box
  const termsBoxBottom = netY + 6.5;
  doc.setDrawColor(100, 116, 139);
  doc.rect(marginX, totalsTop, termsColW, termsBoxBottom - totalsTop);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  slate();
  doc.text('Terms & Conditions:', marginX + 2, totalsTop + 4);
  doc.setFont('helvetica', 'normal');
  settings.terms.forEach((t, i) => {
    doc.text(`${i + 1}. ${t}`, marginX + 2, totalsTop + 8 + i * 4, { maxWidth: termsColW - 4 });
  });
  if (bill.reverse_charge || bill.notes) {
    const extraLines = [
      bill.reverse_charge ? 'Reverse Charge: Applicable' : '',
      bill.notes ? `Note: ${bill.notes}` : '',
    ].filter(Boolean);
    doc.text(extraLines.join(' | '), marginX + 2, totalsTop + 8 + settings.terms.length * 4, { maxWidth: termsColW - 4 });
  }

  y = termsBoxBottom + 5;

  // ==========================================
  // AMOUNT IN WORDS
  // ==========================================
  doc.setDrawColor(100, 116, 139);
  doc.rect(marginX, y, pageW, 8);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  slate();
  doc.text('Amount in words:', marginX + 2, y + 5);
  doc.setFont('helvetica', 'normal');
  dark();
  doc.text(numberToWords(Number(bill.grand_total)), marginX + 36, y + 5, { maxWidth: pageW - 40 });

  y += 12;

  // ==========================================
  // BANK DETAIL (left) / RECEIVER'S SEAL (mid) / FOR COMPANY (right)
  // ==========================================
  const footBoxH = 30;
  const col1W = 70;
  const col2W = 60;
  const col2X = marginX + col1W;
  const col3X = col2X + col2W;
  const col3W = pageW - col1W - col2W;

  doc.rect(marginX, y, pageW, footBoxH);
  doc.line(col2X, y, col2X, y + footBoxH);
  doc.line(col3X, y, col3X, y + footBoxH);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  slate();
  doc.text('BANK DETAIL:', marginX + 2, y + 4.5);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  const bankRows: Array<[string, string]> = [
    ['Name', settings.tradeName],
    ['Bank', settings.bankName],
    ['Branch', settings.branch],
    ['A/C No.', settings.accountNo],
    ['IFSC', settings.ifsc],
  ];
  bankRows.forEach(([label, value], i) => {
    const rowY = y + 9 + i * 4;
    slate();
    doc.setFont('helvetica', 'bold');
    doc.text(label, marginX + 2, rowY);
    dark();
    doc.setFont('helvetica', 'normal');
    doc.text(value, marginX + 20, rowY);
  });

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  slate();
  doc.text("RECEIVER'S SEAL & SIGNATURE", col2X + col2W / 2, y + 5, { align: 'center' });

  doc.text(`For ${settings.tradeName}`, col3X + col3W / 2, y + 5, { align: 'center' });

  try {
    const upiUri = `upi://pay?pa=${settings.upiId || '9821541984@upi'}&pn=${encodeURIComponent(settings.tradeName)}&cu=INR`;
    const qrDataUrl = await QRCode.toDataURL(upiUri, {
      margin: 0,
      width: 250,
      color: { dark: '#000000', light: '#ffffff' },
    });
    doc.addImage(qrDataUrl, 'PNG', marginX + 2, y + footBoxH - 20, 18, 18);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    slate();
    doc.text(`GPay/UPI: ${settings.upiId}`, marginX + 22, y + footBoxH - 4);
  } catch (e) {
    console.error('Failed to generate GPay QR Code on Tax Invoice PDF:', e);
  }

  y += footBoxH;

  // ==========================================
  // FOOTER: PHONE / EMAIL
  // ==========================================
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  slate();
  doc.text(`Phone : ${settings.phone1} and ${settings.phone2}, Email:- ${settings.email}`, marginX, y + 6, { align: 'left' });

  doc.setTextColor(0, 0, 0);
  doc.save(`${bill.bill_no.replace(/\//g, '-')}.pdf`);
}

export interface QuotationRateItem {
  region?: string;
  destination: string;
  ratePerKg: number;
  mode: 'BY ROAD' | 'BY RAIL' | 'BY AIR';
  deliveryTime?: string;
}

export interface QuotationSheetPdfInput {
  name: string;
  sheet_type: 'ROAD_RAIL' | 'AIR';
  min_qty_kg: number;
  rates: QuotationRateItem[];
  notes: string[];
}

/** Renders a quotation rate sheet as a downloadable PDF, matching the
 *  "PAN India Self Service" printed rate card look. */
export function generateQuotationPDF(sheet: QuotationSheetPdfInput) {
  const settings = getCompanySettings();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const marginX = 10;
  const pageW = 190;
  const rightX = marginX + pageW;

  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(settings.tradeName, marginX, 16);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(71, 85, 105);
  doc.text('(PAN India Self Service)', marginX, 21);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text(settings.address, marginX, 25.5, { maxWidth: 130 });
  doc.text(`Ph: ${settings.phone1}, ${settings.phone2} | Email: ${settings.email}`, marginX, 30);

  try {
    doc.addImage(RUDRA_LOGO_BASE64, 'PNG', rightX - 24, 8, 24, 22);
  } catch (e) {
    console.error('Failed to render logo on quotation PDF:', e);
  }
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`GSTIN: ${settings.gstin}`, rightX, 33, { align: 'right' });

  let y = 38;
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.4);
  doc.line(marginX, y, rightX, y);
  y += 6;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(sheet.name.toUpperCase(), marginX + pageW / 2, y, { align: 'center' });
  y += 6;

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`Minimum Order Quantity - ${sheet.min_qty_kg} Kgs`, marginX + pageW / 2, y, { align: 'center' });
  y += 4;

  if (sheet.sheet_type === 'ROAD_RAIL') {
    autoTable(doc, {
      startY: y,
      head: [['Destination', 'Rate / Kg', 'Mode', 'Delivery Time']],
      body: sheet.rates.map((r) => [r.destination, `${r.ratePerKg}/-`, r.mode, r.deliveryTime || '-']),
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2, textColor: [15, 23, 42], lineColor: [15, 23, 42], halign: 'center' },
      headStyles: { fillColor: [226, 232, 240], textColor: [15, 23, 42], fontStyle: 'bold' },
    });
  } else {
    autoTable(doc, {
      startY: y,
      head: [['Region', 'City Name', 'Rate / Kg']],
      body: sheet.rates.map((r) => [r.region || 'General', r.destination, `${r.ratePerKg}/-`]),
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2, textColor: [15, 23, 42], lineColor: [15, 23, 42], halign: 'center' },
      headStyles: { fillColor: [226, 232, 240], textColor: [15, 23, 42], fontStyle: 'bold' },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 0) {
          const rowRegion = (sheet.rates[data.row.index]?.region || 'General').trim().toLowerCase();
          const prevRegion =
            data.row.index > 0 ? (sheet.rates[data.row.index - 1]?.region || 'General').trim().toLowerCase() : null;
          if (rowRegion === prevRegion) data.cell.text = [];
        }
      },
    });
  }

  // @ts-expect-error jspdf-autotable augments jsPDF with lastAutoTable at runtime
  let finalY = (doc.lastAutoTable?.finalY as number) || y + 20;
  finalY += 6;

  if (sheet.notes.length > 0) {
    doc.setDrawColor(15, 23, 42);
    const noteLines = sheet.notes.map((n, i) => `${i + 1}. ${n}`);
    const wrapped = noteLines.flatMap((line) => doc.splitTextToSize(line, pageW - 6));
    const boxH = 6 + wrapped.length * 4;
    doc.rect(marginX, finalY, pageW, boxH);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text('Note:-', marginX + 2, finalY + 4.5);
    doc.setFont('helvetica', 'normal');
    wrapped.forEach((line, i) => {
      doc.text(line, marginX + 2, finalY + 9 + i * 4);
    });
  }

  doc.save(`${sheet.name.replace(/[^a-z0-9]+/gi, '-')}.pdf`);
}

/** Renders one expense ledger (period + its entries) as a downloadable PDF
 *  report, laid out like the docket/bill summary tables above. */
export function generateExpenseLedgerPDF(ledger: ExpenseLedger, entries: ExpenseEntry[]) {
  const settings = getCompanySettings();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const marginX = 14;

  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(settings.tradeName.toUpperCase(), marginX, 16);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text('EXPENSE LEDGER', marginX, 22);

  const periodLabel =
    ledger.period_start === ledger.period_end
      ? ledger.period_start
      : `${ledger.period_start} to ${ledger.period_end}`;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`Ledger No: ${ledger.ledger_no}`, marginX, 28);
  doc.text(`Period: ${periodLabel}`, marginX, 33);
  if (ledger.label) doc.text(`Label: ${ledger.label}`, marginX, 38);

  const totalAmount = entries.reduce((sum, e) => sum + Number(e.amount), 0);

  autoTable(doc, {
    startY: ledger.label ? 43 : 38,
    head: [['Date', 'Category', 'Vendor', 'Description', 'Ref No.', 'Payment Mode', 'Amount (Rs.)']],
    body: entries.map((e) => [
      e.date,
      e.category,
      e.vendor_name || '-',
      e.description || '-',
      e.ref_number || '-',
      e.payment_mode,
      Number(e.amount).toFixed(2),
    ]),
    foot: [['', '', '', '', '', 'Total', totalAmount.toFixed(2)]],
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2.5, textColor: [71, 85, 105] },
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
    footStyles: { fillColor: [226, 232, 240], textColor: [15, 23, 42], fontStyle: 'bold' },
    columnStyles: {
      6: { halign: 'right' },
    },
  });

  if (ledger.notes) {
    // @ts-expect-error jspdf-autotable augments jsPDF with lastAutoTable at runtime
    const finalY = (doc.lastAutoTable?.finalY as number) || 45;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(71, 85, 105);
    doc.text(`Notes: ${ledger.notes}`, marginX, finalY + 6, { maxWidth: 180 });
  }

  const sanitized = ledger.ledger_no.replace(/[^a-z0-9]+/gi, '_');
  doc.save(`expense_ledger_${sanitized}.pdf`);
}
