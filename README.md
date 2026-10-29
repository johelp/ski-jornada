# Ski Jornada

Web app instalable (PWA) para escuelas de esquí: fichaje de jornada, carga de clases con primas, informes mensuales y económicos, y gestión de profesores. Acceso por enlace mágico (sin contraseña).

- `backend/` — API Node/Express + Prisma (SQLite)
- `frontend/` — React + Vite (PWA)
- `CLAUDE.md` — documentación técnica detallada

## Desarrollo local

```bash
cd backend && cp .env.example .env   # completar JWT_SECRET; PASSWORD_LOGIN=true para entrar sin email
npm install && npx prisma migrate deploy && node prisma/seed.js && node index.js

cd frontend && npm install && npm run dev
```

Sin SMTP configurado, el enlace de acceso se imprime en la consola del backend.

## Deploy (Railway + Cloudflare Pages + Resend)

- **Backend (Railway)**: Root Directory `backend`, volumen en `/data`. Variables: `JWT_SECRET`, `FRONTEND_URL=https://skijornada.johelpastorino.com`, `ADMIN_EMAIL`, `DATABASE_URL=file:/data/prod.db`, `UPLOAD_DIR=/data/uploads`, `RESEND_API_KEY`, `EMAIL_FROM`. Dominio sugerido: `api.skijornada.johelpastorino.com`.
- **Frontend (Cloudflare Pages)**: root `frontend`, build `npm run build`, salida `dist`, variable `VITE_API_URL=https://api.skijornada.johelpastorino.com`. Dominio: `skijornada.johelpastorino.com`.
- **Correo (Resend)**: verificar el dominio en resend.com/domains (registros SPF/DKIM en el DNS) y usar `EMAIL_FROM=Ski Jornada <no-reply@skijornada.johelpastorino.com>`.
