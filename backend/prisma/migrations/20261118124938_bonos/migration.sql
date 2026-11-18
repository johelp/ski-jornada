-- CreateTable
CREATE TABLE "Bono" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "codigo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "unidad" TEXT NOT NULL,
    "valorInicial" REAL NOT NULL,
    "saldo" REAL NOT NULL,
    "titularNombre" TEXT,
    "titularEmail" TEXT,
    "titularTelefono" TEXT,
    "concepto" TEXT,
    "notas" TEXT,
    "emitidoAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "venceAt" DATETIME,
    "anulado" BOOLEAN NOT NULL DEFAULT false,
    "anuladoAt" DATETIME,
    "anuladoMotivo" TEXT,
    "creadoPorId" TEXT
);

-- CreateTable
CREATE TABLE "MovimientoBono" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bonoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "cantidad" REAL NOT NULL,
    "saldoDespues" REAL NOT NULL,
    "referencia" TEXT,
    "nota" TEXT,
    "porId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MovimientoBono_bonoId_fkey" FOREIGN KEY ("bonoId") REFERENCES "Bono" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Bono_codigo_key" ON "Bono"("codigo");

-- CreateIndex
CREATE INDEX "Bono_venceAt_idx" ON "Bono"("venceAt");

-- CreateIndex
CREATE INDEX "MovimientoBono_bonoId_createdAt_idx" ON "MovimientoBono"("bonoId", "createdAt");
