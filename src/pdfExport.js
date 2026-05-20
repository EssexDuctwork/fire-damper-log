// pdfExport.js — Fire Damper O&M PDF Generator
// Essex Ductwork — generates a full project PDF for O&M handover
// Requires: npm install jspdf

import jsPDF from "jspdf";

const AMBER  = [186, 117,  23];
const GREEN  = [ 59, 109,  17];
const DARK   = [ 30,  30,  30];
const GRAY   = [120, 120, 120];
const LIGHT  = [245, 245, 245];
const WHITE  = [255, 255, 255];

const PHOTO_ORDER  = ["wall_front","wall_back","damper_front","damper_back","damper_open","damper_closed"];
const PHOTO_LABELS = {
  wall_front:    "Wall Penetration — Front",
  wall_back:     "Wall Penetration — Back",
  damper_front:  "Damper Installed — Front",
  damper_back:   "Damper Installed — Back",
  damper_open:   "Damper Open Position",
  damper_closed: "Damper Closed Position",
};

// Fetch a remote image URL and return a base64 data URL
async function toBase64(url) {
  try {
    const r = await fetch(url);
    const b = await r.blob();
    return await new Promise(res => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result);
      reader.readAsDataURL(b);
    });
  } catch { return null; }
}

// Draw the amber footer on current page
function drawFooter(doc, pageNum, total, pageH, margin, pageW) {
  doc.setFillColor(...AMBER);
  doc.rect(0, pageH - 12, pageW, 12, "F");
  doc.setTextColor(...WHITE);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text("Essex Ductwork — Fire Damper Installation Record", margin, pageH - 5);
  doc.text(`Page ${pageNum} of ${total}`, pageW - margin, pageH - 5, { align: "right" });
}

// Draw the amber header bar on current page
function drawHeader(doc, siteName, reportRef, pageH) {
  const pageW = 210; const margin = 15;
  doc.setFillColor(...AMBER);
  doc.rect(0, 0, pageW, 18, "F");
  doc.setTextColor(...WHITE);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Essex Ductwork — Fire Damper Installation Record", margin, 8);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`${siteName}  |  ${reportRef}`, margin, 14);
}

// ── MAIN EXPORT FUNCTION ─────────────────────────────────────────────────
export async function generateProjectPDF(siteName, allLogs) {
  const logs = allLogs.filter(l => l.site_name === siteName);
  if (!logs.length) { alert("No logs found for this site."); return; }

  const doc     = new jsPDF("p", "mm", "a4");
  const pageW   = 210;
  const pageH   = 297;
  const margin  = 15;
  const cW      = pageW - margin * 2; // content width = 180mm
  const totalPages = logs.length + 2; // cover + one per damper + summary

  const first    = logs[0] || {};
  const complete = logs.filter(l => (l.photo_count ?? l.photoCount ?? 0) === 6).length;

  // ── PAGE 1: COVER ────────────────────────────────────────────────────
  // Header
  doc.setFillColor(...AMBER);
  doc.rect(0, 0, pageW, 52, "F");

  doc.setTextColor(...WHITE);
  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.text("Essex Ductwork", margin, 22);

  doc.setFontSize(13);
  doc.setFont("helvetica", "normal");
  doc.text("Fire Damper Installation Record", margin, 33);

  doc.setFontSize(10);
  doc.text("O&M Handover Document", margin, 43);

  // FD badge
  doc.setFillColor(...WHITE);
  doc.circle(pageW - 30, 26, 14, "F");
  doc.setTextColor(...AMBER);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("FD", pageW - 37, 30);

  let y = 64;

  // Project details card
  doc.setFillColor(...LIGHT);
  doc.roundedRect(margin, y, cW, 68, 3, 3, "F");

  const projectDetails = [
    ["Project / Site",     siteName],
    ["Client",             first.client_name || "—"],
    ["Drawing Reference",  first.drawing_number ? `${first.drawing_number} Rev ${first.drawing_revision || ""}` : "—"],
    ["Site Address",       `${first.site_address || ""} ${first.site_postcode || ""}`.trim() || "—"],
    ["Date Exported",      new Date().toLocaleDateString("en-GB", { day:"2-digit", month:"long", year:"numeric" })],
    ["Prepared by",        "Essex Ductwork"],
  ];

  projectDetails.forEach(([label, value], i) => {
    const col = i % 2 === 0 ? margin + 5 : margin + cW / 2 + 5;
    const row = y + 6 + Math.floor(i / 2) * 20;
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...GRAY);
    doc.text(label.toUpperCase(), col, row);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...DARK);
    doc.text(String(value || "—"), col, row + 7, { maxWidth: cW / 2 - 10 });
  });

  y += 78;

  // Stats row
  const stats = [
    { label: "Total Dampers",  value: logs.length,           color: DARK },
    { label: "Complete",        value: complete,              color: GREEN },
    { label: "Incomplete",      value: logs.length - complete, color: [185, 84, 11] },
  ];
  const sW = cW / stats.length;
  stats.forEach((s, i) => {
    const sx = margin + i * sW;
    doc.setFillColor(...WHITE);
    doc.setDrawColor(...AMBER);
    doc.setLineWidth(0.5);
    doc.roundedRect(sx, y, sW - 4, 26, 3, 3, "FD");
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...s.color);
    doc.text(String(s.value), sx + (sW - 4) / 2, y + 15, { align: "center" });
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GRAY);
    doc.text(s.label.toUpperCase(), sx + (sW - 4) / 2, y + 22, { align: "center" });
  });

  y += 36;

  // Compliance note
  doc.setFillColor(240, 248, 235);
  doc.setDrawColor(...GREEN);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, cW, 18, 3, 3, "FD");
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...GREEN);
  doc.text("Compliance Note", margin + 5, y + 7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(50, 90, 20);
  doc.text(
    "This document provides photographic evidence of fire damper installation in accordance with BS 9999 and current building regulations.",
    margin + 5, y + 13, { maxWidth: cW - 10 }
  );

  y += 28;

  // Contents list
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK);
  doc.text("Contents", margin, y);
  y += 6;
  doc.setDrawColor(...AMBER);
  doc.setLineWidth(0.4);
  doc.line(margin, y, margin + cW, y);
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  logs.forEach((log, i) => {
    if (y > pageH - 28) { doc.addPage(); y = margin + 10; }
    const pc = log.photo_count ?? log.photoCount ?? 0;
    doc.setTextColor(...DARK);
    doc.text(`${i + 2}.  ${log.asset_number || "No asset no."} — ${log.location_description || log.site_name || ""}`, margin, y);
    doc.setTextColor(...(pc === 6 ? GREEN : [185, 84, 11]));
    doc.text(`${pc}/6 photos`, pageW - margin, y, { align: "right" });
    doc.setTextColor(...DARK);
    y += 7;
  });

  drawFooter(doc, 1, totalPages, pageH, margin, pageW);

  // ── PAGES 2…N: ONE PAGE PER DAMPER ──────────────────────────────────
  for (let i = 0; i < logs.length; i++) {
    doc.addPage();
    const log = logs[i];
    const pc  = log.photo_count ?? log.photoCount ?? 0;
    const ok  = pc === 6;

    drawHeader(doc, siteName, log.report_number || "—", pageH);

    // Status badge
    doc.setFillColor(...(ok ? GREEN : [185, 84, 11]));
    doc.roundedRect(pageW - margin - 28, 4, 28, 10, 2, 2, "F");
    doc.setTextColor(...WHITE);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.text(ok ? "COMPLETE" : "INCOMPLETE", pageW - margin - 14, 10, { align: "center" });

    y = 26;

    // Asset title
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DARK);
    doc.text(log.asset_number || "No asset number", margin, y);
    doc.setFontSize(9.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GRAY);
    doc.text(log.location_description || "—", margin, y + 7);
    y += 18;

    // Details grid (5 rows × 2 columns)
    const details = [
      ["Manufacturer",    log.manufacturer === "Other" ? (log.manufacturer_other || "—") : (log.manufacturer || "—")],
      ["Damper Type",     log.damper_type   || "—"],
      ["Size (W × H mm)", `${log.damper_size_w || "—"} × ${log.damper_size_h || "—"}`],
      ["Plate Type",      log.plate_type    || "—"],
      ["Drawing No.",     `${log.drawing_number || "—"} Rev ${log.drawing_revision || ""}`],
      ["Report No.",      log.report_number || "—"],
      ["Installed By",    log.fitter_name   || "—"],
      ["Supervisor",      log.supervisor_name || "—"],
      ["Date Completed",  log.date_completed || "—"],
      ["Client",          log.client_name   || "—"],
    ];

    const rowH    = 9;
    const gridH   = Math.ceil(details.length / 2) * rowH + 5;
    doc.setFillColor(...LIGHT);
    doc.roundedRect(margin, y, cW, gridH, 2, 2, "F");

    details.forEach(([label, val], idx) => {
      const col = idx % 2 === 0 ? margin + 4 : margin + cW / 2 + 4;
      const row = y + 4 + Math.floor(idx / 2) * rowH;
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...GRAY);
      doc.text(label.toUpperCase(), col, row);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...DARK);
      doc.text(String(val), col, row + 5.5, { maxWidth: cW / 2 - 8 });
    });

    y += gridH + 5;

    // Notes (optional)
    if (log.notes) {
      doc.setFillColor(254, 249, 240);
      doc.setDrawColor(...AMBER);
      doc.setLineWidth(0.3);
      doc.roundedRect(margin, y, cW, 16, 2, 2, "FD");
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...AMBER);
      doc.text("NOTES / DEVIATIONS", margin + 4, y + 5);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...DARK);
      doc.text(String(log.notes), margin + 4, y + 11, { maxWidth: cW - 8 });
      y += 21;
    }

    // Photos heading
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DARK);
    doc.text("Installation Photographs", margin, y + 7);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...(ok ? GREEN : [185, 84, 11]));
    doc.text(`${pc}/6 captured`, margin + 58, y + 7);
    y += 13;

    // Photo grid — 3 columns × 2 rows
    const photos  = log.photo_urls || {};
    const pW      = (cW - 8) / 3;
    const pH      = pW * 0.68;

    for (let p = 0; p < 6; p++) {
      const col   = p % 3;
      const row   = Math.floor(p / 3);
      const px    = margin + col * (pW + 4);
      const py    = y + row * (pH + 12);
      const sid   = PHOTO_ORDER[p];
      const lbl   = PHOTO_LABELS[sid];
      const purl  = photos[sid];

      // Label
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...GRAY);
      doc.text(lbl.toUpperCase(), px, py - 1, { maxWidth: pW });

      if (purl) {
        try {
          let src = purl;
          if (purl.startsWith("http")) src = await toBase64(purl);
          if (src) {
            doc.addImage(src, "JPEG", px, py + 1, pW, pH);
          } else { throw new Error("no src"); }
        } catch {
          doc.setFillColor(235, 235, 235);
          doc.rect(px, py + 1, pW, pH, "F");
          doc.setFontSize(7.5);
          doc.setTextColor(160, 160, 160);
          doc.text("Photo unavailable", px + pW / 2, py + pH / 2 + 1, { align: "center" });
        }
      } else {
        doc.setFillColor(245, 245, 245);
        doc.setDrawColor(210, 210, 210);
        doc.setLineWidth(0.2);
        doc.rect(px, py + 1, pW, pH, "FD");
        doc.setFontSize(7.5);
        doc.setTextColor(180, 180, 180);
        doc.text("No photo captured", px + pW / 2, py + pH / 2 + 1, { align: "center" });
      }
    }

    drawFooter(doc, i + 2, totalPages, pageH, margin, pageW);
  }

  // ── LAST PAGE: SUMMARY TABLE ─────────────────────────────────────────
  doc.addPage();
  drawHeader(doc, siteName, "Summary", pageH);

  y = 26;
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK);
  doc.text("Installation Summary", margin, y);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRAY);
  doc.text(`${logs.length} damper${logs.length !== 1 ? "s" : ""} — ${complete} complete, ${logs.length - complete} incomplete`, margin, y + 7);
  y += 16;

  // Column definitions
  const cols = [
    { key: "asset_number",         label: "ASSET NO.",  x: margin,       w: 28 },
    { key: "location_description", label: "LOCATION",   x: margin + 28,  w: 42 },
    { key: "damper_type",          label: "TYPE",        x: margin + 70,  w: 32 },
    { key: "fitter_name",          label: "FITTER",      x: margin + 102, w: 28 },
    { key: "date_completed",       label: "DATE",        x: margin + 130, w: 24 },
    { key: "_photos",              label: "PHOTOS",      x: margin + 154, w: 14 },
    { key: "_status",              label: "STATUS",      x: margin + 168, w: 22 },
  ];

  const drawTableHeader = (yPos) => {
    doc.setFillColor(...AMBER);
    doc.rect(margin, yPos, cW, 8, "F");
    doc.setTextColor(...WHITE);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    cols.forEach(c => doc.text(c.label, c.x + 2, yPos + 5.5));
    return yPos + 8;
  };

  y = drawTableHeader(y);

  logs.forEach((log, i) => {
    if (y > pageH - 25) {
      drawFooter(doc, totalPages, totalPages, pageH, margin, pageW);
      doc.addPage();
      drawHeader(doc, siteName, "Summary (continued)", pageH);
      y = drawTableHeader(26);
    }

    const pc  = log.photo_count ?? log.photoCount ?? 0;
    const ok  = pc === 6;
    const rH  = 7.5;

    doc.setFillColor(i % 2 === 0 ? 250 : 255, i % 2 === 0 ? 250 : 255, i % 2 === 0 ? 250 : 255);
    doc.rect(margin, y, cW, rH, "F");

    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DARK);

    const clip = (str, max) => String(str || "—").substring(0, max);

    doc.text(clip(log.asset_number,       14), cols[0].x + 2, y + 5);
    doc.text(clip(log.location_description,21), cols[1].x + 2, y + 5);
    doc.text(clip(log.damper_type,        16), cols[2].x + 2, y + 5);
    doc.text(clip(log.fitter_name,        13), cols[3].x + 2, y + 5);
    doc.text(clip(log.date_completed,     10), cols[4].x + 2, y + 5);

    // Photos count
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...(ok ? GREEN : [185, 84, 11]));
    doc.text(`${pc}/6`, cols[5].x + cols[5].w / 2, y + 5, { align: "center" });

    // Status pill
    doc.setFillColor(...(ok ? GREEN : [185, 84, 11]));
    doc.roundedRect(cols[6].x + 2, y + 1.5, 18, 4.5, 1, 1, "F");
    doc.setFontSize(6);
    doc.setTextColor(...WHITE);
    doc.text(ok ? "COMPLETE" : "INCOMPLETE", cols[6].x + 11, y + 5, { align: "center" });

    // Row divider
    doc.setDrawColor(225, 225, 225);
    doc.setLineWidth(0.1);
    doc.line(margin, y + rH, margin + cW, y + rH);

    y += rH;
  });

  drawFooter(doc, totalPages, totalPages, pageH, margin, pageW);

  // ── SAVE ─────────────────────────────────────────────────────────────
  const fname = `Essex-Ductwork-FireDampers-${siteName.replace(/\s+/g,"-")}-${new Date().toISOString().slice(0,10)}.pdf`;
  doc.save(fname);
}
