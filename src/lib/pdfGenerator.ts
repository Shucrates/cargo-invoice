import jsPDF from 'jspdf';
import { CargoDocket } from '@/types/cargo';
import { companyConfig } from '@/lib/companyConfig';

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

export function generateInvoicePDF(docket: CargoDocket) {
  // A4 Landscape Mode (297mm x 210mm) matching physical docket proportions
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const marginX = 10;
  const marginY = 8;
  const pageW = 277;
  const pageH = 194;

  // Colors:
  // Template (Form Grid & Labels): Neutral Slate Gray
  const setTemplateStyle = () => {
    doc.setTextColor(71, 85, 105); // #475569 Dark Slate
    doc.setDrawColor(148, 163, 184); // #94A3B8 Border Lines
  };

  // Filled Data (Dynamic Entry Ink): Distinct Royal Blue Ink
  const setDataStyle = (fontSize: number = 9) => {
    doc.setTextColor(28, 62, 78); // #1C3E4E Deep Royal Blue Ink
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
  setTemplateStyle();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);

  doc.text('International', 105, marginY + 4.5);
  doc.rect(123, marginY + 1.5, 3.5, 3.5);

  if (docket.is_international) {
    setDataStyle(8);
    doc.text('X', 123.8, marginY + 4.3);
    setTemplateStyle();
  }

  // Helper for mode checkboxes
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

  drawCheckbox(132, marginY + 1.5, 'Air', docket.transport_mode === 'Air');
  drawCheckbox(150, marginY + 1.5, 'Road', docket.transport_mode === 'Road');
  drawCheckbox(170, marginY + 1.5, 'Train', docket.transport_mode === 'Train');

  // Top Right No. Box
  setTemplateStyle();
  doc.setFontSize(9);
  doc.text('No.', 198, marginY + 4.5);

  // DOCKET NUMBER (Highlight Ink)
  setDataStyle(13);
  doc.text(docket.docket_no, 208, marginY + 5);

  // Horizontal Line below Top Bar
  setTemplateStyle();
  doc.line(marginX, marginY + 7, marginX + pageW, marginY + 7);

  // ==========================================
  // HEADER SECTION (Company Info & Non-Negotiable Docket Info)
  // ==========================================
  setTemplateStyle();
  doc.line(130, marginY + 7, 130, marginY + 28);
  doc.line(196, marginY + 7, 196, marginY + 28);

  // Left Company Title & Details
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(companyConfig.name, marginX + 3, marginY + 12);

  doc.setFontSize(7.5);
  doc.text(`GST TIN : ${companyConfig.gstin}`, marginX + 3, marginY + 16);
  doc.setFont('helvetica', 'normal');
  doc.text(companyConfig.address, marginX + 3, marginY + 20);
  doc.text(`Ph: ${companyConfig.phone} | Email: ${companyConfig.email}`, marginX + 3, marginY + 24);

  // Middle FROM / TO Box
  setTemplateStyle();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('F', 132, marginY + 11);
  doc.text('R', 132, marginY + 14);
  doc.text('O', 132, marginY + 17);
  doc.text('M', 132, marginY + 20);

  // FROM CITY (Highlight Ink)
  setDataStyle(11);
  doc.text(docket.from_city || 'Jaipur', 140, marginY + 15);

  setTemplateStyle();
  doc.line(130, marginY + 21, 196, marginY + 21);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text('T', 132, marginY + 25);
  doc.text('O', 132, marginY + 27);

  // TO CITY (Highlight Ink)
  setDataStyle(11);
  doc.text(docket.to_city || 'Mumbai', 140, marginY + 26);

  // Right Header Docket Type, Date & Tracking Info
  setTemplateStyle();
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text('NON-NEGOTIABLE DOCKET', 198, marginY + 10);

  doc.line(196, marginY + 12, marginX + pageW, marginY + 12);

  doc.setFontSize(6.5);
  doc.text('DATE', 198, marginY + 15.5);

  // BOOKING DATE (Highlight Ink)
  setDataStyle(8);
  doc.text(docket.booking_date, 208, marginY + 15.5);

  setTemplateStyle();
  doc.line(196, marginY + 18, marginX + pageW, marginY + 18);

  doc.setFontSize(6.5);
  doc.text('WAYBILL NO', 198, marginY + 22);

  // COURIER & TRACKING NO (Highlight Ink)
  setDataStyle(7.5);
  doc.text(`${docket.courier_partner || 'Self'}: ${docket.tracking_no || docket.docket_no}`, 198, marginY + 26);

  // Horizontal line below header
  setTemplateStyle();
  doc.line(marginX, marginY + 28, marginX + pageW, marginY + 28);

  // ==========================================
  // LEFT COLUMN: CONSIGNOR, CONSIGNEE, INSURANCE, PAYMENT
  // ==========================================
  const leftColW = 125;
  const rightColX = marginX + leftColW; // 135

  doc.line(rightColX, marginY + 28, rightColX, marginY + 178);

  // --- 1. CONSIGNOR BOX ---
  let curY = marginY + 28;
  setTemplateStyle();
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('CONSIGNOR', marginX + 2, curY + 4);

  // CONSIGNOR NAME (Highlight Ink)
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

  // PIN boxes (6 boxes)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('PIN :', marginX + 70, curY + 9);
  const pin1 = (docket.consignor_pin || '').padEnd(6, ' ');
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

  // CONSIGNEE NAME (Highlight Ink)
  setDataStyle(9.5);
  doc.text(docket.consignee_name || '', marginX + 24, curY + 4);

  setTemplateStyle();
  doc.setFontSize(7.5);
  if (docket.consignee_address) {
    setDataStyle(8);
    doc.text(docket.consignee_address, marginX + 2, curY + 9);
    setTemplateStyle();
  }

  // PIN boxes (6 boxes)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('PIN :', marginX + 70, curY + 9);
  const pin2 = (docket.consignee_pin || '').padEnd(6, ' ');
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

  // --- 4. AT OWNER'S RISK & INSURANCE ---
  curY += 10;
  setTemplateStyle();
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text("AT OWNER'S RISK / CARRIER'S RISK", marginX + 12, curY + 3.5);
  doc.setFontSize(6.5);
  doc.text('If Insurance Details of Insurance Policy', marginX + 12, curY + 6.5);

  doc.line(marginX + 70, curY, marginX + 70, curY + 38);
  doc.text('MODE OF PAYMENT', marginX + 80, curY + 4);

  doc.line(marginX, curY + 8, rightColX, curY + 8);

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('Policy No. ............................. Date ....................', marginX + 2, curY + 13);
  doc.text('Insurance Company .................................................', marginX + 2, curY + 18);
  doc.text('Insurance Value .....................................................', marginX + 2, curY + 23);

  // Payment Mode Checkboxes Right Box
  setTemplateStyle();
  doc.setFont('helvetica', 'bold');
  doc.text('CREDIT', marginX + 72, curY + 12);
  doc.rect(marginX + 87, curY + 9.5, 4, 4);
  if (docket.payment_mode === 'Credit') {
    setDataStyle(9);
    doc.text('X', marginX + 88, curY + 12.5);
    setTemplateStyle();
  }

  doc.text('PAID', marginX + 72, curY + 20);
  doc.rect(marginX + 87, curY + 17.5, 4, 4);
  if (docket.payment_mode === 'Paid') {
    setDataStyle(9);
    doc.text('X', marginX + 88, curY + 20.5);
    setTemplateStyle();
  }

  doc.text('TO PAY', marginX + 72, curY + 28);
  doc.rect(marginX + 87, curY + 25.5, 4, 4);
  if (docket.payment_mode === 'To Pay') {
    setDataStyle(9);
    doc.text('X', marginX + 88, curY + 28.5);
    setTemplateStyle();
  }

  doc.line(marginX, curY + 26, marginX + 70, curY + 26);
  doc.setFontSize(7);
  doc.text('(Received above shipment in order and in goods condition)', marginX + 2, curY + 30);
  doc.text('Date :', marginX + 2, curY + 35);
  doc.text('Time :', marginX + 35, curY + 35);

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
  let tableY = marginY + 28;

  // Header Row 1
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

  // Values Row 1 (Highlight Ink)
  setDataStyle(10);
  doc.text(`(${docket.package_count || 1})`, rightColX + 5, tableY + 11);

  setDataStyle(8);
  doc.text(docket.packing_method || 'Box', rightColX + 23, tableY + 11);
  doc.text(docket.invoice_no || '-', rightColX + 49, tableY + 11);
  doc.text(docket.invoice_value ? `₹${docket.invoice_value}` : '-', rightColX + 72, tableY + 11);
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

  // Weight Values (Highlight Ink)
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

  // CHARGES TABLE GRID
  doc.line(rightColX + 45, tableY, rightColX + 45, tableY + 110);

  let chargeY = tableY;
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text('CHARGES', rightColX + 47, chargeY + 4);
  doc.text('Rs.', rightColX + 80, chargeY + 4);
  doc.text('FREIGHT', rightColX + 94, chargeY + 4);
  doc.text('P.', rightColX + 115, chargeY + 4);
  doc.text('SPECIAL INSTRUCTIONS', rightColX + 120, chargeY + 4);

  doc.line(rightColX + 45, chargeY + 6, marginX + pageW, chargeY + 6);

  // Vertical Divider lines for Charges columns
  doc.line(rightColX + 92, chargeY + 6, rightColX + 92, chargeY + 80);
  doc.line(rightColX + 114, chargeY + 6, rightColX + 114, chargeY + 80);
  doc.line(rightColX + 119, chargeY + 6, rightColX + 119, chargeY + 80);

  const chargesList = [
    { name: 'Freight', val: docket.freight_amount },
    { name: 'Risk Charge/F.O.V.', val: docket.risk_charge },
    { name: 'Handling Charges', val: docket.handling_charge },
    { name: 'Docket Charges', val: docket.docket_charge },
    { name: 'DOD, DACC Service Charges', val: 0 },
    { name: 'OSC', val: 0 },
    { name: 'Pick-up & Delivery Charges', val: docket.pickup_delivery_charge },
    { name: 'Other Charges', val: docket.other_charge },
    { name: 'Total', val: docket.subtotal },
    { name: `GST ${docket.gst_percentage || 18}%`, val: docket.gst_amount },
  ];

  let rY = chargeY + 11;

  chargesList.forEach((c) => {
    setTemplateStyle();
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.text(c.name, rightColX + 47, rY);

    if (c.val && c.val > 0) {
      // Dynamic Amounts (Highlight Ink)
      setDataStyle(8);
      doc.text(c.val.toFixed(2), rightColX + 94, rY);
      setTemplateStyle();
    }

    doc.line(rightColX + 45, rY + 2, rightColX + 119, rY + 2);
    rY += 6.5;
  });

  // GRAND TOTAL ROW
  setTemplateStyle();
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Grand Total', rightColX + 47, rY + 1);

  // GRAND TOTAL AMOUNT (Highlight Ink)
  setDataStyle(12);
  doc.text(`₹ ${(docket.grand_total || 0).toFixed(2)} /-`, rightColX + 92, rY + 1);

  setTemplateStyle();
  doc.line(rightColX + 45, rY + 3, marginX + pageW, rY + 3);

  // Rs. (In words)
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Rs. (In words) :', rightColX + 47, rY + 8);

  // AMOUNT IN WORDS (Highlight Ink)
  setDataStyle(8);
  doc.text(numberToWords(docket.grand_total || 0), rightColX + 70, rY + 8);

  setTemplateStyle();
  doc.line(rightColX, marginY + 150, marginX + pageW, marginY + 150);

  // --- SIGNATURES & STAMP AREA ---
  let sigY = marginY + 150;
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');

  doc.text("CONSIGNOR'S SIGNATURE", rightColX + 5, sigY + 5);
  doc.line(rightColX + 55, sigY, rightColX + 55, marginY + 178);

  doc.text('Received by RCS', rightColX + 60, sigY + 5);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('Name : ............................................', rightColX + 60, sigY + 10);
  doc.text('Date : ................... Time : ................', rightColX + 60, sigY + 14);
  doc.text('B. A. Code : .....................................', rightColX + 60, sigY + 18);
  doc.text('Sign of Booking Staff', rightColX + 60, sigY + 23);

  doc.line(marginX, marginY + 178, marginX + pageW, marginY + 178);

  // ==========================================
  // FOOTER SECTION (Phone, Email, Jurisdiction & Carrier Brand Logos)
  // ==========================================
  let footY = marginY + 182;
  setTemplateStyle();
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`Phone : ${companyConfig.phone} | Email : ${companyConfig.email}`, marginX + 3, footY);

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text(`(${companyConfig.jurisdiction})`, marginX + 3, footY + 4);
  doc.setFont('helvetica', 'bold');
  doc.text('INTERNATIONAL SELF NETWORK COURIER TO 200+ COUNTRIES', marginX + 3, footY + 8);

  // Carrier Partner Logos text block on Bottom Right
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 58, 138); // Navy blue brand color
  doc.text('FedEx', marginX + 170, footY + 4);

  doc.setTextColor(180, 83, 9); // Amber DHL brand color
  doc.text('DHL', marginX + 190, footY + 4);

  doc.setTextColor(55, 65, 81); // Slate UPS brand color
  doc.text('UPS', marginX + 205, footY + 4);

  doc.setTextColor(220, 38, 38); // Red Aramex brand color
  doc.text('aramex', marginX + 220, footY + 4);

  doc.setTextColor(29, 78, 216); // Blue Dart brand color
  doc.text('BLUE DART', marginX + 242, footY + 4);

  // Reset text color
  doc.setTextColor(0, 0, 0);

  // Save Docket PDF
  doc.save(`${docket.docket_no}.pdf`);
}
