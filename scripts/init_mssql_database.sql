-- ============================================================================
-- Fleet Pre-Trip Inspection System - Clean Recreate & Database Script
-- Target Environment: SSMS / SQL Server 2016+
-- Server: 192.168.1.80 | User: sa
-- Database: FleetInspectionDB
-- ============================================================================

USE master;
GO

-- 1. 彻底清除旧库（如果存在，强制关闭所有连接并删除旧库，避免报错）
IF EXISTS (SELECT name FROM sys.databases WHERE name = N'FleetInspectionDB')
BEGIN
    PRINT 'Closing existing active connections and dropping old FleetInspectionDB...';
    ALTER DATABASE FleetInspectionDB SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE FleetInspectionDB;
    PRINT 'Old FleetInspectionDB dropped successfully.';
END
GO

-- 2. 重新创建全新的空白数据库
PRINT 'Creating fresh FleetInspectionDB...';
CREATE DATABASE FleetInspectionDB;
GO

USE FleetInspectionDB;
GO

-- ============================================================================
-- TABLE 1: Vehicles (车辆档案表)
-- Primary Key: VehicleNo (车牌号，唯一自然键)
-- ============================================================================
CREATE TABLE dbo.Vehicles (
    VehicleNo NVARCHAR(50) NOT NULL,
    [No] INT NULL,
    CardNo NVARCHAR(100) NULL,
    PinNo NVARCHAR(50) NULL,
    Litre DECIMAL(10, 2) NULL,
    LimitRm DECIMAL(10, 2) NULL,
    Area NVARCHAR(50) NULL,
    Branch NVARCHAR(50) NOT NULL, -- 车站代码 (e.g., BL, KL, KJ, etc.)
    CostCenter NVARCHAR(50) NULL,
    Brand NVARCHAR(100) NULL,
    LogoDate NVARCHAR(50) NULL,
    Advertisement NVARCHAR(255) NULL,
    YearOfMade INT NULL,
    Model NVARCHAR(100) NULL,
    EngineNo NVARCHAR(100) NULL,
    ChassisNo NVARCHAR(100) NULL,
    RegistrationDate NVARCHAR(50) NULL,
    TruckCategory NVARCHAR(50) NOT NULL DEFAULT 'Feeder', -- 'Feeder' 或 'Small Truck'
    Capacity DECIMAL(10, 2) NULL,
    Permit NVARCHAR(100) NULL DEFAULT 'JPJ',
    TyreSize NVARCHAR(50) NULL,
    BatteryType NVARCHAR(50) NULL,
    Ages INT NULL,
    CurrentStatus NVARCHAR(50) NOT NULL DEFAULT 'Pending Inspection', -- 'Ready' | 'Pending Inspection' | 'Grounded'
    CurrentOdometer INT NOT NULL DEFAULT 0,
    AssignedRoute NVARCHAR(150) NULL,
    LastInspectionDate DATETIME2 NULL,
    LastInspectionCode NVARCHAR(50) NULL,
    LastDriverName NVARCHAR(100) NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_Vehicles PRIMARY KEY CLUSTERED (VehicleNo)
);
GO

CREATE NONCLUSTERED INDEX IX_Vehicles_Branch ON dbo.Vehicles(Branch);
CREATE NONCLUSTERED INDEX IX_Vehicles_Status ON dbo.Vehicles(CurrentStatus);
CREATE NONCLUSTERED INDEX IX_Vehicles_Category ON dbo.Vehicles(TruckCategory);
GO

-- ============================================================================
-- TABLE 2: Drivers (司机/业务员信息表)
-- Primary Key: EmployeeId (员工编号 e.g. 'SF7620')
-- Unique Key: LoginId (4位/工号登录标识)
-- ============================================================================
CREATE TABLE dbo.Drivers (
    EmployeeId NVARCHAR(50) NOT NULL,
    [No] INT NULL,
    LoginId NVARCHAR(50) NOT NULL,
    [Password] NVARCHAR(255) NOT NULL DEFAULT 'password',
    [Name] NVARCHAR(150) NOT NULL,
    Designation NVARCHAR(50) NOT NULL DEFAULT 'SALESMAN', -- SALESMAN, SPV, DRIVER
    Depot NVARCHAR(50) NOT NULL,                          -- BL, KL, KJ, etc.
    DepotName NVARCHAR(100) NULL,
    LicenseType NVARCHAR(100) NULL,
    Phone NVARCHAR(50) NULL,
    DateCreated NVARCHAR(50) NULL,
    [Status] CHAR(1) NOT NULL DEFAULT 'A',                -- 'A' = Active, 'I' = Inactive
    AvatarUrl NVARCHAR(500) NULL,
    FailedAttempts INT NOT NULL DEFAULT 0,
    LockedUntil DATETIME2 NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_Drivers PRIMARY KEY CLUSTERED (EmployeeId),
    CONSTRAINT UQ_Drivers_LoginId UNIQUE (LoginId)
);
GO

CREATE NONCLUSTERED INDEX IX_Drivers_Depot ON dbo.Drivers(Depot);
CREATE NONCLUSTERED INDEX IX_Drivers_Status ON dbo.Drivers([Status]);
GO

-- ============================================================================
-- TABLE 3: Inspections (出车检查总单 / 放行证表)
-- Primary Key: InspectionId (e.g. 'INSP-20260930-001')
-- Foreign Keys: VehicleNo -> Vehicles, DriverId -> Drivers
-- ============================================================================
CREATE TABLE dbo.Inspections (
    InspectionId NVARCHAR(50) NOT NULL,
    [Timestamp] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    FormattedDate NVARCHAR(50) NOT NULL,
    DriverId NVARCHAR(50) NULL,
    DriverName NVARCHAR(150) NOT NULL,
    DriverDesignation NVARCHAR(50) NULL,
    DriverDepot NVARCHAR(50) NULL,
    VehicleNo NVARCHAR(50) NOT NULL,
    VehicleBrand NVARCHAR(100) NULL,
    VehicleModel NVARCHAR(100) NULL,
    VehicleBranch NVARCHAR(50) NULL,
    TruckCategory NVARCHAR(50) NULL,
    [Route] NVARCHAR(150) NULL,
    Odometer INT NOT NULL DEFAULT 0,
    FuelLevel INT NOT NULL DEFAULT 100,            -- 0 ~ 100%
    HealthDeclaration BIT NOT NULL DEFAULT 1,      -- 司机健康申报 (1=合规)
    OverallResult NVARCHAR(20) NOT NULL,           -- 'Pass' | 'Fail'
    DefectCount INT NOT NULL DEFAULT 0,
    DefectSummary NVARCHAR(MAX) NULL,
    GpsLat DECIMAL(10, 7) NULL,
    GpsLng DECIMAL(10, 7) NULL,
    GpsAccuracy DECIMAL(10, 2) NULL,
    GpsAddress NVARCHAR(500) NULL,
    -- 司机出车 5 项自律申报 (Driver Declaration)
    DriverDeclUniform BIT NOT NULL DEFAULT 1,
    DriverDeclFit BIT NOT NULL DEFAULT 1,
    DriverDeclSubstanceFree BIT NOT NULL DEFAULT 1,
    DriverDeclScheduleRest BIT NOT NULL DEFAULT 1,
    DriverDeclCargoSafe BIT NOT NULL DEFAULT 1,
    SignatureData NVARCHAR(MAX) NULL,              -- Base64 手写数字签名
    RawDataJson NVARCHAR(MAX) NULL,                -- 完整原始检查结构快照 (JSON 存储保证审计不可篡改)
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_Inspections PRIMARY KEY CLUSTERED (InspectionId),
    CONSTRAINT FK_Inspections_Vehicles FOREIGN KEY (VehicleNo) 
        REFERENCES dbo.Vehicles (VehicleNo) ON UPDATE CASCADE,
    CONSTRAINT FK_Inspections_Drivers FOREIGN KEY (DriverId) 
        REFERENCES dbo.Drivers (EmployeeId) ON UPDATE CASCADE ON DELETE SET NULL
);
GO

CREATE NONCLUSTERED INDEX IX_Inspections_VehicleNo ON dbo.Inspections(VehicleNo);
CREATE NONCLUSTERED INDEX IX_Inspections_DriverId ON dbo.Inspections(DriverId);
CREATE NONCLUSTERED INDEX IX_Inspections_Timestamp ON dbo.Inspections([Timestamp] DESC);
CREATE NONCLUSTERED INDEX IX_Inspections_OverallResult ON dbo.Inspections(OverallResult);
GO

-- ============================================================================
-- TABLE 4: InspectionItems (10点检验明细子表)
-- Foreign Key: InspectionId -> Inspections (级联删除)
-- ============================================================================
CREATE TABLE dbo.InspectionItems (
    ItemId INT IDENTITY(1,1) NOT NULL,
    InspectionId NVARCHAR(50) NOT NULL,
    ItemKey NVARCHAR(100) NOT NULL,               -- e.g. 'lights_indicators', 'emergency_equipment'
    Code INT NOT NULL,                            -- 1 ~ 10
    Category NVARCHAR(100) NULL,
    Title NVARCHAR(200) NOT NULL,
    Subtext NVARCHAR(500) NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Pass',-- 'Pass' | 'Fail' | 'NA'
    DefectNote NVARCHAR(MAX) NULL,
    PhotoUrl NVARCHAR(MAX) NULL,
    SystemChecksJson NVARCHAR(MAX) NULL,          -- 子项详细勾选状态 (JSON 格式，如灯光5项、APAD应急设备各件)
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_InspectionItems PRIMARY KEY CLUSTERED (ItemId),
    CONSTRAINT FK_InspectionItems_Inspections FOREIGN KEY (InspectionId) 
        REFERENCES dbo.Inspections (InspectionId) ON DELETE CASCADE
);
GO

CREATE NONCLUSTERED INDEX IX_InspectionItems_InspectionId ON dbo.InspectionItems(InspectionId);
CREATE NONCLUSTERED INDEX IX_InspectionItems_Code ON dbo.InspectionItems(Code);
GO

-- ============================================================================
-- TABLE 5: InspectionPhotos (出车水印照片与缺陷证明表)
-- Foreign Key: InspectionId -> Inspections (级联删除)
-- ============================================================================
CREATE TABLE dbo.InspectionPhotos (
    PhotoId INT IDENTITY(1,1) NOT NULL,
    InspectionId NVARCHAR(50) NOT NULL,
    SlotIndex INT NULL,                           -- 卡槽索引 0 ~ 5
    SlotName NVARCHAR(100) NULL,                  -- 'Cabin/Odometer', 'Front View', etc.
    PhotoUrl NVARCHAR(MAX) NOT NULL,
    IsDefect BIT NOT NULL DEFAULT 0,
    Caption NVARCHAR(255) NULL,
    GpsLat DECIMAL(10, 7) NULL,
    GpsLng DECIMAL(10, 7) NULL,
    GpsAddress NVARCHAR(500) NULL,
    [Timestamp] DATETIME2 NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_InspectionPhotos PRIMARY KEY CLUSTERED (PhotoId),
    CONSTRAINT FK_InspectionPhotos_Inspections FOREIGN KEY (InspectionId) 
        REFERENCES dbo.Inspections (InspectionId) ON DELETE CASCADE
);
GO

CREATE NONCLUSTERED INDEX IX_InspectionPhotos_InspectionId ON dbo.InspectionPhotos(InspectionId);
GO

-- ============================================================================
-- TABLE 6: AuditLogs (系统操作与调度审核安全审计日志)
-- Primary Key: LogId (e.g. 'LOG-MTTSRZIF-488')
-- ============================================================================
CREATE TABLE dbo.AuditLogs (
    LogId NVARCHAR(50) NOT NULL,
    [Timestamp] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    EventType NVARCHAR(100) NOT NULL,             -- 'ADMIN_LOGIN', 'INSPECTION_SUBMIT', etc.
    Operator NVARCHAR(150) NOT NULL,
    IpAddress NVARCHAR(50) NULL,
    Details NVARCHAR(MAX) NULL,
    Severity NVARCHAR(20) NOT NULL DEFAULT 'info',-- 'info' | 'warning' | 'danger' | 'success'
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_AuditLogs PRIMARY KEY CLUSTERED (LogId)
);
GO

CREATE NONCLUSTERED INDEX IX_AuditLogs_Timestamp ON dbo.AuditLogs([Timestamp] DESC);
CREATE NONCLUSTERED INDEX IX_AuditLogs_EventType ON dbo.AuditLogs(EventType);
GO

-- ============================================================================
-- TABLE 7: SystemSettings (系统与调度全局配置表)
-- ============================================================================
CREATE TABLE dbo.SystemSettings (
    SettingKey NVARCHAR(100) NOT NULL,
    SettingValue NVARCHAR(MAX) NULL,
    UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_SystemSettings PRIMARY KEY CLUSTERED (SettingKey)
);
GO

-- ============================================================================
-- 3. SEED DATA (初始数据迁移：车辆与司机数据)
-- ============================================================================

PRINT 'Seeding initial Vehicles...';
INSERT INTO dbo.Vehicles (
    VehicleNo, [No], CardNo, PinNo, Litre, LimitRm, Area, Branch, CostCenter, Brand, LogoDate, Advertisement,
    YearOfMade, Model, EngineNo, ChassisNo, RegistrationDate, TruckCategory, Capacity, Permit, TyreSize,
    BatteryType, Ages, CurrentStatus, CurrentOdometer, AssignedRoute
) VALUES
    ('VBP7514', 123, '7002841-710588-020137', '2165', 30.00, 134.00, 'PG01', 'PG', 'PG1200', 'HINO', '3/23/2026', 'Mighty White Enriched 500g', 2023, 'GDY231R-HBMLP3', '1GD9126442', 'PLHAGP6EX02100140', '3/23/2023', 'Feeder', 2280.00, 'JPJ', '195R15C', '95D31L', 3, 'Ready', 58200, 'Route PG-Penang-01'),
    ('VKV3865', 153, '7002841-710588-020434', '1571', 26.00, 116.00, 'SB01', 'SB', 'SB1200', 'HINO', '7/11/2023', 'Black Pepper Chicken Bun', 2023, 'GDY231R-HBMLP3', '1GD9086692', 'PLHAGP6E002100028', '7/6/2023', 'Feeder', 2280.00, 'JPJ', '195/75R15', '95D31L', 3, 'Pending Inspection', 62400, 'Route SB-Seremban-01'),
    ('VJ8971', 173, '7002841-710588-018370', '5517', 20.00, 89.00, 'IP01', 'IP', 'IP1200', 'Isuzu', '2/16/2023', 'MW Loaf', 2016, 'NKR55UEEH', '4JB12M3232', 'PLZNKR55EAP113214', '12/23/2016', 'Small Truck', 2771.00, 'JPJ', '700 x 16', 'N70Z', 10, 'Ready', 195200, 'Route IP-Ipoh-01'),
    ('VQR2765', 240, '7002841-500092-001826', '6837', 24.00, 107.00, 'LN01', 'LN', 'LN1200', 'HINO', '3/25/2026', 'Mighty Slice 6pcs', 2026, 'GDY231R-HBMLP3', '1GD9564813', 'PLHAGP6EX02100599', '3/25/2026', 'Feeder', 2754.00, 'JPJ', '195R15C', '95D31L', 1, 'Ready', 12400, 'Route LN-Lumut-01'),
    ('WA8956C', 360, '7002841-710588-020830', '9711', 23.00, 103.00, 'JB01', 'JB', 'J21200', 'Isuzu', '5/6/2025', 'Mighty Slice', 2013, 'NKR55UEET-B', '4JB11A6575', 'JAANKR55EC7104800', '6/2/2014', 'Small Truck', 2771.00, 'JPJ', '700 x 16', 'N70Z', 13, 'Ready', 241900, 'Route JB-Skudai-01');
GO

PRINT 'Seeding initial Drivers...';
INSERT INTO dbo.Drivers (
    EmployeeId, [No], LoginId, [Password], [Name], Designation, Depot, DepotName, LicenseType, Phone, DateCreated, [Status], AvatarUrl
) VALUES
    ('SF7620', 1, '7620', 'password', N'AZIMUL AMRI BIN CHE SHA''ARI', 'SALESMAN', 'BL', 'BALAKONG', 'GDL / Class E Heavy', '+60 12-384 7620', '17/1/2026', 'A', 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80'),
    ('SF7662', 2, '7662', 'password', N'MOHAD NIZAI BIN MOHAD ZAINI', 'SALESMAN', 'BL', 'BALAKONG', 'GDL / Class D & E', '+60 13-912 7662', '12/2/2026', 'A', 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=120&auto=format&fit=crop&q=80'),
    ('SF7678', 3, '7678', 'password', N'KHAIRIL HAZWAN BIN SAFRI', 'SALESMAN', 'BL', 'BALAKONG', 'GDL Rigid Heavy', '+60 17-482 7678', '24/2/2026', 'A', 'https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=120&auto=format&fit=crop&q=80'),
    ('SF7684', 4, '7684', 'password', N'AMIRUL ISWAN BIN RADZALI', 'SALESMAN', 'BL', 'BALAKONG', 'GDL / Class E', '+60 11-239 7684', '3/3/2026', 'A', 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=120&auto=format&fit=crop&q=80'),
    ('SNS5519', 5, '5519A', 'password', N'ABDUL AZIM BIN ABDUL WAHID', 'SPV', 'BL', 'BALAKONG', 'Lead Supervisor / Class E', '+60 19-382 5519', '3/4/2026', 'A', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80'),
    ('SNS4573A', 6, '4573A', 'password', N'FADIRULHANIFAHERMANUDDIN BIN ANUAR', 'SPV', 'BL', 'BALAKONG', 'Supervisor GDL', '+60 12-887 4573', '3/4/2026', 'A', 'https://images.unsplash.com/photo-1628157582853-a796fa650a6a?w=120&auto=format&fit=crop&q=80'),
    ('SF7714', 7, '7714', 'password', N'WAN HASIMI BIN WAN IDRIS', 'SALESMAN', 'BL', 'BALAKONG', 'GDL / Class E Heavy', '+60 13-332 7714', '1/4/2026', 'A', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80'),
    ('SKD6230A', 10, '6230A', 'password', N'Wan Nor Ammar Aniq Bin Wan Mohd Nor', 'SPV', 'BL', 'BALAKONG', 'Field Supervisor GDL', '+60 14-551 6230', '20/4/2026', 'A', 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=120&auto=format&fit=crop&q=80'),
    ('SF7795', 19, '7795', 'password', N'CHOONG KAH KEAT', 'SALESMAN', 'BL', 'BALAKONG', 'GDL Rigid', '+60 16-229 7795', '4/5/2026', 'A', 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=120&auto=format&fit=crop&q=80'),
    ('SF7967', 26, '7967', 'password', N'ABDUL MUHAYMIN BIN JAMIT', 'SALESMAN', 'BL', 'BALAKONG', 'GDL / Class E Heavy', '+60 19-445 7967', '6/8/2026', 'A', 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=120&auto=format&fit=crop&q=80'),
    ('KL8801', 27, '8801', 'password', N'AHMAD FAIZAL BIN HASSAN', 'DRIVER', 'KL', 'KUALA LUMPUR', 'GDL Heavy / Class E', '+60 12-901 8801', '10/1/2026', 'A', 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&auto=format&fit=crop&q=80'),
    ('KJ8802', 28, '8802', 'password', N'SURESH A/L RAMASAMY', 'DRIVER', 'KJ', 'KELANA JAYA', 'GDL Heavy', '+60 17-334 8802', '15/1/2026', 'A', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80');
GO

PRINT 'Seeding SystemSettings...';
IF NOT EXISTS (SELECT 1 FROM dbo.SystemSettings WHERE SettingKey = 'PublicBaseUrl')
BEGIN
    INSERT INTO dbo.SystemSettings (SettingKey, SettingValue) VALUES ('PublicBaseUrl', 'http://192.168.1.80:3000');
END
GO

-- ============================================================================
-- 4. VERIFICATION QUERY (执行完成后返回各表行数统计)
-- ============================================================================
PRINT '==================================================';
PRINT 'FleetInspectionDB Database Recreated & Initialized Successfully!';
PRINT '==================================================';

SELECT 'Vehicles' AS TableName, COUNT(*) AS TotalCount FROM dbo.Vehicles
UNION ALL
SELECT 'Drivers', COUNT(*) FROM dbo.Drivers
UNION ALL
SELECT 'Inspections', COUNT(*) FROM dbo.Inspections
UNION ALL
SELECT 'InspectionItems', COUNT(*) FROM dbo.InspectionItems
UNION ALL
SELECT 'InspectionPhotos', COUNT(*) FROM dbo.InspectionPhotos
UNION ALL
SELECT 'AuditLogs', COUNT(*) FROM dbo.AuditLogs
UNION ALL
SELECT 'SystemSettings', COUNT(*) FROM dbo.SystemSettings;
GO
