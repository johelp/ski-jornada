-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Profesor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellidos" TEXT NOT NULL,
    "password" TEXT NOT NULL DEFAULT '',
    "tipoJornada" TEXT NOT NULL DEFAULT 'COMPLETA',
    "horasContrato" INTEGER NOT NULL DEFAULT 35,
    "role" TEXT NOT NULL DEFAULT 'PROFESOR',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "telefono" TEXT,
    "horaRecordatorio" TEXT NOT NULL DEFAULT '17:00',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Profesor" ("activo", "apellidos", "createdAt", "email", "horasContrato", "id", "nombre", "password", "role", "tipoJornada") SELECT "activo", "apellidos", "createdAt", "email", "horasContrato", "id", "nombre", "password", "role", "tipoJornada" FROM "Profesor";
DROP TABLE "Profesor";
ALTER TABLE "new_Profesor" RENAME TO "Profesor";
CREATE UNIQUE INDEX "Profesor_email_key" ON "Profesor"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
