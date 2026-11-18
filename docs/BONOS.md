# Bonos y giftcards

Desde la versión 1.5.0. Módulo **apagable** (*Config → Módulos → Bonos y giftcards*). Solo lo gestiona administración.

## Para qué sirve

- **Bono**: valor que el cliente ya abonó. Ejemplo típico: al cerrar la estación se emite un bono con las clases ya cobradas (por horas) o con el importe pagado (en euros), para usarlas después.
- **Giftcard**: tarjeta regalo por un importe o por horas.
- Ambos llevan un **código de seguimiento** (`BONO-XXXX-XXXX` o `GIFT-XXXX-XXXX`), un **saldo** y un **vencimiento opcional**. Se **consumen** desde la app cuando la reserva ya está cargada en el software de reservas; la app no sustituye a ese software, lo acompaña.

## Emitir

*Bonos → + Emitir.*

| Campo | Notas |
|-------|-------|
| Tipo | Bono o giftcard |
| Vale por | **Euros** o **horas de clase** (no se mezclan en un mismo bono) |
| Valor | Mayor que 0, hasta 2 decimales (p. ej. 2,5 h; 100,50 €) |
| Vencimiento | A los *N* **meses** o **días** de hoy · en una **fecha concreta** (se incluye ese día) · **sin vencimiento** |
| Concepto | Texto libre: «Cierre de temporada 2026: 10 h de clases particulares» |
| Titular | Opcional: nombre, email y teléfono. Guarda solo lo necesario |

El vencimiento por duración se cuenta desde la emisión y termina al **final del día** (31 ene + 1 mes = 28 feb). El código se genera solo, sin caracteres ambiguos (sin 0/O, 1/I/L), y se puede **copiar** o **imprimir** (ficha con el código y el valor para entregar al cliente).

## Estados

| Estado | Cuándo |
|--------|--------|
| Activo | Tiene saldo, no venció y no está anulado |
| Agotado | Saldo 0 (un bono agotado no «vence») |
| Vencido | Pasó la fecha de vencimiento con saldo pendiente |
| Anulado | Anulado por administración, con motivo |

## Consumir

*Abrir el bono → Consumir.* Pide:

- **Cantidad** (en la unidad del bono), que no puede superar el saldo.
- **Reserva en el software de reservas** (obligatoria): n.º de reserva o nombre del cliente. Deja constancia de a qué se aplicó.
- Nota (opcional).

No se consume un bono **vencido, agotado o anulado** (error 409). El descuento y la comprobación se hacen juntos, de modo que dos consumos a la vez nunca dejan el saldo en negativo.

## Devolver, editar y anular

- **Devolver saldo**: si se cancela una reserva. Suma al saldo, sin pasar nunca del valor inicial.
- **Editar**: titular, concepto, notas y vencimiento (ampliarlo, acortarlo o quitarlo). **El valor no se edita**: para que quede historial, se consume o se devuelve.
- **Anular**: exige motivo. Un bono anulado no se consume ni se devuelve; se puede **reactivar**.
- Cada bono tiene su **historial** (emisión, consumos con su reserva, devoluciones, anulaciones) y cada acción queda en el registro de actividad (`bono.emitir`, `bono.consumir`, `bono.devolver`, `bono.anular`, `bono.editar`, `bono.reactivar`).

## Panel y exportación

- **Panel:** tarjeta «Bonos que vencen en 30 días» (solo con saldo).
- **Pantalla Bonos:** bonos activos, saldo vivo (€ y h), filtros por estado, búsqueda por **código** (se acepta en minúsculas, con espacios o sin guiones) o por nombre, y **CSV** de todos los bonos.
- **Webhooks:** eventos `bono.emitido` y `bono.consumido` (ver `INTEGRACIONES.md`).

## API

`GET|POST /api/admin/bonos` · `GET /api/admin/bonos/exportar.csv` · `GET /api/admin/bonos/codigo/:codigo` · `GET|PUT /api/admin/bonos/:id` · `POST /api/admin/bonos/:id/consumir|devolver|anular|reactivar`. Detalle en `API.md`.

## Privacidad y aspectos legales

- Los datos del titular son **opcionales** y se tratan para gestionar el bono (ejecución del contrato). Ver el tratamiento 7 en `RGPD.md`. Quien no necesite el nombre, puede emitir el bono solo con código y concepto.
- El código es la «llave» del bono: quien lo conozca puede reclamarlo. Entrégalo solo al titular.
- **Condiciones y vigencia** (plazo mínimo de validez, qué pasa con el saldo no usado, devoluciones, IVA y tratamiento contable de bonos y tarjetas regalo) **dependen de la normativa aplicable y de tu asesor**: revisa los textos y plazos con él antes de venderlos. La app registra el vencimiento que elijas, no lo valida jurídicamente.

## Fuera de alcance por ahora

Consulta pública del saldo por el cliente con su código, envío del bono por correo o WhatsApp, PDF con QR, y consumo automático desde el software de reservas (hoy el consumo es manual). Anotados en `ROADMAP.md`.
