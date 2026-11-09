-- AlterTable
ALTER TABLE "DocumentoLegajo" ADD COLUMN "firmaEstado" TEXT;
ALTER TABLE "DocumentoLegajo" ADD COLUMN "firmaHuella" TEXT;
ALTER TABLE "DocumentoLegajo" ADD COLUMN "firmaInfo" TEXT;

-- AlterTable
ALTER TABLE "FirmaRegistro" ADD COLUMN "firmaEstado" TEXT;
ALTER TABLE "FirmaRegistro" ADD COLUMN "firmaHuella" TEXT;
ALTER TABLE "FirmaRegistro" ADD COLUMN "firmaInfo" TEXT;
