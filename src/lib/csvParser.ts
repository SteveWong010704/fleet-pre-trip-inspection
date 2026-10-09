import { Vehicle, Driver, InspectionRecord, InspectionCheckItem, CheckStatus } from '../types';

export function parseVehicleCsv(csvText: string): Partial<Vehicle>[] {
  const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) return [];

  // Parse header
  const headers = lines[0].split(',').map(h => h.trim().toUpperCase());
  const results: Partial<Vehicle>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i];
    // basic CSV line splitter that respects quotes
    const values: string[] = [];
    let insideQuote = false;
    let currentVal = '';

    for (let c = 0; c < rawLine.length; c++) {
      const char = rawLine[c];
      if (char === '"' || char === "'") {
        insideQuote = !insideQuote;
      } else if (char === ',' && !insideQuote) {
        values.push(currentVal.trim());
        currentVal = '';
      } else {
        currentVal += char;
      }
    }
    values.push(currentVal.trim());

    if (values.length === 0 || !values.some(v => v.length > 0)) continue;

    const rowObj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rowObj[h] = values[idx] || '';
    });

    // Flexible column matching
    const vehicleNo = (
      rowObj['VEHICLE NO.'] ||
      rowObj['VEHICLE NO'] ||
      rowObj['VEHICLENO'] ||
      rowObj['PLATE'] ||
      rowObj['PLATE NO'] ||
      rowObj['VEHICLE_NO'] ||
      values[2] ||
      values[1] ||
      ''
    ).replace(/['"\s]/g, '').toUpperCase();

    if (!vehicleNo || vehicleNo === 'VEHICLENO') continue;

    const cardNo = rowObj['CARD NO.'] || rowObj['CARD NO'] || rowObj['CARDNO'] || values[1] || '';
    const pinNo = rowObj['PIN NO.'] || rowObj['PIN NO'] || rowObj['PINNO'] || values[3] || '';
    const litre = parseFloat(rowObj['LITRE (L)'] || rowObj['LITRE'] || values[4]) || 24;
    const limitRm = parseFloat(rowObj['LIMIT (RM)'] || rowObj['LIMIT'] || values[5]) || 107;
    const branch = (rowObj['BRANCH'] || rowObj['DEPOT'] || values[7] || 'BL').trim().toUpperCase();
    const area = (
      rowObj['AREA'] ||
      rowObj['ROUTE'] ||
      rowObj['AREA CODE'] ||
      rowObj['ASSIGNED ROUTE'] ||
      rowObj['ROUTE / AREA'] ||
      values[6] ||
      ''
    ).trim().toUpperCase() || `${branch}01`;
    const costCenter = rowObj['COST CENTER'] || rowObj['COSTCENTER'] || values[8] || 'K11200';
    const brand = rowObj['BRAND'] || values[9] || 'HINO';
    const advertisement = rowObj['ADVERTISEMENT'] || values[11] || '';
    const yearOfMade = rowObj['YEAR OF MADE'] || rowObj['YEAR'] || values[12] || 2024;
    const model = rowObj['MODEL'] || values[13] || 'Commercial Cargo';
    const engineNo = rowObj['ENGINE NO.'] || rowObj['ENGINE NO'] || values[14] || '';
    const chassisNo = rowObj['CHASIS NO.'] || rowObj['CHASSIS NO'] || values[15] || '';
    const registrationDate = rowObj['REGISTRATION DATE'] || values[16] || new Date().toLocaleDateString();
    const tonnage = rowObj['TONNAGE'] || values[17] || 1;
    const capacity = rowObj['CAPACITY'] || values[18] || 2750;
    const permit = rowObj['PERMIT'] || values[19] || 'JPJ';
    const tyreSize = rowObj['TYRE SIZE'] || rowObj['TYRESIZE'] || values[20] || '195/75R15';
    const batteryType = rowObj['BATTERY TYPE'] || rowObj['BATTERY'] || values[21] || '95D31L';
    const qrToken = (rowObj['QR TOKEN'] || rowObj['QRTOKEN'] || rowObj['TOKEN'] || '').trim().toUpperCase();

    results.push({
      vehicleNo,
      qrToken: qrToken || undefined,
      cardNo,
      pinNo,
      litre,
      limitRm,
      area,
      assignedRoute: area,
      branch,
      costCenter,
      brand,
      advertisement,
      yearOfMade,
      model,
      engineNo,
      chassisNo,
      registrationDate,
      tonnage,
      capacity,
      permit,
      tyreSize,
      batteryType,
      currentStatus: 'Pending Inspection',
      currentOdometer: 50000,
    });
  }

  return results;
}

export function parseDriverCsv(csvText: string): Partial<Driver>[] {
  const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().toUpperCase());
  const results: Partial<Driver>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i];
    const values: string[] = [];
    let insideQuote = false;
    let currentVal = '';

    for (let c = 0; c < rawLine.length; c++) {
      const char = rawLine[c];
      if (char === '"' || char === "'") {
        insideQuote = !insideQuote;
      } else if (char === ',' && !insideQuote) {
        values.push(currentVal.trim());
        currentVal = '';
      } else {
        currentVal += char;
      }
    }
    values.push(currentVal.trim());

    if (values.length === 0) continue;

    const rowObj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rowObj[h] = values[idx] || '';
    });

    const noRaw = (rowObj['NO'] || rowObj['NO.'] || values[0] || '').trim();
    const parsedNo = parseInt(noRaw, 10);
    const no = !isNaN(parsedNo) ? parsedNo : undefined;

    const employeeId = (rowObj['EMPLOYEE ID'] || rowObj['EMPLOYEEID'] || values[3] || '').trim().toUpperCase();
    const loginId = (rowObj['LOGIN ID'] || rowObj['LOGINID'] || values[4] || employeeId).trim().toUpperCase();
    const password = (rowObj['PASSWORD'] || values[5] || 'password').trim();
    const name = (rowObj['NAME'] || values[6] || 'DRIVER').trim().toUpperCase();
    const designation = (rowObj['DESIGNATION'] || values[7] || 'SALESMAN').trim().toUpperCase();
    const depot = (rowObj['DEPOT'] || values[1] || 'BL').trim().toUpperCase();
    const depotName = (rowObj['DEPOT NAME'] || values[2] || 'BALAKONG').trim().toUpperCase();
    const licenseType = rowObj['LICENSE TYPE'] || 'GDL Heavy';
    const phone = rowObj['PHONE'] || '+60 12-000 0000';
    const rawStatus = (rowObj['STATUS'] || values[10] || values[9] || 'A').trim().toUpperCase();
    const status: 'A' | 'I' = (rawStatus === 'I' || rawStatus.startsWith('INACT')) ? 'I' : 'A';

    if (!employeeId && !loginId) continue;

    results.push({
      no,
      employeeId: employeeId || loginId,
      loginId,
      password,
      name,
      designation,
      depot,
      depotName,
      licenseType,
      phone,
      status,
      dateCreated: new Date().toLocaleDateString(),
    });
  }

  return results;
}

export function exportVehiclesToCsv(vehicles: Vehicle[]): string {
  const headers = [
    'No',
    'Card No',
    'Vehicle No',
    'PIN No',
    'Litre (L)',
    'Limit (RM)',
    'Area',
    'Branch',
    'Cost Center',
    'Brand',
    'Model',
    'Year',
    'Engine No',
    'Chassis No',
    'Tonnage',
    'Capacity',
    'Tyre Size',
    'Battery Type',
    'QR Token',
    'Status',
    'Last Inspection',
  ];

  const rows = vehicles.map((v, i) => [
    i + 1,
    `"${v.cardNo || ''}"`,
    `"${v.vehicleNo}"`,
    `"${v.pinNo || ''}"`,
    v.litre || 24,
    v.limitRm || 107,
    `"${v.area || ''}"`,
    `"${v.branch || ''}"`,
    `"${v.costCenter || ''}"`,
    `"${v.brand || ''}"`,
    `"${v.model || ''}"`,
    v.yearOfMade || '',
    `"${v.engineNo || ''}"`,
    `"${v.chassisNo || ''}"`,
    v.tonnage || 1,
    v.capacity || '',
    `"${v.tyreSize || ''}"`,
    `"${v.batteryType || ''}"`,
    `"${v.qrToken || ''}"`,
    `"${v.currentStatus}"`,
    `"${v.lastInspectionDate || 'N/A'}"`,
  ]);

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

function parseCheckStatus(val?: string): CheckStatus {
  if (!val) return 'Pass';
  const clean = val.toLowerCase().trim();
  if (clean.includes('fail') || clean.includes('defect') || clean.includes('issue') || clean.includes('bad') || clean.includes('no')) {
    return 'Fail';
  }
  if (clean.includes('n/a') || clean.includes('na') || clean.includes('not applicable')) {
    return 'NA';
  }
  return 'Pass';
}

function parseFuelLevel(val?: string): number {
  if (!val) return 100;
  const clean = val.toLowerCase().trim();
  if (clean.includes('100') || clean.includes('full')) return 100;
  if (clean.includes('75') || clean.includes('3/4')) return 75;
  if (clean.includes('50') || clean.includes('1/2')) return 50;
  if (clean.includes('25') || clean.includes('1/4')) return 25;
  if (clean.includes('empty') || clean.includes('reserve') || clean.includes('15') || clean.includes('0')) return 15;
  const num = parseInt(clean.replace(/[^\d]/g, ''), 10);
  return isNaN(num) ? 100 : Math.min(100, Math.max(0, num));
}

export function parseInspectionCsv(csvText: string): Partial<InspectionRecord>[] {
  const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) return [];

  // Split headers respecting quotes
  const rawHeaderLine = lines[0];
  const headers: string[] = [];
  let inQ = false;
  let curr = '';
  for (let c = 0; c < rawHeaderLine.length; c++) {
    const ch = rawHeaderLine[c];
    if (ch === '"' || ch === "'") inQ = !inQ;
    else if (ch === ',' && !inQ) {
      headers.push(curr.trim());
      curr = '';
    } else curr += ch;
  }
  headers.push(curr.trim());

  const results: Partial<InspectionRecord>[] = [];

  const default10Def = [
    { id: 'tires_wheels', code: 1, category: 'Chassis & Rolling Gear', title: 'Tires & Wheels (5 Photos)', subtext: 'Tires & Spare Tyre Pressure' },
    { id: 'brake_system', code: 2, category: 'Control & Stopping', title: 'Brake System', subtext: 'Brake System & Air Pressure' },
    { id: 'lights_indicators', code: 3, category: 'Visibility & Signals', title: 'Lights & Indicators', subtext: 'Lights, Turn Signals & Hazard' },
    { id: 'steering_handling', code: 4, category: 'Control & Stopping', title: 'Steering & Handling', subtext: 'Steering & Suspension' },
    { id: 'radiator_coolant', code: 5, category: 'Engine & Cooling', title: 'Radiator & Coolant Level', subtext: 'Radiator Tank, Cap & Coolant' },
    { id: 'dashboard_warnings', code: 6, category: 'Instruments & Electronics', title: 'Dashboard & Warnings', subtext: 'Dashboard Cluster & Warnings' },
    { id: 'emergency_equipment', code: 7, category: 'Safety & Emergency', title: 'Emergency Equipment', subtext: 'Safety Equipment & Fire Extinguisher' },
    { id: 'body_passenger_doors', code: 8, category: 'Body & Access', title: 'Cargo & Body (4 Sides)', subtext: 'Cargo Box & Body Integrity' },
    { id: 'diesel_fuel_cap', code: 9, category: 'Fuel & Security', title: 'Diesel Fuel Tank & Cap', subtext: 'Diesel Filler Cap & Tank' },
    { id: 'fluids_powertrain', code: 10, category: 'Engine & Fluids', title: 'Fluids & Powertrain', subtext: 'Engine Oil, Brake Fluid & Battery' },
  ];

  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i];
    const values: string[] = [];
    let insideQuote = false;
    let currentVal = '';

    for (let c = 0; c < rawLine.length; c++) {
      const char = rawLine[c];
      if (char === '"' || char === "'") {
        insideQuote = !insideQuote;
      } else if (char === ',' && !insideQuote) {
        values.push(currentVal.trim());
        currentVal = '';
      } else {
        currentVal += char;
      }
    }
    values.push(currentVal.trim());

    if (values.length === 0 || !values.some(v => v.length > 0)) continue;

    const rowObj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rowObj[h] = values[idx] || '';
      rowObj[h.toUpperCase()] = values[idx] || '';
    });

    // Helper to find value from possible key patterns
    const findVal = (patterns: string[]): string => {
      for (const p of patterns) {
        if (rowObj[p] !== undefined && rowObj[p] !== '') return rowObj[p];
        if (rowObj[p.toUpperCase()] !== undefined && rowObj[p.toUpperCase()] !== '') return rowObj[p.toUpperCase()];
        for (const [k, v] of Object.entries(rowObj)) {
          if (k.toLowerCase().includes(p.toLowerCase()) && v) {
            return v;
          }
        }
      }
      return '';
    };

    // Find Vehicle Plate
    let vehicleNo = findVal([
      'Vehicle Plate No.',
      'Vehicle Plate',
      'Vehicle Plate No',
      'Vehicle No',
      'VEHICLE NO.',
      'PLATE',
      'Vehicle No.',
      'Plate Number',
    ]).replace(/['"\s]/g, '').toUpperCase();

    if (!vehicleNo) {
      // Check column 1 or 3
      if (values[1] && /^[A-Z0-9]{3,10}$/i.test(values[1].replace(/\s/g, ''))) {
        vehicleNo = values[1].replace(/['"\s]/g, '').toUpperCase();
      } else if (values[3] && /^[A-Z0-9]{3,10}$/i.test(values[3].replace(/\s/g, ''))) {
        vehicleNo = values[3].replace(/['"\s]/g, '').toUpperCase();
      }
    }

    if (!vehicleNo || vehicleNo === 'VEHICLENO' || vehicleNo === 'VEHICLEPLATE') continue;

    // Driver Name & ID
    const driverName = findVal(['Driver Name', 'Driver / Inspector', 'Inspector', 'Driver']) || 'Driver';
    const driverId = (findVal(['Driver Employee ID', 'Login ID', 'Driver ID', 'Employee ID', 'Driver Badge']) || 'SF7620').toUpperCase();
    const depot = (findVal(['Depot Branch', 'Branch', 'Depot', 'Station']) || 'BL').trim().toUpperCase();
    const route = (findVal(['Route', 'Area', 'Assigned Route', 'Area Code', 'Route / Area']) || `${depot}01`).trim().toUpperCase();

    // Odometer
    const rawOdo = findVal(['Current Odometer', 'Odometer (KM)', 'Odometer KM', 'Odometer']);
    const odometer = parseInt((rawOdo || '').replace(/[^\d]/g, ''), 10) || 50000;

    // Fuel Level
    const rawFuel = findVal(['Fuel Gauge Level', 'Fuel Level (%)', 'Fuel Level %', 'Fuel']);
    const fuelLevel = parseFuelLevel(rawFuel);

    // Defect Notes
    const defectNotes = findVal(['Defect Notes', 'Defect Summary', 'Defect Details', 'Defects', 'Remarks']);

    // Check items status
    const itemStatuses: CheckStatus[] = [
      parseCheckStatus(findVal(['Tires & Wheels', 'Tires & Pressure', 'Tires', 'Tires Condition'])),
      parseCheckStatus(findVal(['Brake System', 'Brakes', 'Braking Efficiency'])),
      parseCheckStatus(findVal(['Lights, Turn Signals', 'Lights & Indicators', 'Lights', 'Turn Signals'])),
      parseCheckStatus(findVal(['Steering & Handling', 'Steering & Suspension', 'Steering', 'Handling'])),
      parseCheckStatus(findVal(['Radiator & Coolant Level', 'Radiator', 'Coolant Level', 'Coolant', 'Mirrors & Windshield', 'Mirrors & Wipers'])),
      parseCheckStatus(findVal(['Dashboard Warnings', 'Dashboard & Warnings', 'Dashboard', 'Instrument Cluster'])),
      parseCheckStatus(findVal(['Safety Equipment', 'Emergency Equipment', 'Emergency', 'Fire Extinguisher'])),
      parseCheckStatus(findVal(['Cargo & Body', 'Cargo Box, Doors', 'Cargo Doors & Seals', 'Body & Cargo Doors', 'Cargo Doors', 'Doors'])),
      parseCheckStatus(findVal(['Diesel Fuel Tank & Cap', 'Diesel Fuel Cap', 'Diesel Cap', 'Fuel Cap', 'HVAC', 'Cabin Ventilation'])),
      parseCheckStatus(findVal(['Fluids & Powertrain', 'Engine Oil', 'Battery', 'Engine Oil & Coolant', 'Fluids'])),
    ];

    const items: InspectionCheckItem[] = default10Def.map((def, idx) => ({
      ...def,
      status: itemStatuses[idx] || 'Pass',
      defectNote: itemStatuses[idx] === 'Fail' ? defectNotes : undefined,
    }));

    const defectCount = items.filter(it => it.status === 'Fail').length;
    const rawResult = findVal(['Overall Result', 'Result', 'Status']);
    const overallResult: 'Pass' | 'Fail' = rawResult.toLowerCase().includes('pass')
      ? 'Pass'
      : rawResult.toLowerCase().includes('fail')
      ? 'Fail'
      : (defectCount > 0 ? 'Fail' : 'Pass');

    // Timestamp & Certificate ID
    const rawTimestamp = findVal(['Timestamp', 'Date & Time', 'Date', 'Time']);
    const validDate = rawTimestamp ? new Date(rawTimestamp) : new Date();
    const formattedDate = !isNaN(validDate.getTime()) ? validDate.toLocaleString('en-US', { hour12: false }) : new Date().toLocaleString('en-US', { hour12: false });
    const certificateId = findVal(['Certificate ID', 'Cert ID', 'ID']) || undefined;

    results.push({
      id: certificateId,
      timestamp: !isNaN(validDate.getTime()) ? validDate.toISOString() : new Date().toISOString(),
      formattedDate,
      driverId,
      driverName,
      driverDesignation: 'SALESMAN',
      driverDepot: depot,
      vehicleNo,
      vehicleBranch: depot,
      route,
      odometer,
      fuelLevel,
      healthDeclaration: true,
      overallResult,
      items,
      defectCount,
      defectSummary: defectNotes || (defectCount > 0 ? items.filter(it => it.status === 'Fail').map(it => it.title).join(', ') : undefined),
    });
  }

  return results;
}

export function exportInspectionsToCsv(inspections: InspectionRecord[]): string {
  const headers = [
    'No',
    'Certificate ID',
    'Date & Time',
    'Vehicle Plate',
    'Brand & Model',
    'Branch',
    'Route',
    'Driver ID',
    'Driver Name',
    'Odometer KM',
    'Fuel Level %',
    'Result',
    'Defects',
    'Defect Details',
  ];

  const rows = inspections.map((r, idx) => [
    idx + 1,
    `"${r.id}"`,
    `"${r.formattedDate}"`,
    `"${r.vehicleNo}"`,
    `"${(r.vehicleBrand || '') + ' ' + (r.vehicleModel || '')}"`,
    `"${r.vehicleBranch || r.driverDepot || ''}"`,
    `"${r.route || ''}"`,
    `"${r.driverId}"`,
    `"${r.driverName}"`,
    r.odometer,
    r.fuelLevel,
    `"${r.overallResult}"`,
    r.defectCount,
    `"${(r.defectSummary || '').replace(/"/g, '""')}"`,
  ]);

  return [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
}
