-- CreateTable
CREATE TABLE "Profesor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellidos" TEXT NOT NULL,
    "password" TEXT NOT NULL DEFAULT '',
    "tipoJornada" TEXT NOT NULL DEFAULT 'COMPLETA',
    "horasContrato" INTEGER NOT NULL DEFAULT 35,
    "role" TEXT NOT NULL DEFAULT 'PROFESOR',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ZonaFichaje" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL DEFAULT '',
    "secret" TEXT NOT NULL DEFAULT '',
    "lat" REAL,
    "lng" REAL,
    "radio" INTEGER NOT NULL DEFAULT 100,
    "validationMode" TEXT NOT NULL DEFAULT 'TOTP_GPS',
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "RegistroJornada" (
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
    CONSTRAINT "RegistroJornada_profesorId_fkey" FOREIGN KEY ("profesorId") REFERENCES "Profesor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RegistroJornada_zonaId_fkey" FOREIGN KEY ("zonaId") REFERENCES "ZonaFichaje" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SolicitudLibre" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profesorId" TEXT NOT NULL,
    "fechaInicio" DATETIME NOT NULL,
    "fechaFin" DATETIME NOT NULL,
    "motivo" TEXT NOT NULL,
    "comentario" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "observacion" TEXT,
    "aprobadoPor" TEXT,
    "fechaRespuesta" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SolicitudLibre_profesorId_fkey" FOREIGN KEY ("profesorId") REFERENCES "Profesor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FirmaRegistro" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profesorId" TEXT NOT NULL,
    "mes" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "emailEnviadoAt" DATETIME,
    "pdfFirmadoPath" TEXT,
    "firmadoAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FirmaRegistro_profesorId_fkey" FOREIGN KEY ("profesorId") REFERENCES "Profesor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DocumentoLegajo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profesorId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "mes" TEXT,
    "archivoPath" TEXT NOT NULL,
    "subidoPor" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "firmaPath" TEXT,
    "firmadoAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocumentoLegajo_profesorId_fkey" FOREIGN KEY ("profesorId") REFERENCES "Profesor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Profesor_email_key" ON "Profesor"("email");

-- CreateIndex
CREATE UNIQUE INDEX "FirmaRegistro_profesorId_mes_key" ON "FirmaRegistro"("profesorId", "mes");
