-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SolicitudLibre" (
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
    "enPlanning" BOOLEAN NOT NULL DEFAULT false,
    "enPlanningAt" DATETIME,
    "enPlanningPorId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SolicitudLibre_profesorId_fkey" FOREIGN KEY ("profesorId") REFERENCES "Profesor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SolicitudLibre" ("aprobadoPor", "comentario", "createdAt", "estado", "fechaFin", "fechaInicio", "fechaRespuesta", "id", "motivo", "observacion", "profesorId") SELECT "aprobadoPor", "comentario", "createdAt", "estado", "fechaFin", "fechaInicio", "fechaRespuesta", "id", "motivo", "observacion", "profesorId" FROM "SolicitudLibre";
DROP TABLE "SolicitudLibre";
ALTER TABLE "new_SolicitudLibre" RENAME TO "SolicitudLibre";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
