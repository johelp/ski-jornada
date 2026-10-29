-- AlterTable
ALTER TABLE "Profesor" ADD COLUMN "tarifaHora" REAL;

-- CreateTable
CREATE TABLE "TipoClase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "PrimaClase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "ClaseDada" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profesorId" TEXT NOT NULL,
    "fecha" TEXT NOT NULL,
    "horas" REAL NOT NULL,
    "tipoId" TEXT NOT NULL,
    "notas" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ClaseDada_profesorId_fkey" FOREIGN KEY ("profesorId") REFERENCES "Profesor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ClaseDada_tipoId_fkey" FOREIGN KEY ("tipoId") REFERENCES "TipoClase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConfirmacionClases" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profesorId" TEXT NOT NULL,
    "mes" TEXT NOT NULL,
    "confirmadoAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConfirmacionClases_profesorId_fkey" FOREIGN KEY ("profesorId") REFERENCES "Profesor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_ClaseDadaToPrimaClase" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_ClaseDadaToPrimaClase_A_fkey" FOREIGN KEY ("A") REFERENCES "ClaseDada" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_ClaseDadaToPrimaClase_B_fkey" FOREIGN KEY ("B") REFERENCES "PrimaClase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TipoClase_nombre_key" ON "TipoClase"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "PrimaClase_nombre_key" ON "PrimaClase"("nombre");

-- CreateIndex
CREATE INDEX "ClaseDada_profesorId_fecha_idx" ON "ClaseDada"("profesorId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "ConfirmacionClases_profesorId_mes_key" ON "ConfirmacionClases"("profesorId", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "_ClaseDadaToPrimaClase_AB_unique" ON "_ClaseDadaToPrimaClase"("A", "B");

-- CreateIndex
CREATE INDEX "_ClaseDadaToPrimaClase_B_index" ON "_ClaseDadaToPrimaClase"("B");
