# Respaldo diario de la base de Supabase de Tres Encantos (2026-10-02).
#
# Supabase no tiene backups en este plan (backups:[] y PITR apagado), así que
# esto corre en la PC de Eduardo como tarea programada. No usa Docker ni la
# contraseña de la base: exporta cada tabla como JSON con el CLI de Supabase
# ya enlazado (supabase db query --linked), más el esquema (funciones,
# políticas, triggers, columnas) y los usuarios de Auth (sin contraseñas).
#
# Resultado: un .zip por día en $Destino; se conservan los últimos $Conservar.
# Cómo restaurar: ver LEEME.txt dentro de cada .zip.
#
# Uso manual:  powershell -ExecutionPolicy Bypass -File scripts\respaldo-supabase.ps1

param(
  [string]$Destino   = (Join-Path $env:USERPROFILE 'Documents\TresEncantos-Respaldos'),
  [int]   $Conservar = 30
)

$ErrorActionPreference = 'Continue'
$Repo   = Split-Path -Parent $PSScriptRoot
$Stamp  = Get-Date -Format 'yyyy-MM-dd_HHmm'
$Tmp    = Join-Path $Destino $Stamp
$Log    = Join-Path $Destino 'respaldo.log'
New-Item -ItemType Directory -Force -Path $Tmp | Out-Null

function Write-Log($msg) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $msg"
  Add-Content -Path $Log -Value $line -Encoding UTF8
}

# Ejecuta una consulta y guarda las filas como JSON. Devuelve el número de
# filas, o -1 si falló.
function Export-Query($sql, $file) {
  $raw = & supabase db query --linked --workdir $Repo $sql -o json 2>$null | Out-String
  try {
    $obj = $raw | ConvertFrom-Json
    if ($null -eq $obj.rows) { throw 'sin rows' }
    # Se guarda la salida del CLI tal cual ({"rows":[...]}): re-serializar con
    # ConvertTo-Json de PowerShell 5.1 deforma arreglos de un elemento y fechas.
    [System.IO.File]::WriteAllText((Join-Path $Tmp $file), $raw, (New-Object System.Text.UTF8Encoding $false))
    return @($obj.rows).Count
  } catch {
    Write-Log "ERROR exportando $file : $($raw.Substring(0, [Math]::Min(300, $raw.Length)))"
    return -1
  }
}

Write-Log "Inicio respaldo $Stamp"
$errores = 0

# 1. Datos: todas las tablas de public (la lista se lee de la base, así una
#    tabla nueva entra sola al respaldo).
$tablasRaw = & supabase db query --linked --workdir $Repo "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1" -o json 2>$null | Out-String
$tablas = @(($tablasRaw | ConvertFrom-Json).rows | ForEach-Object { $_.table_name })
if ($tablas.Count -eq 0) { Write-Log 'ERROR: no se pudo leer la lista de tablas (¿sesión del CLI vencida? correr: supabase login)'; exit 1 }

$resumen = @()
foreach ($t in $tablas) {
  $n = Export-Query "select t.* from public.""$t"" t" "datos_$t.json"
  if ($n -lt 0) { $errores++ }
  $resumen += "$t`t$n"
}

# 2. Esquema: lo necesario para reconstruir la lógica del servidor.
$esquema = @{
  'esquema_funciones.json' = "select p.oid::regprocedure::text as firma, pg_get_functiondef(p.oid) as definicion from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' order by 1"
  'esquema_politicas.json' = "select schemaname, tablename, policyname, cmd, roles::text, qual, with_check from pg_policies where schemaname in ('public','storage') order by 2,3"
  'esquema_triggers.json'  = "select c.relname as tabla, t.tgname, pg_get_triggerdef(t.oid) as definicion from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal order by 1,2"
  'esquema_columnas.json'  = "select table_name, ordinal_position, column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='public' order by 1,2"
  'esquema_permisos.json'  = "select grantee, table_name, privilege_type from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated') order by 2,1,3"
  'auth_usuarios.json'     = "select id, email, raw_user_meta_data, raw_app_meta_data, created_at, last_sign_in_at from auth.users order by email"
}
foreach ($f in $esquema.Keys) {
  if ((Export-Query $esquema[$f] $f) -lt 0) { $errores++ }
}

@"
Respaldo de Supabase — Tres Encantos — $Stamp
Proyecto: qxvrggmpaqhslgdmbhqw

Contenido
- datos_<tabla>.json   filas completas de cada tabla de public (JSON)
- esquema_*.json       funciones, políticas RLS, triggers, columnas y permisos
- auth_usuarios.json   cuentas de Auth (sin contraseñas: tras una restauración
                       total cada persona entra con "olvidé mi contraseña")

Filas por tabla
$($resumen -join "`r`n")

Cómo restaurar una tabla (en el SQL Editor de Supabase o con el CLI),
pegando el arreglo "rows" del JSON entre las comillas `$`$:
  insert into public.<tabla>
  select * from json_populate_recordset(null::public.<tabla>, `$`$[...]`$`$)
  on conflict (id) do nothing;

Para una restauración completa conviene pedírsela a Claude con este .zip:
primero se recrean columnas/funciones/políticas desde los esquema_*.json y
supabase/migrations/, luego los datos, y al final se ajusta la secuencia
products_id_seq al máximo id.
"@ | Set-Content -Path (Join-Path $Tmp 'LEEME.txt') -Encoding UTF8

# 3. Comprimir y rotar.
$zip = Join-Path $Destino "TresEncantos_$Stamp.zip"
Compress-Archive -Path (Join-Path $Tmp '*') -DestinationPath $zip -Force
Remove-Item -Recurse -Force $Tmp
Get-ChildItem $Destino -Filter 'TresEncantos_*.zip' | Sort-Object Name -Descending | Select-Object -Skip $Conservar | Remove-Item -Force

$tam = '{0:N1} MB' -f ((Get-Item $zip).Length / 1MB)
if ($errores -gt 0) {
  Write-Log "TERMINÓ CON $errores ERROR(ES): $zip ($tam) -- revisar líneas ERROR arriba"
  exit 2
}
Write-Log "OK: $zip ($tam), $($tablas.Count) tablas"
