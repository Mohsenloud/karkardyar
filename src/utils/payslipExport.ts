import { AccruedToTodaySummary, PaymentRecord, Worker } from '../types';
import {
  formatShamsiDayMonth,
  formatShamsiFull,
  formatShamsiShort,
  formatToman,
  toPersianDigits,
} from './jalali';

interface PayslipExportData {
  worker: Worker;
  accrued: AccruedToTodaySummary;
  payments: PaymentRecord[];
  todayIso: string;
}

/**
 * Wraps a JPEG data URL into a valid single-page A4 PDF-1.4 binary Blob.
 * Using native Canvas 2D + JPEG-in-PDF guarantees 100% accurate Persian RTL font shaping
 * and zero CSS/oklch parsing errors across all mobile and desktop browsers.
 */
function createPdfBlobFromJpegDataUrl(
  jpegDataUrl: string,
  pixelWidth: number,
  pixelHeight: number
): Blob {
  const base64 = jpegDataUrl.split(',')[1];
  const binaryStr = atob(base64);
  const jpegBytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    jpegBytes[i] = binaryStr.charCodeAt(i);
  }

  // Standard A4 dimensions in PDF points (72 dpi)
  const pageWidthPt = 595.28;
  const pageHeightPt = Math.round((pixelHeight / pixelWidth) * pageWidthPt * 100) / 100;

  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let currentOffset = 0;

  const pushStr = (str: string) => {
    const bytes = encoder.encode(str);
    chunks.push(bytes);
    currentOffset += bytes.length;
  };

  const pushBytes = (bytes: Uint8Array) => {
    chunks.push(bytes);
    currentOffset += bytes.length;
  };

  const startObj = (id: number) => {
    offsets[id] = currentOffset;
    pushStr(`${id} 0 obj\n`);
  };

  const endObj = () => {
    pushStr(`\nendobj\n`);
  };

  // PDF Header
  pushStr(`%PDF-1.4\n%\xFF\xFF\xFF\xFF\n`);

  // 1: Catalog
  startObj(1);
  pushStr(`<< /Type /Catalog /Pages 2 0 R >>`);
  endObj();

  // 2: Pages
  startObj(2);
  pushStr(`<< /Type /Pages /Kids [3 0 R] /Count 1 >>`);
  endObj();

  // 3: Page
  startObj(3);
  pushStr(
    `<< /Type /Page /Parent 2 0 R /Resources << /XObject << /Im1 4 0 R >> >> /MediaBox [0 0 ${pageWidthPt} ${pageHeightPt}] /Contents 5 0 R >>`
  );
  endObj();

  // 4: Image XObject (JPEG)
  startObj(4);
  pushStr(
    `<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`
  );
  pushBytes(jpegBytes);
  pushStr(`\nendstream`);
  endObj();

  // 5: Page Content Stream
  const contentStream = `q\n${pageWidthPt} 0 0 ${pageHeightPt} 0 0 cm\n/Im1 Do\nQ`;
  const contentBytes = encoder.encode(contentStream);
  startObj(5);
  pushStr(`<< /Length ${contentBytes.length} >>\nstream\n`);
  pushBytes(contentBytes);
  pushStr(`\nendstream`);
  endObj();

  // Xref table
  const xrefOffset = currentOffset;
  pushStr(`xref\n0 6\n0000000000 65535 f \n`);
  for (let i = 1; i <= 5; i++) {
    const padded = String(offsets[i]).padStart(10, '0');
    pushStr(`${padded} 00000 n \n`);
  }

  // Trailer
  pushStr(
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  );

  return new Blob(chunks, { type: 'application/pdf' });
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Generates and downloads a real, high-resolution Persian RTL PDF file for the worker's payslip.
 */
export async function downloadPayslipPdf(data: PayslipExportData): Promise<void> {
  const { worker, accrued, payments, todayIso } = data;

  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }

  const width = 1200;
  const paymentRowsCount = Math.max(1, payments.length);
  const dynamicHeight = Math.max(1620, 1180 + paymentRowsCount * 68);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = dynamicHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const fontFamily = "'Vazirmatn', system-ui, -apple-system, sans-serif";
  ctx.direction = 'rtl';

  // White Page Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, dynamicHeight);

  // Outer Decorative Border
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, 40, 40, width - 80, dynamicHeight - 80, 28);
  ctx.stroke();

  // Top Header Banner (Emerald / Teal Gradient)
  const headerGrad = ctx.createLinearGradient(width - 60, 60, 60, 230);
  headerGrad.addColorStop(0, '#059669');
  headerGrad.addColorStop(1, '#0f766e');
  ctx.fillStyle = headerGrad;
  drawRoundedRect(ctx, 68, 68, width - 136, 170, 22);
  ctx.fill();

  // Header Title (Right aligned)
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'right';
  ctx.font = `800 38px ${fontFamily}`;
  ctx.fillText(`صورت‌حساب کارکرد — ${worker.name}`, width - 105, 132);

  // Subtitle (Role & Base Wage)
  ctx.fillStyle = '#d1fae5';
  ctx.font = `600 23px ${fontFamily}`;
  const wageTypeText =
    worker.wage_type === 'daily'
      ? `روزمزد: ${formatToman(worker.base_wage)} تومان`
      : `ماهانه: ${formatToman(worker.base_wage)} تومان`;
  const projText = worker.project_name ? `پروژه: ${worker.project_name}   |   ` : '';
  ctx.fillText(`${projText}سمت: ${worker.role}   |   ${wageTypeText}`, width - 105, 178);

  // Issue Date (Left aligned in Header)
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ecfdf5';
  ctx.font = `600 21px ${fontFamily}`;
  ctx.fillText(`تاریخ گزارش: ${formatShamsiDayMonth(todayIso, true)}`, 105, 132);
  const rangeLabel = `بازه: ${formatShamsiDayMonth(accrued.startDate, true)} تا ${
    accrued.endDate ? formatShamsiDayMonth(accrued.endDate, true) : formatShamsiFull(todayIso)
  }`;
  ctx.fillText(rangeLabel, 105, 178);

  // Section 1: Attendance & Period Details Grid (6 Cards in 3x2 layout)
  let cursorY = 270;
  ctx.textAlign = 'right';
  ctx.fillStyle = '#0f172a';
  ctx.font = `800 25px ${fontFamily}`;
  ctx.fillText('خلاصه وضعیت حضور و کارکرد', width - 75, cursorY);

  cursorY += 22;
  const infoItems = [
    {
      label: 'تاریخ ورود (شروع کار)',
      value: formatShamsiDayMonth(accrued.startDate, true),
      color: '#0f172a',
      bg: '#f8fafc',
    },
    {
      label: 'تاریخ خروج / پایان دوره',
      value: accrued.endDate ? formatShamsiDayMonth(accrued.endDate, true) : 'مشغول به کار',
      color: '#0f172a',
      bg: '#f8fafc',
    },
    {
      label: 'کارکرد خالص محاسبه‌شده',
      value: `${toPersianDigits(accrued.effectiveDaysToToday)} روز`,
      color: '#047857',
      bg: '#ecfdf5',
    },
    {
      label: 'ساعت اضافه‌کاری ثبت‌شده',
      value: `${toPersianDigits(accrued.effectiveOvertimeHours)} ساعت`,
      color: '#0369a1',
      bg: '#f0f9ff',
    },
    {
      label: 'روزهای باقی‌مانده تا پایان',
      value:
        accrued.remainingDaysToWork !== null
          ? `${toPersianDigits(accrued.remainingDaysToWork)} روز`
          : '—',
      color: '#b45309',
      bg: '#fffbeb',
    },
    {
      label: 'مبنای محاسبه کارکرد',
      value: accrued.isDaysManuallyEdited ? 'ویرایش دستی' : 'تقویم تا امروز',
      color: '#334155',
      bg: '#f8fafc',
    },
  ];

  const colWidth = (width - 136 - 32) / 3;
  const cardHeight = 104;

  infoItems.forEach((item, idx) => {
    const row = Math.floor(idx / 3);
    const col = idx % 3; // 0 is rightmost
    const cardX = width - 68 - colWidth - col * (colWidth + 16);
    const cardY = cursorY + row * (cardHeight + 16);

    ctx.fillStyle = item.bg;
    drawRoundedRect(ctx, cardX, cardY, colWidth, cardHeight, 16);
    ctx.fill();

    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.5;
    drawRoundedRect(ctx, cardX, cardY, colWidth, cardHeight, 16);
    ctx.stroke();

    ctx.textAlign = 'right';
    ctx.fillStyle = '#64748b';
    ctx.font = `500 19px ${fontFamily}`;
    ctx.fillText(item.label, cardX + colWidth - 20, cardY + 38);

    ctx.fillStyle = item.color;
    ctx.font = `800 25px ${fontFamily}`;
    ctx.fillText(item.value, cardX + colWidth - 20, cardY + 78);
  });

  cursorY += 2 * (cardHeight + 16) + 34;

  // Section 2: Financial Summary Box
  ctx.textAlign = 'right';
  ctx.fillStyle = '#0f172a';
  ctx.font = `800 25px ${fontFamily}`;
  ctx.fillText('جزئیات مالی و تسویه‌حساب', width - 75, cursorY);

  cursorY += 22;
  const finBoxH = 215;
  ctx.fillStyle = '#f8fafc';
  drawRoundedRect(ctx, 68, cursorY, width - 136, finBoxH, 20);
  ctx.fill();
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, 68, cursorY, width - 136, finBoxH, 20);
  ctx.stroke();

  const finRows = [
    {
      label: 'دستمزد پایه کارکرد:',
      value: `${formatToman(accrued.baseEarnedToToday)} تومان`,
      color: '#1e293b',
    },
    {
      label: `مبلغ اضافه‌کاری (${toPersianDigits(accrued.effectiveOvertimeHours)} ساعت):`,
      value: `${formatToman(accrued.overtimeEarnedToToday + accrued.bonusToToday)} تومان`,
      color: '#0369a1',
    },
    {
      label: 'جمع کل کارکرد (ناخالص):',
      value: `${formatToman(accrued.grossEarnedToToday)} تومان`,
      color: '#0f172a',
    },
    {
      label: 'جمع مساعده و پرداختی‌ها:',
      value: `${formatToman(accrued.paidToToday)} تومان`,
      color: '#b45309',
    },
  ];

  const halfW = (width - 136 - 40) / 2;
  finRows.forEach((f, idx) => {
    const r = Math.floor(idx / 2);
    const c = idx % 2;
    const xRight = c === 0 ? width - 92 : width - 92 - halfW - 30;
    const xLeft = xRight - halfW + 20;
    const y = cursorY + 48 + r * 52;

    ctx.textAlign = 'right';
    ctx.fillStyle = '#475569';
    ctx.font = `600 21px ${fontFamily}`;
    ctx.fillText(f.label, xRight, y);

    ctx.textAlign = 'left';
    ctx.fillStyle = f.color;
    ctx.font = `800 23px ${fontFamily}`;
    ctx.fillText(f.value, xLeft, y);
  });

  // Net Payable Highlight Bar inside Financial Box
  const netBarY = cursorY + 132;
  ctx.fillStyle = '#ecfdf5';
  drawRoundedRect(ctx, 88, netBarY, width - 176, 64, 14);
  ctx.fill();
  ctx.strokeStyle = '#6ee7b7';
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, 88, netBarY, width - 176, 64, 14);
  ctx.stroke();

  ctx.textAlign = 'right';
  ctx.fillStyle = '#065f46';
  ctx.font = `800 24px ${fontFamily}`;
  ctx.fillText('مانده قابل پرداخت به کارگر:', width - 112, netBarY + 41);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#047857';
  ctx.font = `900 28px ${fontFamily}`;
  ctx.fillText(`${formatToman(accrued.netPayableToToday)} تومان`, 112, netBarY + 42);

  cursorY += finBoxH + 42;

  // Section 3: Payments Breakdown Table
  ctx.textAlign = 'right';
  ctx.fillStyle = '#0f172a';
  ctx.font = `800 25px ${fontFamily}`;
  ctx.fillText(
    `ریز مساعده‌ها و پرداختی‌ها (${toPersianDigits(payments.length)} مورد)`,
    width - 75,
    cursorY
  );

  cursorY += 22;

  // Table Header
  ctx.fillStyle = '#f1f5f9';
  drawRoundedRect(ctx, 68, cursorY, width - 136, 56, 12);
  ctx.fill();

  ctx.fillStyle = '#334155';
  ctx.font = `700 20px ${fontFamily}`;
  ctx.textAlign = 'right';
  ctx.fillText('ردیف', width - 92, cursorY + 36);
  ctx.fillText('تاریخ پرداخت', width - 190, cursorY + 36);
  ctx.fillText('نوع پرداخت', width - 420, cursorY + 36);
  ctx.fillText('توضیحات', width - 640, cursorY + 36);
  ctx.textAlign = 'left';
  ctx.fillText('مبلغ (تومان)', 96, cursorY + 36);

  cursorY += 62;

  if (payments.length === 0) {
    ctx.fillStyle = '#f8fafc';
    drawRoundedRect(ctx, 68, cursorY, width - 136, 64, 12);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#64748b';
    ctx.font = `500 20px ${fontFamily}`;
    ctx.fillText('هیچ مساعده یا پرداختی برای این کارگر ثبت نشده است.', width / 2, cursorY + 40);
    cursorY += 80;
  } else {
    payments.forEach((p, idx) => {
      const rowH = 58;
      ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
      drawRoundedRect(ctx, 68, cursorY, width - 136, rowH, 8);
      ctx.fill();

      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(68, cursorY + rowH);
      ctx.lineTo(width - 68, cursorY + rowH);
      ctx.stroke();

      const typeLabel =
        p.payment_type === 'advance'
          ? 'مساعده'
          : p.payment_type === 'salary'
          ? 'تسویه حقوق'
          : 'کسر / جریمه';

      ctx.textAlign = 'right';
      ctx.fillStyle = '#475569';
      ctx.font = `600 19px ${fontFamily}`;
      ctx.fillText(toPersianDigits(idx + 1), width - 98, cursorY + 36);
      ctx.fillText(formatShamsiShort(p.payment_date), width - 190, cursorY + 36);

      ctx.fillStyle =
        p.payment_type === 'advance'
          ? '#b45309'
          : p.payment_type === 'salary'
          ? '#047857'
          : '#be123c';
      ctx.font = `700 19px ${fontFamily}`;
      ctx.fillText(typeLabel, width - 420, cursorY + 36);

      ctx.fillStyle = '#64748b';
      ctx.font = `500 18px ${fontFamily}`;
      const noteText = (p.note || '—').slice(0, 32);
      ctx.fillText(noteText, width - 640, cursorY + 36);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#0f172a';
      ctx.font = `800 21px ${fontFamily}`;
      ctx.fillText(formatToman(p.amount), 96, cursorY + 36);

      cursorY += rowH + 4;
    });
  }

  // Footer Signatures
  const footerY = dynamicHeight - 140;
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(88, footerY);
  ctx.lineTo(width - 88, footerY);
  ctx.stroke();

  ctx.textAlign = 'right';
  ctx.fillStyle = '#64748b';
  ctx.font = `600 19px ${fontFamily}`;
  ctx.fillText('امضا و تایید کارفرما:', width - 120, footerY + 45);

  ctx.textAlign = 'left';
  ctx.fillText('امضا و اثر انگشت کارگر:', 320, footerY + 45);

  const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.95);
  const pdfBlob = createPdfBlobFromJpegDataUrl(jpegDataUrl, width, dynamicHeight);

  const safeName = worker.name.trim().replace(/\s+/g, '-');
  const url = URL.createObjectURL(pdfBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `صورتحساب-${safeName}-${todayIso}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

/**
 * Prints a clean, isolated RTL Persian payslip using an invisible print iframe
 * so that background page elements never clutter the printout on mobile or desktop.
 */
export function printPayslipDocument(data: PayslipExportData): void {
  const { worker, accrued, payments, todayIso } = data;

  const wageTypeText =
    worker.wage_type === 'daily'
      ? `روزمزد (${formatToman(worker.base_wage)} تومان)`
      : `ماهانه (${formatToman(worker.base_wage)} تومان)`;

  const paymentsRowsHtml =
    payments.length === 0
      ? `<tr><td colspan="4" style="text-align:center; padding: 14px; color:#64748b;">هیچ پرداختی ثبت نشده است.</td></tr>`
      : payments
          .map((p, i) => {
            const typeLabel =
              p.payment_type === 'advance'
                ? 'مساعده'
                : p.payment_type === 'salary'
                ? 'تسویه حقوق'
                : 'کسر / جریمه';
            return `
              <tr>
                <td>${toPersianDigits(i + 1)}</td>
                <td>${formatShamsiShort(p.payment_date)}</td>
                <td>${typeLabel}</td>
                <td style="font-weight:700;">${formatToman(p.amount)} تومان</td>
                <td>${p.note || '—'}</td>
              </tr>
            `;
          })
          .join('');

  const html = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>صورت‌حساب کارکرد — ${worker.name}</title>
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; font-family: 'Vazirmatn', Tahoma, sans-serif; }
    body { margin: 0; padding: 20px; background: #fff; color: #0f172a; direction: rtl; }
    .sheet { border: 2px solid #cbd5e1; border-radius: 16px; padding: 20px; max-width: 760px; margin: 0 auto; }
    .header { background: #0f766e; color: #fff; padding: 16px 20px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; }
    .header h1 { margin: 0 0 6px 0; font-size: 20px; font-weight: 800; }
    .header p { margin: 0; font-size: 12px; opacity: 0.9; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 18px; }
    .box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 12px; }
    .box .lbl { font-size: 11px; color: #64748b; display: block; margin-bottom: 4px; }
    .box .val { font-size: 14px; font-weight: 800; color: #0f172a; }
    .net-box { background: #ecfdf5; border: 2px solid #10b981; border-radius: 12px; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; }
    .net-box .lbl { font-size: 14px; font-weight: 800; color: #065f46; }
    .net-box .val { font-size: 18px; font-weight: 800; color: #047857; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: right; }
    th { background: #f1f5f9; font-weight: 700; color: #334155; }
    .sigs { display: flex; justify-content: space-around; margin-top: 36px; padding-top: 16px; border-top: 1px dashed #cbd5e1; font-size: 12px; color: #475569; }
    @media print {
      body { padding: 0; }
      .sheet { border: none; max-width: 100%; }
      .header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .net-box { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="header">
      <div>
        <h1>صورت‌حساب کارکرد — ${worker.name}</h1>
        <p>${worker.project_name ? `پروژه: ${worker.project_name} | ` : ''}سمت: ${worker.role} | ${wageTypeText}</p>
      </div>
      <div style="text-align:left; font-size:12px;">
        <div>تاریخ گزارش: ${formatShamsiDayMonth(todayIso, true)}</div>
        <div style="margin-top:4px;">بازه: ${formatShamsiDayMonth(accrued.startDate, true)} تا ${
    accrued.endDate ? formatShamsiDayMonth(accrued.endDate, true) : formatShamsiFull(todayIso)
  }</div>
      </div>
    </div>

    <div class="grid">
      <div class="box">
        <span class="lbl">تاریخ ورود</span>
        <span class="val">${formatShamsiDayMonth(accrued.startDate, true)}</span>
      </div>
      <div class="box">
        <span class="lbl">تاریخ خروج / پایان</span>
        <span class="val">${
          accrued.endDate ? formatShamsiDayMonth(accrued.endDate, true) : 'مشغول به کار'
        }</span>
      </div>
      <div class="box">
        <span class="lbl">کارکرد خالص</span>
        <span class="val" style="color:#047857;">${toPersianDigits(
          accrued.effectiveDaysToToday
        )} روز</span>
      </div>
      <div class="box">
        <span class="lbl">دستمزد پایه</span>
        <span class="val">${formatToman(accrued.baseEarnedToToday)} ت</span>
      </div>
      <div class="box">
        <span class="lbl">اضافه‌کاری (${toPersianDigits(accrued.effectiveOvertimeHours)} ساعت)</span>
        <span class="val">${formatToman(
          accrued.overtimeEarnedToToday + accrued.bonusToToday
        )} ت</span>
      </div>
      <div class="box">
        <span class="lbl">روزهای باقی‌مانده</span>
        <span class="val">${
          accrued.remainingDaysToWork !== null
            ? `${toPersianDigits(accrued.remainingDaysToWork)} روز`
            : '—'
        }</span>
      </div>
      <div class="box">
        <span class="lbl">جمع کل کارکرد</span>
        <span class="val">${formatToman(accrued.grossEarnedToToday)} ت</span>
      </div>
      <div class="box">
        <span class="lbl">جمع مساعده و دریافتی</span>
        <span class="val" style="color:#b45309;">${formatToman(accrued.paidToToday)} ت</span>
      </div>
      <div class="box">
        <span class="lbl">وضعیت محاسبه</span>
        <span class="val">${accrued.isDaysManuallyEdited ? 'ویرایش دستی' : 'محاسبه تا امروز'}</span>
      </div>
    </div>

    <div class="net-box">
      <span class="lbl">مانده قابل پرداخت به کارگر:</span>
      <span class="val">${formatToman(accrued.netPayableToToday)} تومان</span>
    </div>

    <h3 style="font-size:13px; margin: 14px 0 6px 0;">ریز مساعده‌ها و پرداختی‌ها (${toPersianDigits(
      payments.length
    )} مورد)</h3>
    <table>
      <thead>
        <tr>
          <th style="width:45px;">#</th>
          <th>تاریخ</th>
          <th>نوع</th>
          <th>مبلغ</th>
          <th>توضیحات</th>
        </tr>
      </thead>
      <tbody>
        ${paymentsRowsHtml}
      </tbody>
    </table>

    <div class="sigs">
      <div>امضا و تایید کارفرما</div>
      <div>امضا و اثر انگشت کارگر</div>
    </div>
  </div>
</body>
</html>`;

  const existingFrame = document.getElementById('payslip-print-frame') as HTMLIFrameElement | null;
  if (existingFrame) {
    existingFrame.remove();
  }

  const iframe = document.createElement('iframe');
  iframe.id = 'payslip-print-frame';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    window.print();
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      window.print();
    }
  }, 350);
}
