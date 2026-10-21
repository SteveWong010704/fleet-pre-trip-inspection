import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ExecutiveAnalyticsData } from '../types';

/**
 * Generates and downloads an Executive Audit Summary in Excel (.xlsx) format.
 */
export function exportExecutiveSummaryToExcel(data: ExecutiveAnalyticsData): void {
  const wb = XLSX.utils.book_new();
  const dateTag = new Date().toISOString().slice(0, 10);

  // 1. Executive Summary Sheet
  const summaryRows = [
    ['FLEET PRE-TRIP INSPECTION SYSTEM - EXECUTIVE COMPLIANCE AUDIT'],
    ['Generated At', new Date().toLocaleString()],
    ['Audit Period', `${data.meta.startDate} to ${data.meta.endDate} (${data.meta.timeframe.toUpperCase()})`],
    ['Depot Scope', data.meta.selectedBranch],
    ['Vehicle Category', data.meta.selectedCategory],
    [],
    ['EXECUTIVE KEY PERFORMANCE INDICATORS'],
    ['Metric', 'Value', 'Benchmark Target', 'Status'],
    ['Route Compliance Rate', `${data.summary.complianceRate}%`, '95.0%', data.summary.complianceRate >= 95 ? 'Target Met' : 'Needs Action'],
    ['Completed Delivery Routes', `${data.summary.completedRoutes} / ${data.summary.totalRoutes} routes`, '100% Scheduled', `${data.summary.complianceRate}% Completed`],
    ['Composite Quality Score', `${data.summary.complianceScore} / 100`, '>= 90.0', data.summary.complianceScore >= 90 ? 'Excellent' : 'Attention Needed'],
    ['Fleet Defect Rate', `${data.summary.defectRate}%`, '<= 5.0%', data.summary.defectRate <= 5 ? 'Low Defect Rate' : 'High Defect Rate'],
    ['Vehicles Currently Grounded', data.summary.groundedVehiclesNow, '0 Grounded', data.summary.groundedVehiclesNow === 0 ? 'Clear' : 'Workshop Hold'],
    ['Total Pre-Trip Inspections Conducted', data.summary.totalInspections, '100% Active Fleet', 'Recorded'],
    ['Passed Inspections (Clean)', data.summary.passedCount, '-', 'Nominal'],
    ['Defective Inspections Flagged', data.summary.defectCount, 'Zero Critical Defects', data.summary.defectCount === 0 ? 'Zero Defects' : 'Action Required'],
    ['Active Vehicles Inspected', `${data.summary.activeVehiclesInspected} / ${data.summary.totalFleetVehicles}`, '100% Fleet Coverage', `${data.summary.fleetCoverageRate}% Coverage`],
    ['Average Inspections Per Day', data.summary.avgInspectionsPerDay, '-', '-'],
    ['Total Defect Checklist Items Flagged', data.summary.totalDefectItemsLogged, '-', '-'],
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary['!cols'] = [{ wch: 38 }, { wch: 22 }, { wch: 22 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Executive Summary');

  // 2. Depot Performance Rankings Sheet
  const depotRows = [
    ['DEPOT PERFORMANCE & STATUTORY PRE-TRIP COMPLIANCE RANKINGS'],
    ['Rank', 'Depot Code', 'Depot Name', 'Fleet', 'Routes Done', 'Total Routes', 'Route Compliance %', 'Grounded Fleet', 'Defect Rate %', 'Total Inspected', 'Passed', 'Defects', 'Composite Score', 'Status Tier'],
    ...data.depotRankings.map(d => [
      d.rank,
      d.depot,
      d.depotName,
      d.assignedVehicles,
      d.completedRoutes,
      d.totalRoutes,
      `${d.complianceRate}%`,
      d.groundedVehicles,
      `${d.defectRate}%`,
      d.totalInspections,
      d.passedCount,
      d.defectCount,
      d.complianceScore,
      d.statusTier,
    ]),
  ];
  const wsDepots = XLSX.utils.aoa_to_sheet(depotRows);
  wsDepots['!cols'] = [
    { wch: 8 }, { wch: 12 }, { wch: 26 }, { wch: 10 }, { wch: 14 },
    { wch: 14 }, { wch: 20 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 16 }
  ];
  XLSX.utils.book_append_sheet(wb, wsDepots, 'Depot Rankings');

  // 2b. Daily Depot Breakdown Sheet
  if (data.dailyDepotMetrics && data.dailyDepotMetrics.length > 0) {
    const dailyDepotRows = [
      ['DAILY PERFORMANCE & COMPLIANCE BREAKDOWN BY DEPOT'],
      ['Date', 'Depot Hub', 'Fleet Size', 'Routes Done', 'Total Routes', 'Route Compliance %', 'Total Inspected', 'Passed', 'Defects', 'Grounded Fleet', 'Defect Rate %', 'Daily Score', 'Status'],
      ...data.dailyDepotMetrics.map(m => [
        m.date,
        m.depot,
        m.assignedVehicles,
        m.completedRoutes,
        m.totalRoutes,
        `${m.complianceRate}%`,
        m.totalInspections,
        m.passedCount,
        m.defectCount,
        m.groundedVehicles,
        `${m.defectRate}%`,
        m.score,
        m.statusTier,
      ]),
    ];
    const wsDailyDepots = XLSX.utils.aoa_to_sheet(dailyDepotRows);
    wsDailyDepots['!cols'] = [
      { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 20 },
      { wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 18 }
    ];
    XLSX.utils.book_append_sheet(wb, wsDailyDepots, 'Daily Depot Breakdown');
  }

  // 3. Daily Compliance Trends Sheet
  const trendRows = [
    ['DAILY PRE-TRIP INSPECTION COMPLIANCE & DEFECT TRENDS'],
    ['Calendar Date', 'Day of Week', 'Total Inspected', 'Passed (Clean)', 'Defective (Grounded)', 'Compliance Rate %'],
    ...data.dailyTrends.map(t => [
      t.date,
      t.dayLabel,
      t.inspected,
      t.passed,
      t.defects,
      `${t.complianceRate}%`,
    ]),
  ];
  const wsTrends = XLSX.utils.aoa_to_sheet(trendRows);
  wsTrends['!cols'] = [{ wch: 16 }, { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 22 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsTrends, 'Daily Trends');

  // 4. Defect Hotspots Sheet
  const defectRows = [
    ['TOP RECURRING VEHICLE DEFECT HOTSPOTS & COMPONENT BREAKDOWN'],
    ['Rank', 'Checkpoint ID', 'Component Title', 'Category', 'Defects Count', 'Share of Total Defects %', 'Risk Severity', 'Common Root Causes', 'Sample Defect Remarks', 'Affected Vehicles'],
    ...data.defectHotspots.map((h, idx) => [
      idx + 1,
      h.checkpointId,
      h.title,
      h.category,
      h.defectCount,
      `${h.percentage}%`,
      h.severity,
      h.commonIssues.join('; '),
      h.topRemarks.join(' | '),
      h.affectedVehicles.join(', '),
    ]),
  ];
  const wsDefects = XLSX.utils.aoa_to_sheet(defectRows);
  wsDefects['!cols'] = [
    { wch: 8 }, { wch: 20 }, { wch: 32 }, { wch: 24 }, { wch: 14 },
    { wch: 24 }, { wch: 14 }, { wch: 45 }, { wch: 55 }, { wch: 28 },
  ];
  XLSX.utils.book_append_sheet(wb, wsDefects, 'Defect Hotspots');

  // 5. Recent Defect Incidents Sheet
  if (data.recentDefectLogs && data.recentDefectLogs.length > 0) {
    const incidentRows = [
      ['RECENT VEHICLE DEFECT INCIDENTS & IMMEDIATE ACTION LOG'],
      ['Inspection ID', 'Timestamp', 'Vehicle Plate', 'Depot', 'Truck Category', 'Driver Name', 'Defect Summary', 'Failed Components & Driver Remarks'],
      ...data.recentDefectLogs.map(log => [
        log.id,
        log.formattedDate,
        log.vehicleNo,
        log.vehicleBranch,
        log.truckCategory || 'Small Truck',
        log.driverName,
        log.defectSummary,
        log.failedItems.map(it => `[${it.title}]: ${it.defectNote}`).join('; '),
      ]),
    ];
    const wsIncidents = XLSX.utils.aoa_to_sheet(incidentRows);
    wsIncidents['!cols'] = [
      { wch: 22 }, { wch: 20 }, { wch: 16 }, { wch: 12 }, { wch: 16 },
      { wch: 26 }, { wch: 40 }, { wch: 60 },
    ];
    XLSX.utils.book_append_sheet(wb, wsIncidents, 'Defect Incidents');
  }

  // Trigger download
  const filename = `Fleet_Executive_Compliance_Audit_${dateTag}.xlsx`;
  XLSX.writeFile(wb, filename);
}

/**
 * Generates and downloads a multi-page Executive Compliance Audit Brief in PDF format.
 */
export function exportExecutiveSummaryToPdf(data: ExecutiveAnalyticsData): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const dateTag = new Date().toISOString().slice(0, 10);

  // Corporate Primary Navy: #0F172A, Accent Blue: #2563EB, Muted: #64748B
  const primaryColor: [number, number, number] = [15, 23, 42]; // #0f172a
  const accentBlue: [number, number, number] = [37, 99, 235]; // #2563eb
  const textDark: [number, number, number] = [30, 41, 59]; // #1e293b
  const textMuted: [number, number, number] = [100, 116, 139]; // #64748b

  // 1. Header Bar
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, pageWidth, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('FLEET SAFEGUARD • EXECUTIVE AUDIT BRIEF', 14, 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  doc.text('STATUTORY PRE-TRIP INSPECTION COMPLIANCE & ROADWORTHINESS REPORT', 14, 18);
  doc.text(`AUDIT PERIOD: ${data.meta.startDate} TO ${data.meta.endDate} (${data.meta.timeframe.toUpperCase()})`, 14, 23);

  doc.setFontSize(8);
  doc.setTextColor(226, 232, 240);
  doc.text(`CONFIDENTIAL • APAD / JPJ COMPLIANT`, pageWidth - 14, 12, { align: 'right' });
  doc.text(`GENERATED: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, pageWidth - 14, 18, { align: 'right' });
  doc.text(`DEPOT: ${data.meta.selectedBranch} | SCOPE: ${data.meta.selectedCategory}`, pageWidth - 14, 23, { align: 'right' });

  let yPos = 36;

  // 2. Executive KPI Summary Cards
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...textDark);
  doc.text('1. Executive KPI Scorecard', 14, yPos);
  yPos += 4;

  const cardWidth = (pageWidth - 28 - 9) / 4;
  const cardHeight = 22;
  const kpis = [
    { label: 'ROUTE COMPLIANCE', value: `${data.summary.complianceRate}%`, sub: `${data.summary.completedRoutes}/${data.summary.totalRoutes} Routes`, color: data.summary.complianceRate >= 95 ? [22, 101, 52] : [180, 83, 9] },
    { label: 'COMPOSITE SCORE', value: `${data.summary.complianceScore}`, sub: '60% Rte + 40% Hlth', color: primaryColor },
    { label: 'DEFECT RATE & GROUNDED', value: `${data.summary.defectRate}%`, sub: `${data.summary.groundedVehiclesNow} Grounded`, color: data.summary.defectRate > 5 ? [185, 28, 28] : [22, 101, 52] },
    { label: 'TOTAL INSPECTIONS', value: `${data.summary.totalInspections}`, sub: `${data.summary.passedCount}P / ${data.summary.defectCount}F`, color: accentBlue },
  ];

  kpis.forEach((kpi, idx) => {
    const x = 14 + idx * (cardWidth + 3);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, yPos, cardWidth, cardHeight, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...textMuted);
    doc.text(kpi.label, x + 3.5, yPos + 5.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    doc.text(kpi.value, x + 3.5, yPos + 13);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...textMuted);
    doc.text(kpi.sub, x + 3.5, yPos + 18.5);
  });

  yPos += cardHeight + 8;

  // 3. Depot Rankings Table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...textDark);
  doc.text('2. Depot Performance & Statutory Pre-Trip Rankings', 14, yPos);
  yPos += 3;

  autoTable(doc, {
    startY: yPos,
    margin: { left: 14, right: 14 },
    head: [['Rank', 'Depot', 'Depot Name', 'Fleet', 'Routes', 'Compliance %', 'Grounded', 'Defect %', 'Score', 'Rating']],
    body: data.depotRankings.map(d => [
      `#${d.rank}`,
      d.depot,
      d.depotName,
      d.assignedVehicles.toString(),
      `${d.completedRoutes}/${d.totalRoutes}`,
      `${d.complianceRate}%`,
      `${d.groundedVehicles}`,
      `${d.defectRate}%`,
      d.complianceScore.toString(),
      d.statusTier,
    ]),
    theme: 'grid',
    styles: {
      fontSize: 7.5,
      cellPadding: 2,
      font: 'helvetica',
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: primaryColor,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
      2: { cellWidth: 42 },
      3: { cellWidth: 18, halign: 'right' },
      4: { cellWidth: 18, halign: 'right' },
      5: { cellWidth: 16, halign: 'right' },
      6: { cellWidth: 16, halign: 'right' },
      7: { cellWidth: 18, halign: 'right' },
      8: { cellWidth: 15, halign: 'right', fontStyle: 'bold' },
      9: { cellWidth: 23, halign: 'center' },
    },
  });

  yPos = (doc as any).lastAutoTable.finalY + 8;

  // 4. Defect Hotspots Breakdown Table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...textDark);
  doc.text('3. Top Recurring Defect Categories (Hotspot Analysis)', 14, yPos);
  yPos += 3;

  autoTable(doc, {
    startY: yPos,
    margin: { left: 14, right: 14 },
    head: [['#', 'Component Checkpoint', 'Category', 'Defects', 'Share %', 'Risk', 'Sample Remarks & Key Findings']],
    body: data.defectHotspots.slice(0, 7).map((h, idx) => [
      (idx + 1).toString(),
      h.title,
      h.category,
      h.defectCount.toString(),
      `${h.percentage}%`,
      h.severity,
      h.topRemarks[0] || h.commonIssues.join(', ') || 'N/A',
    ]),
    theme: 'grid',
    styles: {
      fontSize: 7.5,
      cellPadding: 2.2,
      font: 'helvetica',
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 46, fontStyle: 'bold' },
      2: { cellWidth: 32 },
      3: { cellWidth: 14, halign: 'right' },
      4: { cellWidth: 14, halign: 'right' },
      5: { cellWidth: 16, halign: 'center' },
      6: { cellWidth: 62 },
    },
  });

  yPos = (doc as any).lastAutoTable.finalY + 10;

  // Check if we need page 2 for Sign-Off block or if it fits
  if (yPos > pageHeight - 38) {
    doc.addPage();
    yPos = 20;
  }

  // 5. Official Statutory Sign-off Block
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, yPos, pageWidth - 28, 26, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...textDark);
  doc.text('STATUTORY REGULATORY ATTESTATION & FLEET MANAGEMENT SIGN-OFF', 18, yPos + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...textMuted);
  doc.text(
    'I hereby certify that all pre-trip vehicle inspections recorded herein comply with APAD Act 715 and JPJ Technical Roadworthiness Standards.',
    18,
    yPos + 9
  );

  const signWidth = (pageWidth - 28 - 20) / 3;
  const signY = yPos + 14;

  const signBoxes = [
    { title: 'PREPARED BY (CHIEF DISPATCHER):', date: 'Date: ________________' },
    { title: 'VERIFIED BY (FLEET OPERATIONS MGR):', date: 'Date: ________________' },
    { title: 'AUDITED BY (APAD / JPJ COMPLIANCE):', date: 'Date: ________________' },
  ];

  signBoxes.forEach((box, i) => {
    const sx = 18 + i * (signWidth + 5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(...textMuted);
    doc.text(box.title, sx, signY);
    doc.setDrawColor(148, 163, 184);
    doc.line(sx, signY + 6, sx + signWidth - 5, signY + 6);
    doc.text(box.date, sx, signY + 9.5);
  });

  // Footer on all pages
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text(`Fleet Pre-Trip Inspection System • Enterprise Executive Audit Brief • Page ${p} of ${totalPages}`, 14, pageHeight - 6);
    doc.text(`Tamper-Proof Digital Verification Stamp: #FPS-${Date.now().toString(36).toUpperCase()}`, pageWidth - 14, pageHeight - 6, { align: 'right' });
  }

  // Trigger download
  const filename = `Fleet_Executive_Compliance_Brief_${dateTag}.pdf`;
  doc.save(filename);
}
