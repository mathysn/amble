-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Walk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "startLat" REAL NOT NULL,
    "startLng" REAL NOT NULL,
    "plannedMinutes" INTEGER NOT NULL,
    "distanceKm" REAL NOT NULL,
    "routeGeoJson" TEXT NOT NULL,
    "stepsJson" TEXT NOT NULL DEFAULT '[]',
    "source" TEXT NOT NULL DEFAULT 'synthetic',
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Walk_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Walk" ("completedAt", "createdAt", "deviceId", "distanceKm", "id", "plannedMinutes", "routeGeoJson", "startLat", "startLng", "startedAt", "status") SELECT "completedAt", "createdAt", "deviceId", "distanceKm", "id", "plannedMinutes", "routeGeoJson", "startLat", "startLng", "startedAt", "status" FROM "Walk";
DROP TABLE "Walk";
ALTER TABLE "new_Walk" RENAME TO "Walk";
CREATE INDEX "Walk_deviceId_idx" ON "Walk"("deviceId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
