-- AlterTable
ALTER TABLE "ConfirmacionClases" ADD COLUMN "primasJson" TEXT;
ALTER TABLE "ConfirmacionClases" ADD COLUMN "tarifaHora" REAL;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PrimaClase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "importe" REAL,
    "modo" TEXT NOT NULL DEFAULT 'POR_HORA'
);
INSERT INTO "new_PrimaClase" ("activa", "id", "nombre", "orden") SELECT "activa", "id", "nombre", "orden" FROM "PrimaClase";
DROP TABLE "PrimaClase";
ALTER TABLE "new_PrimaClase" RENAME TO "PrimaClase";
CREATE UNIQUE INDEX "PrimaClase_nombre_key" ON "PrimaClase"("nombre");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
