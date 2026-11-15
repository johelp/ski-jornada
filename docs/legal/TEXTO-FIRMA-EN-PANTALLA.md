# Firma en pantalla: texto de alcance (para revisión del asesor)

> **Borrador, no es asesoramiento jurídico.** El texto lo debe revisar y validar el asesor legal de cada escuela. Se puede cambiar en `backend/firmaPantalla.js` (constante `NOTA_ALCANCE`) y en el recuadro de `frontend/src/FirmaPantalla.jsx`.

## Qué es
El empleado dibuja su firma en la pantalla. El servidor la estampa en una **página final de «Constancia de recepción y firma en pantalla»** añadida al PDF, con el nombre del firmante, la fecha y hora (hora de España, del servidor), la **huella SHA-256 del documento original** y la nota de alcance. Las páginas originales no se modifican.

Es una **firma electrónica simple**. No se basa en un certificado, no incorpora datos biométricos de la firma (solo una imagen) y no lleva sello de tiempo cualificado.

## Texto que aparece en la constancia
1. *Esta firma es una firma electrónica simple, hecha a mano sobre la pantalla. Deja constancia de que el documento fue recibido y visualizado por la persona indicada, en la fecha y hora señaladas.*
2. *No es una firma electrónica avanzada ni cualificada (no se basa en un certificado electrónico), por lo que no tiene el mismo valor probatorio que estas ni sustituye a una firma con certificado cuando la ley o el contrato la exijan. Si hay discrepancia, su eficacia se valorará junto con el resto de pruebas.*
3. *La huella SHA-256 permite comprobar que el documento original no ha cambiado desde que se firmó.*

Y, junto al botón de firmar, el empleado marca: *«He recibido y leído este documento. Entiendo que esta firma deja constancia de su recepción y visualización, pero no es una firma con certificado ni tiene su valor legal.»*

## Por qué no dice «no tiene validez legal»
Se evita esa frase a propósito: el Reglamento eIDAS (UE 910/2014, art. 25) establece que a una firma electrónica **no se le pueden negar efectos jurídicos solo por ser electrónica**. Lo correcto es decir que tiene **menos valor probatorio** que una firma avanzada o cualificada y que se valora con el resto de pruebas. Decir que «no vale nada» podría ser inexacto y restarnos credibilidad.

## Puntos a confirmar con el asesor
- Para qué documentos es suficiente esta firma (recibís de comunicaciones, políticas internas, entrega de EPI…) y para cuáles **no** (contratos, anexos, finiquitos): ahí hace falta certificado o firma manuscrita.
- Si el texto de la nota debe citar la norma (eIDAS, Ley 6/2020) o un acuerdo previo entre las partes sobre el valor de esta firma.
- Si conviene incluir esta firma en el contrato o en la política interna como método de recepción aceptado por las partes.
- Conservación de la constancia y plazo (`[plazo]`, ver `RGPD.md`).

## Límites técnicos
- Si el PDF original **ya lleva firma digital**, no se permite estamparle nada (la invalidaría): se firma con certificado y se sube.
- PDF protegidos con contraseña: no se pueden estampar; se firma fuera y se sube.
- Solo puede firmar la persona destinataria del documento (ni siquiera administración firma por ella).
- Se puede apagar por despliegue con `FIRMA_PANTALLA_HABILITADA=false`.
