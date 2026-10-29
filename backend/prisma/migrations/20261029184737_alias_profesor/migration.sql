-- CreateTable
CREATE TABLE "AliasProfesor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombreExterno" TEXT NOT NULL,
    "profesorId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "AliasProfesor_nombreExterno_key" ON "AliasProfesor"("nombreExterno");
