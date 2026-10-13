# Respaldo diario de la base de Supabase de Tres Encantos (2026-10-02).
#
# Supabase no tiene backups en este plan (backups:[] y PITR apagado), así que
# esto corre en la PC de Eduardo como tarea programada. No usa Docker ni la
# contraseña de la base: exporta cada tabla como JSON con el CLI de Supabase
# ya enlazado (supabase db query --linked), más el esquema (funciones,
# políticas, triggers, columnas) y los usuarios de Auth (sin contraseñas).
#
# Resultado: un .zip por día en $Destino; se conservan los últimos $Conservar,
# y una copia en Google Drive (carpeta privada) con los últimos $ConservarDrive.
# Cómo restaurar: ver LEEME.txt dentro de cada .zip.
#
# Uso manual:  powershell -ExecutionPolicy Bypass -File scripts\respaldo-supabase.ps1

param(
  [string]$Destino   = (Join-Path $env:USERPROFILE 'Documents\TresEncantos-Respaldos'),
  [int]   $Conservar = 30,
  [int]   $ConservarDrive = 3
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

# El CLI devuelve {"boundary","rows":[...]} cuando detecta que lo corre un
# agente (Claude Code) y un arreglo simple [...] en cualquier otro caso (la
# tarea programada). Hasta 2026-10-10 solo se entendía el primero: cada noche
# salía un zip vacío sin que nadie lo notara. Esto acepta los dos.
function Get-CliRows($obj) {
  if ($null -eq $obj) { return $null }
  if ($obj -is [array]) { return ,$obj }
  if ($obj.PSObject.Properties.Name -contains 'rows') { return ,@($obj.rows) }
  return $null
}

# Ejecuta una consulta y guarda las filas como JSON. Devuelve el número de
# filas, o -1 si falló.
function Export-Query($sql, $file) {
  $raw = & supabase db query --linked --workdir $Repo $sql -o json 2>$null | Out-String
  try {
    $rows = Get-CliRows ($raw | ConvertFrom-Json)
    if ($null -eq $rows) { throw 'sin rows' }
    # Se guarda la salida del CLI tal cual ([...] o {"rows":[...]}): re-serializar con
    # ConvertTo-Json de PowerShell 5.1 deforma arreglos de un elemento y fechas.
    [System.IO.File]::WriteAllText((Join-Path $Tmp $file), $raw, (New-Object System.Text.UTF8Encoding $false))
    return @($rows).Count
  } catch {
    Write-Log "ERROR exportando $file : $($raw.Substring(0, [Math]::Min(300, $raw.Length)))"
    return -1
  }
}

# Deja el resultado en config.ultimo_respaldo para que Configuración → Datos
# lo muestre (solo superadmin). Sin esto un respaldo podía fallar semanas sin
# que nadie se enterara: solo quedaba en respaldo.log de esta PC.
function Save-Status([bool]$ok, [double]$mb, [int]$nTablas, [int]$nErrores, [string]$drive = 'no') {
  # El JSON se arma en SQL: PowerShell 5.1 deforma las comillas dobles al
  # pasarle argumentos a un programa externo.
  $okS = if ($ok) { 'true' } else { 'false' }
  $mbS = $mb.ToString('0.0', [System.Globalization.CultureInfo]::InvariantCulture)
  $pc  = ($env:COMPUTERNAME -replace "[^A-Za-z0-9_-]", '')
  $sql = "insert into public.config (id, value) select 'ultimo_respaldo', jsonb_build_object('at', now(), 'ok', $okS, 'mb', $mbS, 'tablas', $nTablas, 'errores', $nErrores, 'equipo', '$pc', 'drive', '$drive')::text on conflict (id) do update set value = excluded.value"
  & supabase db query --linked --workdir $Repo $sql 2>$null | Out-Null
}

Write-Log "Inicio respaldo $Stamp"
$errores = 0

# 1. Datos: todas las tablas de public (la lista se lee de la base, así una
#    tabla nueva entra sola al respaldo).
$tablasRaw = & supabase db query --linked --workdir $Repo "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1" -o json 2>$null | Out-String
$tablas = @((Get-CliRows ($tablasRaw | ConvertFrom-Json)) | ForEach-Object { $_.table_name } | Where-Object { $_ })
if ($tablas.Count -eq 0) { Write-Log 'ERROR: no se pudo leer la lista de tablas (¿sesión del CLI vencida? correr: supabase login)'; Save-Status $false 0 0 1; exit 1 }

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
pegando el arreglo de filas del JSON (todo el archivo, o su "rows" si lo trae) entre las comillas `$`$:
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

# 4. Copia en Google Drive (2026-10-13): si la PC se pierde o se descompone,
#    los 30 zips locales se van con ella. Usa el mismo Apps Script de las
#    fotos (action 'backup'), que lo guarda en una carpeta privada aparte y
#    conserva solo los últimos $ConservarDrive. Si falla no tumba el respaldo
#    local: solo se anota (drive = 'error') y Configuración → Datos lo avisa.
function Send-ToDrive($zipPath) {
  try {
    $raw = & supabase db query --linked --workdir $Repo "select id, value from public.config where id in ('drive_ep','drive_secret')" -o json 2>$null | Out-String
    $cfg = @{}
    foreach ($r in @(Get-CliRows ($raw | ConvertFrom-Json))) { $cfg[$r.id] = $r.value }
    if (-not $cfg['drive_ep'] -or -not $cfg['drive_secret']) { Write-Log 'Drive: sin drive_ep/drive_secret en config'; return 'error' }
    $body = @{
      secret = $cfg['drive_secret']
      action = 'backup'
      name   = [System.IO.Path]::GetFileName($zipPath)
      keep   = $ConservarDrive
      data   = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($zipPath))
    } | ConvertTo-Json -Compress
    # Apps Script responde 302; Invoke-RestMethod la sigue con GET, que es lo que Google espera.
    $res = Invoke-RestMethod -Uri $cfg['drive_ep'] -Method Post -Body $body -ContentType 'application/json' -TimeoutSec 180
    if ($res.ok) { Write-Log "Drive: copia subida (quedan $($res.kept))"; return 'ok' }
    Write-Log "Drive: ERROR $($res.error)"
    return 'error'
  } catch {
    Write-Log "Drive: ERROR $($_.Exception.Message)"
    return 'error'
  }
}

$mb  = (Get-Item $zip).Length / 1MB
$tam = '{0:N1} MB' -f $mb
if ($errores -gt 0) {
  Write-Log "TERMINÓ CON $errores ERROR(ES): $zip ($tam) -- revisar líneas ERROR arriba"
  Save-Status $false $mb $tablas.Count $errores
  exit 2
}
# Solo se sube un respaldo completo: uno con errores podría desplazar en Drive
# a una copia buena (allá solo se conservan $ConservarDrive).
$drive = Send-ToDrive $zip
Write-Log "OK: $zip ($tam), $($tablas.Count) tablas"
Save-Status $true $mb $tablas.Count 0 $drive
