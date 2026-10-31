-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MagicLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profesorId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "codigoHash" TEXT,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "expiraAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MagicLink_profesorId_fkey" FOREIGN KEY ("profesorId") REFERENCES "Profesor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_MagicLink" ("createdAt", "expiraAt", "id", "profesorId", "tokenHash") SELECT "createdAt", "expiraAt", "id", "profesorId", "tokenHash" FROM "MagicLink";
DROP TABLE "MagicLink";
ALTER TABLE "new_MagicLink" RENAME TO "MagicLink";
CREATE UNIQUE INDEX "MagicLink_tokenHash_key" ON "MagicLink"("tokenHash");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
