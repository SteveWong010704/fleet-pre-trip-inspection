-- ============================================================================
-- Fleet Management: Add QrToken column and populate static security tokens
-- Safe migration script (DOES NOT DELETE ANY DATA)
-- ============================================================================

USE FleetInspectionDB;
GO

-- 1. Ensure QrToken column exists in dbo.Vehicles
IF COL_LENGTH('dbo.Vehicles', 'QrToken') IS NULL
BEGIN
    PRINT 'Adding QrToken column to dbo.Vehicles...';
    ALTER TABLE dbo.Vehicles ADD QrToken NVARCHAR(50) NULL;
END
GO

-- 2. Populate static 8-character token for any vehicle without one
PRINT 'Populating static QR tokens for existing vehicles...';
UPDATE dbo.Vehicles
SET QrToken = UPPER(SUBSTRING(REPLACE(CONVERT(VARCHAR(40), NEWID()), '-', ''), 1, 8))
WHERE QrToken IS NULL OR LTRIM(RTRIM(QrToken)) = '';
GO

PRINT 'Done! Verification:';
SELECT TOP 10 VehicleNo, Brand, Model, Branch, QrToken FROM dbo.Vehicles;
GO
