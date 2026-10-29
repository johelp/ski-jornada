-- CreateTable
CREATE TABLE "Notificacion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "titulo" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'INFO',
    "profesorId" TEXT NOT NULL,
    "enviadaPorId" TEXT NOT NULL,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notificacion_profesorId_fkey" FOREIGN KEY ("profesorId") REFERENCES "Profesor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Notificacion_enviadaPorId_fkey" FOREIGN KEY ("enviadaPorId") REFERENCES "Profesor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConfigEscuela" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "nombre" TEXT NOT NULL DEFAULT 'Escuela de Esquí Sierra Nevada',
    "cif" TEXT NOT NULL DEFAULT 'B12345678',
    "direccion" TEXT NOT NULL DEFAULT 'Sierra Nevada, Granada',
    "telefono" TEXT NOT NULL DEFAULT '958 000 000',
    "email" TEXT NOT NULL DEFAULT '',
    "colorPrimario" TEXT NOT NULL DEFAULT '#0f4c81',
    "updatedAt" DATETIME NOT NULL
);
