-- CreateTable
CREATE TABLE "AceptacionLegal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profesorId" TEXT NOT NULL,
    "documento" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "aceptadoAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AceptacionLegal_profesorId_fkey" FOREIGN KEY ("profesorId") REFERENCES "Profesor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AceptacionLegal_profesorId_documento_version_key" ON "AceptacionLegal"("profesorId", "documento", "version");
