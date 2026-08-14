# Waalaxy: alta de cuenta y campana (paso pendiente manual de Sindy)

Esto lo tiene que hacer Sindy en su navegador: no hay conector de Waalaxy ni
automatizacion de navegador disponible para hacerlo por script. AllianceClub
solo prepara los archivos; la campana en si vive en Waalaxy.

## 1. Crear la cuenta

1. Ir a waalaxy.com y crear cuenta con el mail de trabajo.
2. Instalar la extension de Chrome de Waalaxy.
3. Conectar la extension a tu perfil de LinkedIn (login normal, no compartir la
   password con nadie ni pegarla en ningun script).
4. El plan free ya no existe: vas a arrancar con la prueba gratuita de 14 dias.
   Cuando la actives, anota el limite real de invitaciones/dia y de
   mensajes/dia que te muestre el dashboard de Waalaxy (varia segun el plan
   vigente) y pasaselo a `--cap`/`--period-days` en `allianceclub.py prepare`
   en vez de asumir 100/mes.

## 2. Configurar el limite diario de forma segura

En Waalaxy > Settings > LinkedIn limits, poné un limite diario de invitaciones
por debajo del limite que LinkedIn tolera para minimizar riesgo de
restriccion de cuenta (arrancar conservador, p.ej. 15-20/dia, y subir solo si
no hay warnings de LinkedIn despues de un par de semanas).

## 3. Crear la campana (secuencia de 2 pasos)

Tipo de campana: **Invitacion + mensaje automatico al aceptar** (en Waalaxy
suele llamarse "Auto Connector" o similar segun la version de la UI).

- **Paso 1 - Invite**: solicitud de conexion **sin nota** (mayor tasa de
  aceptacion, y es lo que pide el spec de AllianceClub).
- **Paso 2 - Message**: se dispara solo cuando la invitacion es aceptada.
  Usa como texto el contenido de la columna `Mensaje` del CSV que genera
  `allianceclub.py prepare` (import como variable personalizada, no como
  texto fijo, para que cada lead reciba su propio mensaje).
- **Condicion de stop**: activa la opcion de Waalaxy que detiene la secuencia
  si el prospecto responde. Esto es lo que hace cumplir el guardrail de
  "nunca automatiza respuestas dentro de una conversacion ya iniciada por un
  lead".

## 4. Importar la lista

1. Correr `python3 allianceclub.py prepare` (ver README del repo si hace
   falta ayuda con los flags).
2. Revisar a mano `AllianceClub - tanda para revision.xlsx` ANTES de
   importar nada. Prestar atencion a las filas con `Confianza gancho =
   generic`: el gancho ahi es mas generico, vale la pena ajustarlo a mano si
   se puede.
3. En Waalaxy, crear/actualizar la lista de prospectos importando
   `AllianceClub - waalaxy_import.csv`. Waalaxy deja mapear cada columna del
   CSV a sus campos (First Name, Last Name, Company Name, LinkedIn Url) mas
   variables personalizadas (`Mensaje`) en el wizard de import, no hace falta
   que los headers coincidan exacto con nombres internos de Waalaxy.
4. Lanzar la campana con la lista importada.

## 5. Traer los resultados de vuelta

Cuando quieras actualizar el dedup y detectar respuestas:

1. Exportar desde Waalaxy el estado de la campana (aceptadas / respondidas)
   a CSV.
2. Correr `python3 allianceclub.py ingest-waalaxy-export --export
   ruta/al/export.csv`.
3. El formato exacto de columnas de ese export (nombres, valores de estado)
   todavia no esta confirmado porque la cuenta no existe todavia. La primera
   vez que tengas un export real, compartilo para ajustar los defaults de
   `ingest_waalaxy_export.py` (`--col-linkedin`, `--col-status`,
   `--replied-values`, `--accepted-values`) a como Waalaxy los llama de
   verdad.

## Lo que este agente todavia NO hace

- No controla Waalaxy via API/navegador: vos lanzas y monitoreas la campana
  ahi.
- El link de la llamada con Taha (`Call Link (Taha)` en los archivos de
  salida) queda vacio hasta que se conecte ShowUpClub.
