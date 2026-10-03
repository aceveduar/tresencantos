# Corre las pruebas automáticas de Caja y seguridad contra la base real,
# dentro de una transacción que siempre se deshace (ver scripts/pruebas/caja.sql).
# Correr antes de publicar cambios que toquen dinero, stock, turnos o permisos:
#   powershell -ExecutionPolicy Bypass -File scripts\pruebas.ps1
# Sale con código 0 si todo pasa y 1 si algo falla.

$Repo = Split-Path -Parent $PSScriptRoot
# 2>&1: el CLI manda los errores de SQL (incluido "PRUEBA FALLÓ") por stderr.
$ErrorActionPreference = 'Continue'
$raw = (& supabase db query --linked --workdir $Repo -f (Join-Path $PSScriptRoot 'pruebas\caja.sql') -o json 2>&1 | Out-String)

if ($raw -match 'PRUEBA FALL[^"]*') {
  Write-Host "FALLÓ: $($Matches[0])" -ForegroundColor Red
  exit 1
}
$i = $raw.IndexOf('{')
try { $rows = ($raw.Substring([Math]::Max($i, 0)) | ConvertFrom-Json).rows } catch { $rows = $null }
if (-not $rows) {
  Write-Host 'No se pudieron correr las pruebas (¿sesión del CLI vencida? correr: supabase login)' -ForegroundColor Red
  Write-Host $raw.Substring(0, [Math]::Min(500, $raw.Length))
  exit 1
}
foreach ($r in $rows) {
  $color = if ($r.prueba -eq 'TODAS LAS PRUEBAS PASARON') { 'Green' } else { 'Gray' }
  Write-Host "  ✓ $($r.prueba)" -ForegroundColor $color
}
if ($rows[-1].prueba -ne 'TODAS LAS PRUEBAS PASARON') { exit 1 }
exit 0
