-- CreateTable
CREATE TABLE "PracticaRegistro" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profesorId" TEXT NOT NULL,
    "fecha" TEXT NOT NULL,
    "inicio" TEXT NOT NULL,
    "fin" TEXT NOT NULL,
    "horas" REAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "supervisor" TEXT NOT NULL,
    "notas" TEXT,
    "creadoPorId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PracticaRegistro_profesorId_fkey" FOREIGN KEY ("profesorId") REFERENCES "Profesor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlanillaPracticas" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profesorId" TEXT NOT NULL,
    "titulacion" TEXT,
    "entidad" TEXT,
    "horasRequeridas" REAL,
    "observacion" TEXT,
    "cerrada" BOOLEAN NOT NULL DEFAULT false,
    "cerradaAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlanillaPracticas_profesorId_fkey" FOREIGN KEY ("profesorId") REFERENCES "Profesor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
    "avisosWhatsapp" BOOLEAN NOT NULL DEFAULT false,
    "tarifaHora" REAL,
    "adheridoAt" DATETIME,
    "esPrincipal" BOOLEAN NOT NULL DEFAULT false,
    "enPracticas" BOOLEAN NOT NULL DEFAULT false,
    "colaboradorId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Profesor_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Profesor" ("activo", "adheridoAt", "apellidos", "avisosWhatsapp", "colaboradorId", "createdAt", "email", "esPrincipal", "horaRecordatorio", "horasContrato", "id", "nombre", "password", "role", "tarifaHora", "telefono", "tipoJornada") SELECT "activo", "adheridoAt", "apellidos", "avisosWhatsapp", "colaboradorId", "createdAt", "email", "esPrincipal", "horaRecordatorio", "horasContrato", "id", "nombre", "password", "role", "tarifaHora", "telefono", "tipoJornada" FROM "Profesor";
DROP TABLE "Profesor";
ALTER TABLE "new_Profesor" RENAME TO "Profesor";
CREATE UNIQUE INDEX "Profesor_email_key" ON "Profesor"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "PracticaRegistro_profesorId_fecha_idx" ON "PracticaRegistro"("profesorId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "PlanillaPracticas_profesorId_key" ON "PlanillaPracticas"("profesorId");
