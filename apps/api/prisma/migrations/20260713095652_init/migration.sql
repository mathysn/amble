-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Settings" (
    "deviceId" TEXT NOT NULL PRIMARY KEY,
    "defaultLength" INTEGER NOT NULL DEFAULT 30,
    "pace" TEXT NOT NULL DEFAULT 'easy',
    "avoidBusyRoads" BOOLEAN NOT NULL DEFAULT true,
    "includeNiche" BOOLEAN NOT NULL DEFAULT true,
    "includeHidden" BOOLEAN NOT NULL DEFAULT true,
    "includeScenic" BOOLEAN NOT NULL DEFAULT false,
    "units" TEXT NOT NULL DEFAULT 'km',
    CONSTRAINT "Settings_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Curiosity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "osmId" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "blurb" TEXT NOT NULL,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "era" TEXT,
    "neighbourhood" TEXT,
    "meta" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Walk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "startLat" REAL NOT NULL,
    "startLng" REAL NOT NULL,
    "plannedMinutes" INTEGER NOT NULL,
    "distanceKm" REAL NOT NULL,
    "routeGeoJson" TEXT NOT NULL,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Walk_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WalkCuriosity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "walkId" TEXT NOT NULL,
    "curiosityId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "found" BOOLEAN NOT NULL DEFAULT false,
    "detourMin" INTEGER NOT NULL DEFAULT 0,
    "distanceM" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "WalkCuriosity_walkId_fkey" FOREIGN KEY ("walkId") REFERENCES "Walk" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WalkCuriosity_curiosityId_fkey" FOREIGN KEY ("curiosityId") REFERENCES "Curiosity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SavedCuriosity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceId" TEXT NOT NULL,
    "curiosityId" TEXT NOT NULL,
    "savedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SavedCuriosity_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SavedCuriosity_curiosityId_fkey" FOREIGN KEY ("curiosityId") REFERENCES "Curiosity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Device_tokenHash_key" ON "Device"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Curiosity_osmId_key" ON "Curiosity"("osmId");

-- CreateIndex
CREATE INDEX "Curiosity_lat_lng_idx" ON "Curiosity"("lat", "lng");

-- CreateIndex
CREATE INDEX "Walk_deviceId_idx" ON "Walk"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "WalkCuriosity_walkId_curiosityId_key" ON "WalkCuriosity"("walkId", "curiosityId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedCuriosity_deviceId_curiosityId_key" ON "SavedCuriosity"("deviceId", "curiosityId");
