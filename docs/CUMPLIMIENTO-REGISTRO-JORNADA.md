# Cumplimiento del registro de jornada

> **Análisis técnico-organizativo, no asesoramiento jurídico.** Resume qué exige la normativa española para que el registro horario sea aceptable, qué cubre hoy Ski Jornada y qué queda abierto. Debe validarlo el asesor laboral del cliente. **Verificar antes del piloto** si hay una norma más reciente (se ha anunciado un registro horario digital con requisitos técnicos propios); este documento se basa en el marco vigente conocido: art. 34.9 ET (RDL 8/2019), sentencia TJUE C-55/18 (CCOO/Deutsche Bank), art. 35.5 ET, LISOS y arts. 87 y 90 LOPDGDD.

## 1. Qué exige la normativa

| Requisito | Fuente |
|-----------|--------|
| Registro **diario** de la jornada, con **hora concreta de inicio y fin** de cada persona | Art. 34.9 ET |
| Se organiza y documenta por **negociación colectiva, acuerdo de empresa o decisión del empresario previa consulta a la representación legal** de los trabajadores | Art. 34.9 ET |
| Debe ser **objetivo, fiable y accesible** (sistema que permita medir el tiempo realmente trabajado) | TJUE C-55/18 |
| **Conservar 4 años**, a disposición de trabajadores, representantes e Inspección de Trabajo | Art. 34.9 ET |
| Informar al trabajador del cómputo de **horas extraordinarias** (resumen en el recibo o equivalente) | Art. 35.5 ET |
| Sin registro o con registro inválido: infracción **grave** (multa) | LISOS |
| Si se usan datos de ubicación o videovigilancia: **información previa, proporcionalidad y minimización** | Arts. 87 y 90 LOPDGDD |

## 2. Qué cubre hoy la plataforma

| Requisito | Estado | Cómo |
|-----------|--------|------|
| Hora de inicio y fin diaria por persona | ✅ | Fichajes de entrada y salida (QR, NFC, GPS o ambos), con la zona |
| Fiabilidad / objetividad | ✅ | Marca de tiempo del **servidor**; zona validada por QR rotativo o distancia; incidencia si se ficha fuera de zona |
| Accesible al trabajador | ✅ | Cada persona ve y descarga su informe mensual en PDF |
| Accesible a la representación / Inspección | 🟡 | Administración emite el PDF por persona y la planilla mensual; clave de API de solo lectura si se necesita acceso programático. No hay un perfil «consulta» propio |
| **Conservación de 4 años** | ✅ | Los fichajes **no se borran nunca**: ni se eliminan ni se purgan automáticamente. Una baja desactiva la cuenta y conserva el historial. La supresión a petición respeta los 4 años (`RGPD.md`) |
| **Correcciones trazables** | ✅ nuevo | Administración puede añadir, modificar o **anular** un fichaje; exige un motivo; conserva el valor original, quién y cuándo (`CorreccionFichaje`); el fichaje anulado no se borra, queda marcado; el trabajador recibe un aviso. Quedan en el registro de actividad y en la exportación RGPD |
| Datos personales (RGPD) | ✅ | Información al personal (`legal/INFORMACION-PRIVACIDAD-PERSONAL.md`) con constancia de aceptación; GPS solo en el instante de fichar y por zona |
| Política de fichaje comunicada | 🟡 | Plantilla en `legal/POLITICA-INTERNA-FICHAJE.md`; **la escuela debe consultarla a la representación y comunicarla** |

## 3. Qué falta o hay que decidir

| # | Tema | Situación | Propuesta |
|---|------|-----------|-----------|
| 1 | **Consulta a la representación** | Depende del cliente | Hacerla y guardar la constancia antes de empezar (tabla de la política) |
| 2 | **Turnos que cruzan la medianoche** | El cálculo agrupa por día natural: una entrada a las 23:00 y salida a la 01:00 cuenta como entrada sin salida el primer día | Poco frecuente en la nieve; si hay turnos nocturnos, corregirlo en el cálculo (emparejar por sesión, no por día). **Pendiente** |
| 3 | **Cambio de hora (marzo y octubre)** | Se calcula con marcas de tiempo absolutas, lo que es correcto; el PDF muestra la hora local | Probar el fin de semana del cambio en el piloto |
| 4 | **Confirmación mensual de jornada por el trabajador** | La confirmación mensual existe para las **clases**; la **jornada** se firma con el flujo opcional de firma del PDF | Decidir con el cliente: confirmar en la app o firmar el PDF. Si se quiere, añadir «Confirmar mi registro del mes» |
| 5 | **Resumen de horas extraordinarias** | El informe calcula el **exceso diario** sobre la jornada contratada (horas/5) | Validar con el convenio de Snowmotion cómo se computan (diario, semanal, anual) y cómo se compensan |
| 6 | **Pausas y descansos** | Solo hay entrada y salida por tramo; varios tramos al día se suman | Definir si deben registrarse pausas (bocadillo) o basta con los tramos |
| 7 | **Acceso de la Inspección** | Se atiende por PDF/exportación a petición | Definir el procedimiento y plazo (plantilla: 5 días hábiles) |
| 8 | **Personas que no ficharán desde el móvil** | Administración puede **añadir el fichaje a mano** con motivo | Evitar que sea la norma: dejarlo como excepción |
| 9 | **Colaboradores sin contrato laboral** | El registro obliga a quien tiene relación laboral | Aclarar con el asesor a quién se aplica |

## 4. Procedimiento de corrección (administración)

1. Una persona avisa de un olvido o error (mejor el mismo día).
2. Administración lo comprueba con la persona.
3. Añade, modifica o anula el fichaje en *Informes → Registro individual → Corregir fichajes de este mes*, o por API (`POST/PUT/DELETE /api/admin/fichajes`), **siempre con el motivo**.
4. La persona recibe el aviso; si no está de acuerdo, lo dice por escrito.
5. El historial (original, nuevo, quién, cuándo, motivo) queda con el registro 4 años.

## 5. Lista de verificación antes del piloto

- [ ] Consulta a la representación realizada (o constancia de que no existe) y fecha anotada.
- [ ] Política interna de fichaje comunicada al personal.
- [ ] Información de privacidad entregada y aceptada en la app.
- [ ] Decisiones 4, 5 y 6 de la tabla anterior tomadas con el asesor del cliente.
- [ ] Datos legales de la escuela completos (*Config*) para que salgan en el PDF.
- [ ] Prueba de una corrección completa en el entorno de pruebas.
- [ ] Procedimiento de acceso de Inspección y plazo definidos.
- [ ] Copia de seguridad diaria y descarga semanal funcionando (el registro es prueba legal 4 años).
