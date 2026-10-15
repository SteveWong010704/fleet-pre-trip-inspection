-- ============================================================================
-- FLEET PRE-TRIP INSPECTION SYSTEM - DATABASE ARCHITECTURE ENHANCEMENT & MIGRATION
-- Target: Microsoft SQL Server (SSMS) 2016+ / Azure SQL
-- Database: FleetInspectionDB / FleetInspectionDB_Test
-- ============================================================================

USE FleetInspectionDB_Test;
GO

PRINT '============================================================================';
PRINT 'STEP 1: Schema Optimization & New Column Provisioning';
PRINT '============================================================================';

-- 1.1 Add PrimaryPhotoUrl & PhotoCount to dbo.Inspections
IF COL_LENGTH('dbo.Inspections', 'PrimaryPhotoUrl') IS NULL
BEGIN
    PRINT 'Adding PrimaryPhotoUrl to dbo.Inspections...';
    ALTER TABLE dbo.Inspections ADD PrimaryPhotoUrl NVARCHAR(MAX) NULL;
END
GO

IF COL_LENGTH('dbo.Inspections', 'PhotoCount') IS NULL
BEGIN
    PRINT 'Adding PhotoCount to dbo.Inspections...';
    ALTER TABLE dbo.Inspections ADD PhotoCount INT NOT NULL DEFAULT 0;
END
GO

-- 1.2 Ensure dbo.InspectionPhotos table exists with proper normalized schema
IF OBJECT_ID('dbo.InspectionPhotos', 'U') IS NULL
BEGIN
    PRINT 'Creating normalized dbo.InspectionPhotos table with foreign key to dbo.Inspections...';
    CREATE TABLE dbo.InspectionPhotos (
        PhotoId INT IDENTITY(1,1) NOT NULL,
        InspectionId NVARCHAR(50) NOT NULL,
        ItemKey NVARCHAR(100) NULL,                   -- 'tires_wheels', 'brake_system', etc.
        ItemTitle NVARCHAR(200) NULL,                 -- Human-readable item title
        SlotIndex INT NULL,                           -- Card slot (e.g. 0=Front-L, 1=Front-R, etc.)
        SlotName NVARCHAR(100) NULL,                  -- 'Front-Left Tyre', 'Engine Oil', etc.
        PhotoUrl NVARCHAR(MAX) NOT NULL,              -- On-disk relative storage URL or CDN URL
        IsDefect BIT NOT NULL DEFAULT 0,              -- 1 if flagged as safety defect proof
        Caption NVARCHAR(255) NULL,                   -- Driver defect remark or checkpoint title
        GpsLat DECIMAL(10, 7) NULL,
        GpsLng DECIMAL(10, 7) NULL,
        GpsAddress NVARCHAR(500) NULL,
        [Timestamp] DATETIME2 NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_InspectionPhotos PRIMARY KEY CLUSTERED (PhotoId),
        CONSTRAINT FK_InspectionPhotos_Inspections FOREIGN KEY (InspectionId) 
            REFERENCES dbo.Inspections (InspectionId) ON DELETE CASCADE
    );
END
ELSE
BEGIN
    PRINT 'Verifying dbo.InspectionPhotos columns...';
    IF COL_LENGTH('dbo.InspectionPhotos', 'ItemKey') IS NULL
        ALTER TABLE dbo.InspectionPhotos ADD ItemKey NVARCHAR(100) NULL;
    IF COL_LENGTH('dbo.InspectionPhotos', 'ItemTitle') IS NULL
        ALTER TABLE dbo.InspectionPhotos ADD ItemTitle NVARCHAR(200) NULL;
END
GO

-- 1.3 High-Performance Indexing Strategy
PRINT 'Optimizing database index paths for high-concurrency lookups...';

-- Fast vehicle daily inspection check (avoids full table scan)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Inspections_VehicleNo_Timestamp' AND object_id = OBJECT_ID('dbo.Inspections'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_Inspections_VehicleNo_Timestamp 
    ON dbo.Inspections(VehicleNo, [Timestamp] DESC);
END

-- Fast driver daily inspection check (for 1-daily limit / supervisor 3-daily limit)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Inspections_DriverId_Timestamp' AND object_id = OBJECT_ID('dbo.Inspections'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_Inspections_DriverId_Timestamp 
    ON dbo.Inspections(DriverId, [Timestamp] DESC);
END

-- Fast depot filter
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Inspections_Branch_Timestamp' AND object_id = OBJECT_ID('dbo.Inspections'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_Inspections_Branch_Timestamp 
    ON dbo.Inspections(VehicleBranch, [Timestamp] DESC);
END

-- Foreign Key Lookup index on InspectionPhotos
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_InspectionPhotos_InspectionId' AND object_id = OBJECT_ID('dbo.InspectionPhotos'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_InspectionPhotos_InspectionId 
    ON dbo.InspectionPhotos(InspectionId);
END

-- Filtered Index for Defect Evidence Photos (fast retrieval of grounded parts proof)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_InspectionPhotos_Defects' AND object_id = OBJECT_ID('dbo.InspectionPhotos'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_InspectionPhotos_Defects 
    ON dbo.InspectionPhotos(InspectionId) 
    INCLUDE (PhotoUrl, ItemKey, Caption) 
    WHERE IsDefect = 1;
END
GO

PRINT '============================================================================';
PRINT 'STEP 2: Historical Data Extraction (RawDataJson -> InspectionPhotos)';
PRINT '============================================================================';

-- 2.1 Extract legacy photos stored in RawDataJson into dbo.InspectionPhotos
PRINT 'Extracting legacy photos from RawDataJson into dbo.InspectionPhotos...';
INSERT INTO dbo.InspectionPhotos (
    InspectionId,
    ItemKey,
    ItemTitle,
    SlotIndex,
    SlotName,
    PhotoUrl,
    IsDefect,
    Caption,
    GpsLat,
    GpsLng,
    GpsAddress,
    [Timestamp]
)
SELECT
    i.InspectionId,
    p.itemId,
    p.itemTitle,
    p.slotIndex,
    p.slotName,
    p.url,
    ISNULL(p.isDefect, 0),
    p.caption,
    p.gpsLat,
    p.gpsLng,
    p.gpsAddress,
    TRY_CAST(p.photoTimestamp AS DATETIME2)
FROM dbo.Inspections i
CROSS APPLY OPENJSON(i.RawDataJson, '$.photos')
WITH (
    url NVARCHAR(MAX) '$.url',
    itemId NVARCHAR(100) '$.itemId',
    itemTitle NVARCHAR(200) '$.itemTitle',
    slotIndex INT '$.slotIndex',
    slotName NVARCHAR(100) '$.slotName',
    isDefect BIT '$.isDefect',
    caption NVARCHAR(255) '$.caption',
    photoTimestamp NVARCHAR(50) '$.timestamp',
    gpsLat DECIMAL(10,7) '$.gps.lat',
    gpsLng DECIMAL(10,7) '$.gps.lng',
    gpsAddress NVARCHAR(500) '$.gps.address'
) AS p
WHERE p.url IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM dbo.InspectionPhotos ip
      WHERE ip.InspectionId = i.InspectionId AND ip.PhotoUrl = p.url
  );

PRINT CONVERT(VARCHAR(20), @@ROWCOUNT) + ' legacy photos successfully migrated into dbo.InspectionPhotos.';
GO

-- 2.2 Populate PrimaryPhotoUrl & PhotoCount on dbo.Inspections for direct fast queries
PRINT 'Updating PrimaryPhotoUrl and PhotoCount on dbo.Inspections...';
UPDATE i
SET i.PrimaryPhotoUrl = COALESCE(
    (SELECT TOP 1 ip.PhotoUrl FROM dbo.InspectionPhotos ip WHERE ip.InspectionId = i.InspectionId ORDER BY ip.PhotoId ASC),
    JSON_VALUE(i.RawDataJson, '$.photos[0].url')
),
i.PhotoCount = (
    SELECT COUNT(1) FROM dbo.InspectionPhotos ip WHERE ip.InspectionId = i.InspectionId
)
FROM dbo.Inspections i
WHERE i.PrimaryPhotoUrl IS NULL OR i.PhotoCount = 0;

PRINT CONVERT(VARCHAR(20), @@ROWCOUNT) + ' inspection records updated with PrimaryPhotoUrl and PhotoCount.';
GO

PRINT '============================================================================';
PRINT 'STEP 3: Defect Audit Reporting SQL View (Good vs Grounded Matrix)';
PRINT '============================================================================';

-- Create or update a unified audit reporting view that extracts every defect part
IF OBJECT_ID('dbo.vw_InspectionDefectAuditSummary', 'V') IS NOT NULL
    DROP VIEW dbo.vw_InspectionDefectAuditSummary;
GO

CREATE VIEW dbo.vw_InspectionDefectAuditSummary
AS
SELECT
    i.InspectionId,
    i.[Timestamp],
    i.FormattedDate,
    i.VehicleNo,
    i.VehicleBrand,
    i.VehicleModel,
    i.VehicleBranch,
    i.TruckCategory,
    i.[Route],
    i.DriverId,
    i.DriverName,
    i.Odometer,
    i.FuelLevel,
    CASE WHEN i.OverallResult = 'Pass' THEN 'Ready' ELSE 'Grounded' END AS VehicleStatus,
    i.OverallResult,
    i.DefectCount,
    i.DefectSummary,
    i.PrimaryPhotoUrl,
    i.PhotoCount,
    i.GpsAddress,
    -- Defect status for key checkpoints
    COALESCE(
        (SELECT CASE WHEN [Status] = 'Fail' THEN 'GROUNDED: ' + ISNULL(DefectNote, 'Defect') ELSE 'Good' END 
         FROM dbo.InspectionItems WHERE InspectionId = i.InspectionId AND ItemKey = 'tires_wheels'),
        'Good'
    ) AS [Status_Tires_Wheels],
    COALESCE(
        (SELECT CASE WHEN [Status] = 'Fail' THEN 'GROUNDED: ' + ISNULL(DefectNote, 'Defect') ELSE 'Good' END 
         FROM dbo.InspectionItems WHERE InspectionId = i.InspectionId AND ItemKey = 'brake_system'),
        'Good'
    ) AS [Status_Brake_System],
    COALESCE(
        (SELECT CASE WHEN [Status] = 'Fail' THEN 'GROUNDED: ' + ISNULL(DefectNote, 'Defect') ELSE 'Good' END 
         FROM dbo.InspectionItems WHERE InspectionId = i.InspectionId AND ItemKey = 'lights_indicators'),
        'Good'
    ) AS [Status_Lights_Indicators],
    COALESCE(
        (SELECT CASE WHEN [Status] = 'Fail' THEN 'GROUNDED: ' + ISNULL(DefectNote, 'Defect') ELSE 'Good' END 
         FROM dbo.InspectionItems WHERE InspectionId = i.InspectionId AND ItemKey = 'steering_handling'),
        'Good'
    ) AS [Status_Steering_Handling],
    COALESCE(
        (SELECT CASE WHEN [Status] = 'Fail' THEN 'GROUNDED: ' + ISNULL(DefectNote, 'Defect') ELSE 'Good' END 
         FROM dbo.InspectionItems WHERE InspectionId = i.InspectionId AND ItemKey = 'radiator_coolant'),
        'Good'
    ) AS [Status_Radiator_Coolant],
    COALESCE(
        (SELECT CASE WHEN [Status] = 'Fail' THEN 'GROUNDED: ' + ISNULL(DefectNote, 'Defect') ELSE 'Good' END 
         FROM dbo.InspectionItems WHERE InspectionId = i.InspectionId AND ItemKey = 'fluids_powertrain'),
        'Good'
    ) AS [Status_Fluids_Powertrain],
    COALESCE(
        (SELECT CASE WHEN [Status] = 'Fail' THEN 'GROUNDED: ' + ISNULL(DefectNote, 'Defect') ELSE 'Good' END 
         FROM dbo.InspectionItems WHERE InspectionId = i.InspectionId AND ItemKey = 'diesel_fuel_cap'),
        'Good'
    ) AS [Status_Diesel_Fuel_Cap],
    COALESCE(
        (SELECT CASE WHEN [Status] = 'Fail' THEN 'GROUNDED: ' + ISNULL(DefectNote, 'Defect') ELSE 'Good' END 
         FROM dbo.InspectionItems WHERE InspectionId = i.InspectionId AND ItemKey = 'emergency_equipment'),
        'Good'
    ) AS [Status_Emergency_Equipment],
    COALESCE(
        (SELECT CASE WHEN [Status] = 'Fail' THEN 'GROUNDED: ' + ISNULL(DefectNote, 'Defect') ELSE 'Good' END 
         FROM dbo.InspectionItems WHERE InspectionId = i.InspectionId AND ItemKey = 'body_passenger_doors'),
        'Good'
    ) AS [Status_Cargo_Body],
    COALESCE(
        (SELECT CASE WHEN [Status] = 'Fail' THEN 'GROUNDED: ' + ISNULL(DefectNote, 'Defect') ELSE 'Good' END 
         FROM dbo.InspectionItems WHERE InspectionId = i.InspectionId AND ItemKey = 'dashboard_warnings'),
        'Good'
    ) AS [Status_Dashboard_Warnings]
FROM dbo.Inspections i;
GO

PRINT '============================================================================';
PRINT 'DB ARCHITECT VERIFICATION SUMMARY';
PRINT '============================================================================';
SELECT 
    (SELECT COUNT(*) FROM dbo.Vehicles) AS TotalVehicles,
    (SELECT COUNT(*) FROM dbo.Drivers) AS TotalDrivers,
    (SELECT COUNT(*) FROM dbo.Inspections) AS TotalInspections,
    (SELECT COUNT(*) FROM dbo.InspectionPhotos) AS TotalInspectionPhotos;
GO
PRINT 'Migration & Optimization Script executed successfully.';
