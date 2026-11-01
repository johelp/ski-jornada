-- CreateTable
CREATE TABLE "Colaborador" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'ESCUELA',
    "cif" TEXT,
    "email" TEXT,
    "telefono" TEXT,
    "contacto" TEXT,
    "tarifaHora" REAL NOT NULL DEFAULT 0,
    "notas" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "MovimientoHoras" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "colaboradorId" TEXT NOT NULL,
    "fecha" TEXT NOT NULL,
    "sentido" TEXT NOT NULL,
    "horas" REAL NOT NULL,
    "tarifaHora" REAL NOT NULL,
    "nota" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "notaColaborador" TEXT,
    "respondidoAt" DATETIME,
    "creadoPorId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MovimientoHoras_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Liquidacion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "colaboradorId" TEXT NOT NULL,
    "fecha" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "horas" REAL NOT NULL,
    "importe" REAL NOT NULL,
    "nota" TEXT,
    "creadoPorId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Liquidacion_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ConfigEscuela" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "nombre" TEXT NOT NULL DEFAULT 'Escuela de Esquí Sierra Nevada',
    "cif" TEXT NOT NULL DEFAULT 'B12345678',
    "direccion" TEXT NOT NULL DEFAULT 'Sierra Nevada, Granada',
    "telefono" TEXT NOT NULL DEFAULT '958 000 000',
    "email" TEXT NOT NULL DEFAULT '',
    "colorPrimario" TEXT NOT NULL DEFAULT '#0f4c81',
    "modulosOff" TEXT NOT NULL DEFAULT '',
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ConfigEscuela" ("cif", "colorPrimario", "direccion", "email", "id", "nombre", "telefono", "updatedAt") SELECT "cif", "colorPrimario", "direccion", "email", "id", "nombre", "telefono", "updatedAt" FROM "ConfigEscuela";
DROP TABLE "ConfigEscuela";
ALTER TABLE "new_ConfigEscuela" RENAME TO "ConfigEscuela";
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
    "colaboradorId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Profesor_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Profesor" ("activo", "adheridoAt", "apellidos", "avisosWhatsapp", "createdAt", "email", "esPrincipal", "horaRecordatorio", "horasContrato", "id", "nombre", "password", "role", "tarifaHora", "telefono", "tipoJornada") SELECT "activo", "adheridoAt", "apellidos", "avisosWhatsapp", "createdAt", "email", "esPrincipal", "horaRecordatorio", "horasContrato", "id", "nombre", "password", "role", "tarifaHora", "telefono", "tipoJornada" FROM "Profesor";
DROP TABLE "Profesor";
ALTER TABLE "new_Profesor" RENAME TO "Profesor";
CREATE UNIQUE INDEX "Profesor_email_key" ON "Profesor"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "MovimientoHoras_colaboradorId_fecha_idx" ON "MovimientoHoras"("colaboradorId", "fecha");

-- CreateIndex
CREATE INDEX "Liquidacion_colaboradorId_fecha_idx" ON "Liquidacion"("colaboradorId", "fecha");
