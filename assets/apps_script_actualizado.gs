const FOLDER_ID = '1KRy8Aj5bd7bz4f0TpkIKMURthWBCS7om';
const SECRET    = 'PEGA_AQUI_EL_SECRETO'; // el mismo que drive_secret en Configuración → Integraciones. Nunca subirlo al repo (es público).

function doPost(e) {
  const out = ContentService.createTextOutput().setMimeType(ContentService.MimeType.JSON);
  try {
    const payload = JSON.parse(e.postData.contents);
    if (payload.secret !== SECRET) {
      out.setContent(JSON.stringify({ ok: false, error: 'no autorizado' }));
      return out;
    }

    // Borrar archivo
    if (payload.action === 'delete') {
      if (!payload.fileId) {
        out.setContent(JSON.stringify({ ok: false, error: 'fileId requerido' }));
        return out;
      }
      // Solo archivos de la carpeta de fotos: sin esto, quien tuviera el
      // secreto podía mandar a la papelera cualquier archivo de la cuenta.
      const file = DriveApp.getFileById(payload.fileId);
      const parents = file.getParents();
      let inFolder = false;
      while (parents.hasNext()) { if (parents.next().getId() === FOLDER_ID) { inFolder = true; break; } }
      if (!inFolder) {
        out.setContent(JSON.stringify({ ok: false, error: 'archivo fuera de la carpeta de fotos' }));
        return out;
      }
      file.setTrashed(true);
      out.setContent(JSON.stringify({ ok: true }));
      return out;
    }

    // Listar archivos de la carpeta -- solo lectura, no borra nada.
    // Usado por la auditoría de imágenes huérfanas (Configuración → Datos).
    // Por páginas (pageSize + pageToken): el listado completo tarda ~25 s y
    // Google no entrega bien respuestas tan largas al servidor de Supabase.
    if (payload.action === 'list') {
      const files = payload.pageToken
        ? DriveApp.continueFileIterator(payload.pageToken)
        : DriveApp.getFolderById(FOLDER_ID).getFiles();
      const pageSize = payload.pageSize || Infinity;
      const result = [];
      while (files.hasNext() && result.length < pageSize) {
        const f = files.next();
        result.push({
          id: f.getId(),
          name: f.getName(),
          createdDate: f.getDateCreated().toISOString(),
          size: f.getSize()
        });
      }
      const nextPageToken = files.hasNext() ? files.getContinuationToken() : null;
      out.setContent(JSON.stringify({ ok: true, files: result, nextPageToken }));
      return out;
    }

    const base64 = payload.image.split(',')[1];
    const mime   = payload.image.split(';')[0].split(':')[1];
    const blob   = Utilities.newBlob(Utilities.base64Decode(base64), mime, payload.name);
    const folder = DriveApp.getFolderById(FOLDER_ID);
    const file   = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const url = 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w900';
    out.setContent(JSON.stringify({ ok: true, url }));
  } catch(err) {
    out.setContent(JSON.stringify({ ok: false, error: err.toString() }));
  }
  return out;
}

function doGet() {
  return ContentService.createTextOutput('OK');
}
