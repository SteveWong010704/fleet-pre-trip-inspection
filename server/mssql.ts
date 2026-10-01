import sql from 'mssql';
import { Vehicle, Driver, InspectionRecord, AuditLog } from '../src/types';

let pool: sql.ConnectionPool | null = null;
let isConnecting = false;
let isConnected = false;

export function getMssqlConfig(): sql.config {
  const server = process.env.MSSQL_SERVER || '192.168.1.215';
  const port = parseInt(process.env.MSSQL_PORT || '1433', 10);
  const user = process.env.MSSQL_USER || 'sa';
  const password = process.env.MSSQL_PASSWORD || 'StrongPassword123';
  const database = process.env.MSSQL_DATABASE || 'FleetInspectionDB';
  const encrypt = process.env.MSSQL_ENCRYPT === 'true';

  return {
    server,
    port,
    user,
    password,
    database,
    options: {
      encrypt,
      trustServerCertificate: true,
      enableArithAbort: true,
      connectTimeout: 8000,
      requestTimeout: 20000,
    },
    pool: {
      max: 15,
      min: 1,
      idleTimeoutMillis: 30000,
    },
  };
}

export function isMssqlConnected(): boolean {
  return isConnected && pool !== null && pool.connected;
}

export function getMssqlPool(): sql.ConnectionPool | null {
  return pool;
}

export async function connectMssql(): Promise<boolean> {
  if (isMssqlConnected()) return true;
  if (isConnecting) return false;

  const config = getMssqlConfig();
  isConnecting = true;

  try {
    console.log(`[MSSQL] Attempting connection to Microsoft SQL Server at ${config.server}:${config.port}/${config.database} as user '${config.user}'...`);
    pool = await new sql.ConnectionPool(config).connect();
    isConnected = true;
    isConnecting = false;
    console.log(`[MSSQL] ✓ Connected successfully to SQL Server (${config.database} on ${config.server})`);

    // Verify tables exist
    const testResult = await pool.request().query`
      SELECT 
        (SELECT COUNT(*) FROM dbo.Vehicles) AS vehicleCount,
        (SELECT COUNT(*) FROM dbo.Drivers) AS driverCount,
        (SELECT COUNT(*) FROM dbo.Inspections) AS inspectionCount
    `;
    const counts = testResult.recordset[0] || {};
    console.log(`[MSSQL Status] Database active: ${counts.vehicleCount ?? 0} Vehicles, ${counts.driverCount ?? 0} Drivers, ${counts.inspectionCount ?? 0} Inspections.`);
    return true;
  } catch (err: any) {
    isConnecting = false;
    isConnected = false;
    console.warn(`[MSSQL Warning] Could not connect to SQL Server (${config.server}:${config.port}): ${err.message || err}`);
    console.warn(`[MSSQL Fallback] Safe fallback: The system will operate with local memory/JSON storage until SQL Server is reachable.`);
    return false;
  }
}

// ----------------------------------------------------------------------------
// Database Operations: VEHICLES
// ----------------------------------------------------------------------------
export async function dbLoadVehicles(): Promise<Vehicle[]> {
  if (!isMssqlConnected() || !pool) return [];
  try {
    const result = await pool.request().query`
      SELECT 
        VehicleNo AS vehicleNo,
        [No] AS no,
        CardNo AS cardNo,
        PinNo AS pinNo,
        Litre AS litre,
        LimitRm AS limitRm,
        Area AS area,
        Branch AS branch,
        CostCenter AS costCenter,
        Brand AS brand,
        LogoDate AS logoDate,
        Advertisement AS advertisement,
        YearOfMade AS yearOfMade,
        Model AS model,
        EngineNo AS engineNo,
        ChassisNo AS chassisNo,
        RegistrationDate AS registrationDate,
        TruckCategory AS truckCategory,
        Capacity AS capacity,
        Permit AS permit,
        TyreSize AS tyreSize,
        BatteryType AS batteryType,
        Ages AS ages,
        CurrentStatus AS currentStatus,
        CurrentOdometer AS currentOdometer,
        AssignedRoute AS assignedRoute,
        CONVERT(NVARCHAR(30), LastInspectionDate, 120) AS lastInspectionDate,
        LastInspectionCode AS lastInspectionCode,
        LastDriverName AS lastDriverName
      FROM dbo.Vehicles
      ORDER BY Branch, VehicleNo
    `;
    return result.recordset as Vehicle[];
  } catch (err) {
    console.error('[MSSQL Error] dbLoadVehicles failed:', err);
    return [];
  }
}

export async function dbSaveVehicle(v: Vehicle): Promise<void> {
  if (!isMssqlConnected() || !pool) return;
  try {
    const req = pool.request();
    req.input('VehicleNo', sql.NVarChar(50), v.vehicleNo);
    req.input('No', sql.Int, v.no || null);
    req.input('CardNo', sql.NVarChar(100), v.cardNo || null);
    req.input('PinNo', sql.NVarChar(50), v.pinNo || null);
    req.input('Litre', sql.Decimal(10, 2), typeof v.litre === 'number' ? v.litre : parseFloat(String(v.litre || 0)));
    req.input('LimitRm', sql.Decimal(10, 2), typeof v.limitRm === 'number' ? v.limitRm : parseFloat(String(v.limitRm || 0)));
    req.input('Area', sql.NVarChar(50), v.area || null);
    req.input('Branch', sql.NVarChar(50), v.branch || 'BL');
    req.input('CostCenter', sql.NVarChar(50), v.costCenter || null);
    req.input('Brand', sql.NVarChar(100), v.brand || null);
    req.input('LogoDate', sql.NVarChar(50), v.logoDate || null);
    req.input('Advertisement', sql.NVarChar(255), v.advertisement || null);
    req.input('YearOfMade', sql.Int, typeof v.yearOfMade === 'number' ? v.yearOfMade : parseInt(String(v.yearOfMade || 0), 10) || null);
    req.input('Model', sql.NVarChar(100), v.model || null);
    req.input('EngineNo', sql.NVarChar(100), v.engineNo || null);
    req.input('ChassisNo', sql.NVarChar(100), v.chassisNo || null);
    req.input('RegistrationDate', sql.NVarChar(50), v.registrationDate || null);
    req.input('TruckCategory', sql.NVarChar(50), v.truckCategory || 'Feeder');
    req.input('Capacity', sql.Decimal(10, 2), typeof v.capacity === 'number' ? v.capacity : parseFloat(String(v.capacity || 0)));
    req.input('Permit', sql.NVarChar(100), v.permit || 'JPJ');
    req.input('TyreSize', sql.NVarChar(50), v.tyreSize || null);
    req.input('BatteryType', sql.NVarChar(50), v.batteryType || null);
    req.input('Ages', sql.Int, typeof v.ages === 'number' ? v.ages : parseInt(String(v.ages || 0), 10) || null);
    req.input('CurrentStatus', sql.NVarChar(50), v.currentStatus || 'Pending Inspection');
    req.input('CurrentOdometer', sql.Int, v.currentOdometer || 0);
    req.input('AssignedRoute', sql.NVarChar(150), v.assignedRoute || null);
    req.input('LastInspectionCode', sql.NVarChar(50), v.lastInspectionCode || null);
    req.input('LastDriverName', sql.NVarChar(100), v.lastDriverName || null);

    await req.query`
      MERGE dbo.Vehicles AS target
      USING (SELECT @VehicleNo AS VehicleNo) AS source
      ON target.VehicleNo = source.VehicleNo
      WHEN MATCHED THEN
        UPDATE SET
          [No] = @No, CardNo = @CardNo, PinNo = @PinNo, Litre = @Litre, LimitRm = @LimitRm,
          Area = @Area, Branch = @Branch, CostCenter = @CostCenter, Brand = @Brand,
          LogoDate = @LogoDate, Advertisement = @Advertisement, YearOfMade = @YearOfMade,
          Model = @Model, EngineNo = @EngineNo, ChassisNo = @ChassisNo,
          RegistrationDate = @RegistrationDate, TruckCategory = @TruckCategory,
          Capacity = @Capacity, Permit = @Permit, TyreSize = @TyreSize,
          BatteryType = @BatteryType, Ages = @Ages, CurrentStatus = @CurrentStatus,
          CurrentOdometer = @CurrentOdometer, AssignedRoute = @AssignedRoute,
          LastInspectionCode = @LastInspectionCode, LastDriverName = @LastDriverName,
          UpdatedAt = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (VehicleNo, [No], CardNo, PinNo, Litre, LimitRm, Area, Branch, CostCenter, Brand,
                LogoDate, Advertisement, YearOfMade, Model, EngineNo, ChassisNo, RegistrationDate,
                TruckCategory, Capacity, Permit, TyreSize, BatteryType, Ages, CurrentStatus,
                CurrentOdometer, AssignedRoute, LastInspectionCode, LastDriverName)
        VALUES (@VehicleNo, @No, @CardNo, @PinNo, @Litre, @LimitRm, @Area, @Branch, @CostCenter, @Brand,
                @LogoDate, @Advertisement, @YearOfMade, @Model, @EngineNo, @ChassisNo, @RegistrationDate,
                @TruckCategory, @Capacity, @Permit, @TyreSize, @BatteryType, @Ages, @CurrentStatus,
                @CurrentOdometer, @AssignedRoute, @LastInspectionCode, @LastDriverName);
    `;
  } catch (err) {
    console.error(`[MSSQL Error] dbSaveVehicle failed for ${v.vehicleNo}:`, err);
  }
}

export async function dbDeleteVehicle(vehicleNo: string): Promise<void> {
  if (!isMssqlConnected() || !pool) return;
  try {
    const req = pool.request();
    req.input('VehicleNo', sql.NVarChar(50), vehicleNo);
    await req.query`DELETE FROM dbo.Vehicles WHERE VehicleNo = @VehicleNo`;
  } catch (err) {
    console.error(`[MSSQL Error] dbDeleteVehicle failed for ${vehicleNo}:`, err);
  }
}

// ----------------------------------------------------------------------------
// Database Operations: DRIVERS
// ----------------------------------------------------------------------------
export async function dbLoadDrivers(): Promise<Driver[]> {
  if (!isMssqlConnected() || !pool) return [];
  try {
    const result = await pool.request().query`
      SELECT 
        EmployeeId AS employeeId,
        [No] AS no,
        LoginId AS loginId,
        [Password] AS password,
        [Name] AS name,
        Designation AS designation,
        Depot AS depot,
        DepotName AS depotName,
        LicenseType AS licenseType,
        Phone AS phone,
        DateCreated AS dateCreated,
        [Status] AS status,
        AvatarUrl AS avatarUrl,
        FailedAttempts AS failedAttempts,
        CONVERT(NVARCHAR(30), LockedUntil, 120) AS lockedUntil
      FROM dbo.Drivers
      ORDER BY Depot, [Name]
    `;
    return result.recordset as Driver[];
  } catch (err) {
    console.error('[MSSQL Error] dbLoadDrivers failed:', err);
    return [];
  }
}

export async function dbSaveDriver(d: Driver): Promise<void> {
  if (!isMssqlConnected() || !pool) return;
  try {
    const req = pool.request();
    req.input('EmployeeId', sql.NVarChar(50), d.employeeId);
    req.input('No', sql.Int, d.no || null);
    req.input('LoginId', sql.NVarChar(50), d.loginId);
    req.input('Password', sql.NVarChar(255), d.password || 'password');
    req.input('Name', sql.NVarChar(150), d.name);
    req.input('Designation', sql.NVarChar(50), d.designation || 'SALESMAN');
    req.input('Depot', sql.NVarChar(50), d.depot || 'BL');
    req.input('DepotName', sql.NVarChar(100), d.depotName || null);
    req.input('LicenseType', sql.NVarChar(100), d.licenseType || null);
    req.input('Phone', sql.NVarChar(50), d.phone || null);
    req.input('DateCreated', sql.NVarChar(50), d.dateCreated || null);
    req.input('Status', sql.Char(1), d.status || 'A');
    req.input('AvatarUrl', sql.NVarChar(500), d.avatarUrl || null);
    req.input('FailedAttempts', sql.Int, d.failedAttempts || 0);

    await req.query`
      MERGE dbo.Drivers AS target
      USING (SELECT @EmployeeId AS EmployeeId) AS source
      ON target.EmployeeId = source.EmployeeId
      WHEN MATCHED THEN
        UPDATE SET
          [No] = @No, LoginId = @LoginId, [Password] = @Password, [Name] = @Name,
          Designation = @Designation, Depot = @Depot, DepotName = @DepotName,
          LicenseType = @LicenseType, Phone = @Phone, DateCreated = @DateCreated,
          [Status] = @Status, AvatarUrl = @AvatarUrl, FailedAttempts = @FailedAttempts,
          UpdatedAt = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (EmployeeId, [No], LoginId, [Password], [Name], Designation, Depot,
                DepotName, LicenseType, Phone, DateCreated, [Status], AvatarUrl, FailedAttempts)
        VALUES (@EmployeeId, @No, @LoginId, @Password, @Name, @Designation, @Depot,
                @DepotName, @LicenseType, @Phone, @DateCreated, @Status, @AvatarUrl, @FailedAttempts);
    `;
  } catch (err) {
    console.error(`[MSSQL Error] dbSaveDriver failed for ${d.employeeId}:`, err);
  }
}

export async function dbDeleteDriver(employeeId: string): Promise<void> {
  if (!isMssqlConnected() || !pool) return;
  try {
    const req = pool.request();
    req.input('EmployeeId', sql.NVarChar(50), employeeId);
    await req.query`DELETE FROM dbo.Drivers WHERE EmployeeId = @EmployeeId`;
  } catch (err) {
    console.error(`[MSSQL Error] dbDeleteDriver failed for ${employeeId}:`, err);
  }
}

// ----------------------------------------------------------------------------
// Database Operations: INSPECTIONS
// ----------------------------------------------------------------------------
export async function dbLoadInspections(): Promise<InspectionRecord[]> {
  if (!isMssqlConnected() || !pool) return [];
  try {
    const result = await pool.request().query`
      SELECT 
        InspectionId AS id,
        CONVERT(NVARCHAR(30), [Timestamp], 127) AS [timestamp],
        FormattedDate AS formattedDate,
        DriverId AS driverId,
        DriverName AS driverName,
        DriverDesignation AS driverDesignation,
        DriverDepot AS driverDepot,
        VehicleNo AS vehicleNo,
        VehicleBrand AS vehicleBrand,
        VehicleModel AS vehicleModel,
        VehicleBranch AS vehicleBranch,
        TruckCategory AS truckCategory,
        [Route] AS [route],
        Odometer AS odometer,
        FuelLevel AS fuelLevel,
        HealthDeclaration AS healthDeclaration,
        OverallResult AS overallResult,
        DefectCount AS defectCount,
        DefectSummary AS defectSummary,
        RawDataJson AS rawDataJson
      FROM dbo.Inspections
      ORDER BY [Timestamp] DESC
    `;

    const records: InspectionRecord[] = [];
    for (const row of result.recordset) {
      if (row.rawDataJson) {
        try {
          const parsed = JSON.parse(row.rawDataJson);
          records.push(parsed);
          continue;
        } catch {
          // fallback to base row
        }
      }
      records.push({
        id: row.id,
        timestamp: row.timestamp,
        formattedDate: row.formattedDate,
        driverId: row.driverId,
        driverName: row.driverName,
        driverDesignation: row.driverDesignation,
        driverDepot: row.driverDepot,
        vehicleNo: row.vehicleNo,
        vehicleBrand: row.vehicleBrand,
        vehicleModel: row.vehicleModel,
        vehicleBranch: row.vehicleBranch,
        truckCategory: row.truckCategory,
        route: row.route,
        odometer: row.odometer,
        fuelLevel: row.fuelLevel,
        healthDeclaration: !!row.healthDeclaration,
        overallResult: row.overallResult,
        defectCount: row.defectCount,
        defectSummary: row.defectSummary,
        items: [],
        photos: [],
      });
    }
    return records;
  } catch (err) {
    console.error('[MSSQL Error] dbLoadInspections failed:', err);
    return [];
  }
}

export async function dbSaveInspection(record: InspectionRecord): Promise<void> {
  if (!isMssqlConnected() || !pool) return;
  try {
    const req = pool.request();
    req.input('InspectionId', sql.NVarChar(50), record.id);
    req.input('Timestamp', sql.DateTime2, new Date(record.timestamp || Date.now()));
    req.input('FormattedDate', sql.NVarChar(50), record.formattedDate || new Date().toLocaleString());
    req.input('DriverId', sql.NVarChar(50), record.driverId || null);
    req.input('DriverName', sql.NVarChar(150), record.driverName || 'Driver');
    req.input('DriverDesignation', sql.NVarChar(50), record.driverDesignation || 'DRIVER');
    req.input('DriverDepot', sql.NVarChar(50), record.driverDepot || 'BL');
    req.input('VehicleNo', sql.NVarChar(50), record.vehicleNo);
    req.input('VehicleBrand', sql.NVarChar(100), record.vehicleBrand || null);
    req.input('VehicleModel', sql.NVarChar(100), record.vehicleModel || null);
    req.input('VehicleBranch', sql.NVarChar(50), record.vehicleBranch || 'BL');
    req.input('TruckCategory', sql.NVarChar(50), record.truckCategory || 'Feeder');
    req.input('Route', sql.NVarChar(150), record.route || null);
    req.input('Odometer', sql.Int, record.odometer || 0);
    req.input('FuelLevel', sql.Int, record.fuelLevel ?? 100);
    req.input('HealthDeclaration', sql.Bit, record.healthDeclaration ? 1 : 0);
    req.input('OverallResult', sql.NVarChar(20), record.overallResult || 'Pass');
    req.input('DefectCount', sql.Int, record.defectCount || 0);
    req.input('DefectSummary', sql.NVarChar(sql.MAX), record.defectSummary || null);
    req.input('GpsLat', sql.Decimal(10, 7), record.gpsLocation?.lat || null);
    req.input('GpsLng', sql.Decimal(10, 7), record.gpsLocation?.lng || null);
    req.input('GpsAccuracy', sql.Decimal(10, 2), record.gpsLocation?.accuracy || null);
    req.input('GpsAddress', sql.NVarChar(500), record.gpsLocation?.address || null);

    const decl = record.driverDeclaration || {};
    req.input('DriverDeclUniform', sql.Bit, decl.uniformAndLicense !== false ? 1 : 0);
    req.input('DriverDeclFit', sql.Bit, decl.fitAndRested !== false ? 1 : 0);
    req.input('DriverDeclSubstanceFree', sql.Bit, decl.substanceFree !== false ? 1 : 0);
    req.input('DriverDeclScheduleRest', sql.Bit, decl.scheduleAndRestAcknowledged !== false ? 1 : 0);
    req.input('DriverDeclCargoSafe', sql.Bit, decl.cargoSafeBDM !== false ? 1 : 0);
    req.input('SignatureData', sql.NVarChar(sql.MAX), record.signature || null);
    req.input('RawDataJson', sql.NVarChar(sql.MAX), JSON.stringify(record));

    await req.query`
      MERGE dbo.Inspections AS target
      USING (SELECT @InspectionId AS InspectionId) AS source
      ON target.InspectionId = source.InspectionId
      WHEN MATCHED THEN
        UPDATE SET
          [Timestamp] = @Timestamp, FormattedDate = @FormattedDate, DriverId = @DriverId,
          DriverName = @DriverName, DriverDesignation = @DriverDesignation, DriverDepot = @DriverDepot,
          VehicleNo = @VehicleNo, VehicleBrand = @VehicleBrand, VehicleModel = @VehicleModel,
          VehicleBranch = @VehicleBranch, TruckCategory = @TruckCategory, [Route] = @Route,
          Odometer = @Odometer, FuelLevel = @FuelLevel, HealthDeclaration = @HealthDeclaration,
          OverallResult = @OverallResult, DefectCount = @DefectCount, DefectSummary = @DefectSummary,
          GpsLat = @GpsLat, GpsLng = @GpsLng, GpsAccuracy = @GpsAccuracy, GpsAddress = @GpsAddress,
          DriverDeclUniform = @DriverDeclUniform, DriverDeclFit = @DriverDeclFit,
          DriverDeclSubstanceFree = @DriverDeclSubstanceFree, DriverDeclScheduleRest = @DriverDeclScheduleRest,
          DriverDeclCargoSafe = @DriverDeclCargoSafe, SignatureData = @SignatureData, RawDataJson = @RawDataJson
      WHEN NOT MATCHED THEN
        INSERT (InspectionId, [Timestamp], FormattedDate, DriverId, DriverName, DriverDesignation,
                DriverDepot, VehicleNo, VehicleBrand, VehicleModel, VehicleBranch, TruckCategory,
                [Route], Odometer, FuelLevel, HealthDeclaration, OverallResult, DefectCount,
                DefectSummary, GpsLat, GpsLng, GpsAccuracy, GpsAddress, DriverDeclUniform,
                DriverDeclFit, DriverDeclSubstanceFree, DriverDeclScheduleRest, DriverDeclCargoSafe,
                SignatureData, RawDataJson)
        VALUES (@InspectionId, @Timestamp, @FormattedDate, @DriverId, @DriverName, @DriverDesignation,
                @DriverDepot, @VehicleNo, @VehicleBrand, @VehicleModel, @VehicleBranch, @TruckCategory,
                @Route, @Odometer, @FuelLevel, @HealthDeclaration, @OverallResult, @DefectCount,
                @DefectSummary, @GpsLat, @GpsLng, @GpsAccuracy, @GpsAddress, @DriverDeclUniform,
                @DriverDeclFit, @DriverDeclSubstanceFree, @DriverDeclScheduleRest, @DriverDeclCargoSafe,
                @SignatureData, @RawDataJson);
    `;

    // Also populate normalized child tables: InspectionItems
    if (Array.isArray(record.items) && record.items.length > 0) {
      // Clear old items for this inspection
      await pool.request().input('InspId', sql.NVarChar(50), record.id)
        .query`DELETE FROM dbo.InspectionItems WHERE InspectionId = @InspId`;

      for (const it of record.items) {
        const itemReq = pool.request();
        itemReq.input('InspectionId', sql.NVarChar(50), record.id);
        itemReq.input('ItemKey', sql.NVarChar(100), it.id || 'checkpoint');
        itemReq.input('Code', sql.Int, it.code || 0);
        itemReq.input('Category', sql.NVarChar(100), it.category || null);
        itemReq.input('Title', sql.NVarChar(200), it.title || 'Check');
        itemReq.input('Subtext', sql.NVarChar(500), it.subtext || null);
        itemReq.input('Status', sql.NVarChar(20), it.status || 'Pass');
        itemReq.input('DefectNote', sql.NVarChar(sql.MAX), it.defectNote || null);
        itemReq.input('PhotoUrl', sql.NVarChar(sql.MAX), it.photoUrl || null);
        itemReq.input('SystemChecksJson', sql.NVarChar(sql.MAX), it.systemChecks ? JSON.stringify(it.systemChecks) : null);

        await itemReq.query`
          INSERT INTO dbo.InspectionItems (InspectionId, ItemKey, Code, Category, Title, Subtext, [Status], DefectNote, PhotoUrl, SystemChecksJson)
          VALUES (@InspectionId, @ItemKey, @Code, @Category, @Title, @Subtext, @Status, @DefectNote, @PhotoUrl, @SystemChecksJson)
        `;
      }
    }
  } catch (err) {
    console.error(`[MSSQL Error] dbSaveInspection failed for ${record.id}:`, err);
  }
}

export async function dbDeleteInspection(inspectionId: string): Promise<void> {
  if (!isMssqlConnected() || !pool) return;
  try {
    const req = pool.request();
    req.input('InspectionId', sql.NVarChar(50), inspectionId);
    await req.query`DELETE FROM dbo.Inspections WHERE InspectionId = @InspectionId`;
  } catch (err) {
    console.error(`[MSSQL Error] dbDeleteInspection failed for ${inspectionId}:`, err);
  }
}

// ----------------------------------------------------------------------------
// Database Operations: AUDIT LOGS
// ----------------------------------------------------------------------------
export async function dbLoadAuditLogs(): Promise<AuditLog[]> {
  if (!isMssqlConnected() || !pool) return [];
  try {
    const result = await pool.request().query`
      SELECT TOP 200
        LogId AS id,
        CONVERT(NVARCHAR(30), [Timestamp], 127) AS [timestamp],
        EventType AS eventType,
        Operator AS operator,
        IpAddress AS ip,
        Details AS details,
        Severity AS severity
      FROM dbo.AuditLogs
      ORDER BY [Timestamp] DESC
    `;
    return result.recordset as AuditLog[];
  } catch (err) {
    console.error('[MSSQL Error] dbLoadAuditLogs failed:', err);
    return [];
  }
}

export async function dbSaveAuditLog(log: AuditLog): Promise<void> {
  if (!isMssqlConnected() || !pool) return;
  try {
    const req = pool.request();
    req.input('LogId', sql.NVarChar(50), log.id);
    req.input('Timestamp', sql.DateTime2, new Date(log.timestamp || Date.now()));
    req.input('EventType', sql.NVarChar(100), log.eventType);
    req.input('Operator', sql.NVarChar(150), log.operator);
    req.input('IpAddress', sql.NVarChar(50), log.ip || null);
    req.input('Details', sql.NVarChar(sql.MAX), log.details || null);
    req.input('Severity', sql.NVarChar(20), log.severity || 'info');

    await req.query`
      INSERT INTO dbo.AuditLogs (LogId, [Timestamp], EventType, Operator, IpAddress, Details, Severity)
      VALUES (@LogId, @Timestamp, @EventType, @Operator, @IpAddress, @Details, @Severity)
    `;
  } catch (err) {
    console.error(`[MSSQL Error] dbSaveAuditLog failed for ${log.id}:`, err);
  }
}
