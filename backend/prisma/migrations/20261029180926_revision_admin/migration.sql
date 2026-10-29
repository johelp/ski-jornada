-- AlterTable
ALTER TABLE "ClaseDada" ADD COLUMN "marca" TEXT;
ALTER TABLE "ClaseDada" ADD COLUMN "notaAdmin" TEXT;

-- CreateTable
CREATE TABLE "RevisionMes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profesorId" TEXT NOT NULL,
    "mes" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "nota" TEXT,
    "revisadoPorId" TEXT,
    "revisadoAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RevisionMes_profesorId_fkey" FOREIGN KEY ("profesorId") REFERENCES "Profesor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "RevisionMes_profesorId_mes_key" ON "RevisionMes"("profesorId", "mes");
