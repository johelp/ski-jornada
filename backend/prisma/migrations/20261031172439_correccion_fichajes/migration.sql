-- CreateTable
CREATE TABLE "CorreccionFichaje" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "registroId" TEXT NOT NULL,
    "profesorId" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "anterior" TEXT,
    "nuevo" TEXT,
    "motivo" TEXT NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CorreccionFichaje_registroId_fkey" FOREIGN KEY ("registroId") REFERENCES "RegistroJornada" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RegistroJornada" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profesorId" TEXT NOT NULL,
    "zonaId" TEXT NOT NULL,
    "zonaNombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lat" REAL,
    "lng" REAL,
    "distancia" INTEGER,
    "esIncidencia" BOOLEAN NOT NULL DEFAULT false,
    "origen" TEXT NOT NULL DEFAULT 'APP',
    "anulado" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "RegistroJornada_profesorId_fkey" FOREIGN KEY ("profesorId") REFERENCES "Profesor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RegistroJornada_zonaId_fkey" FOREIGN KEY ("zonaId") REFERENCES "ZonaFichaje" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_RegistroJornada" ("distancia", "esIncidencia", "id", "lat", "lng", "profesorId", "timestamp", "tipo", "zonaId", "zonaNombre") SELECT "distancia", "esIncidencia", "id", "lat", "lng", "profesorId", "timestamp", "tipo", "zonaId", "zonaNombre" FROM "RegistroJornada";
DROP TABLE "RegistroJornada";
ALTER TABLE "new_RegistroJornada" RENAME TO "RegistroJornada";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "CorreccionFichaje_profesorId_createdAt_idx" ON "CorreccionFichaje"("profesorId", "createdAt");
