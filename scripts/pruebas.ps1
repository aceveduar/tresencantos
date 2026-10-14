# Corre las pruebas automáticas (Caja, seguridad, libreta, kits y apartados) contra
# la base real, dentro de transacciones que siempre se deshacen: no queda nada
# guardado. Las personas de prueba (duena@/cajera@prueba.test) se crean ahí mismo.
# Correr antes de publicar cambios que toquen dinero, stock, turnos o permisos:
#   powershell -ExecutionPolicy Bypass -File scripts\pruebas.ps1
# Sale con código 0 si todo pasa y 1 si algo falla.

$Repo = Split-Path -Parent $PSScriptRoot
# 2>&1: el CLI manda los errores de SQL (incluido "PRUEBA FALLÓ") por stderr.
$ErrorActionPreference = 'Continue'
$falla = $false
foreach ($f in @('caja.sql', 'kits_y_apartados.sql')) {
  Write-Host "== $f"
  $raw = (& supabase db query --linked --workdir $Repo -f (Join-Path $PSScriptRoot "pruebas\$f") -o json 2>&1 | Out-String)
  if ($raw -match 'PRUEBA FALL[^"]*') {
    Write-Host "  FALLÓ: $($Matches[0])" -ForegroundColor Red
    $falla = $true; continue
  }
  # El CLI responde {"rows":[...]} si lo corre un agente y [...] si lo corre una
  # persona: se aceptan los dos.
  $m = [regex]::Match($raw, '(?m)^[\[{]')
  try {
    $obj = $raw.Substring([Math]::Max($m.Index, 0)) | ConvertFrom-Json
    $rows = if ($obj -is [array]) { $obj } else { $obj.rows }
  } catch { $rows = $null }
  if (-not $rows) {
    Write-Host '  No se pudieron correr (¿sesión del CLI vencida? correr: supabase login)' -ForegroundColor Red
    Write-Host $raw.Substring(0, [Math]::Min(500, $raw.Length))
    $falla = $true; continue
  }
  foreach ($r in $rows) {
    $color = if ($r.prueba -eq 'TODAS LAS PRUEBAS PASARON') { 'Green' } else { 'Gray' }
    Write-Host "  ✓ $($r.prueba)" -ForegroundColor $color
  }
  if ($rows[-1].prueba -ne 'TODAS LAS PRUEBAS PASARON') { $falla = $true }
}
if ($falla) { exit 1 }
exit 0
