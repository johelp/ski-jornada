-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "prefijo" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT NOT NULL DEFAULT 'lectura',
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "ultimoUso" DATETIME,
    "creadaPorId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "eventos" TEXT NOT NULL DEFAULT '*',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "ultimoEstado" INTEGER,
    "ultimoEnvio" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PlanningClase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profesorId" TEXT NOT NULL,
    "fecha" TEXT NOT NULL,
    "horas" REAL NOT NULL,
    "disciplina" TEXT,
    "referencia" TEXT NOT NULL DEFAULT '',
    "fuente" TEXT NOT NULL DEFAULT 'API',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlanningClase_profesorId_fkey" FOREIGN KEY ("profesorId") REFERENCES "Profesor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "PlanningClase_profesorId_fecha_idx" ON "PlanningClase"("profesorId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "PlanningClase_profesorId_fecha_referencia_key" ON "PlanningClase"("profesorId", "fecha", "referencia");
