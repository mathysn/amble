-- AlterTable
ALTER TABLE "Curiosity" ADD COLUMN "detailsAt" DATETIME;
ALTER TABLE "Curiosity" ADD COLUMN "detailsJson" TEXT;

-- AlterTable
ALTER TABLE "Walk" ADD COLUMN "endLabel" TEXT;
ALTER TABLE "Walk" ADD COLUMN "endLat" REAL;
ALTER TABLE "Walk" ADD COLUMN "endLng" REAL;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Settings" (
    "deviceId" TEXT NOT NULL PRIMARY KEY,
    "defaultLength" INTEGER NOT NULL DEFAULT 40,
    "pace" TEXT NOT NULL DEFAULT 'easy',
    "avoidBusyRoads" BOOLEAN NOT NULL DEFAULT true,
    "includeNiche" BOOLEAN NOT NULL DEFAULT true,
    "includeHidden" BOOLEAN NOT NULL DEFAULT true,
    "includeScenic" BOOLEAN NOT NULL DEFAULT false,
    "units" TEXT NOT NULL DEFAULT 'km',
    CONSTRAINT "Settings_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Settings" ("avoidBusyRoads", "defaultLength", "deviceId", "includeHidden", "includeNiche", "includeScenic", "pace", "units") SELECT "avoidBusyRoads", "defaultLength", "deviceId", "includeHidden", "includeNiche", "includeScenic", "pace", "units" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
