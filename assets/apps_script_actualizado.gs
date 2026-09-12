const FOLDER_ID = '1KRy8Aj5bd7bz4f0TpkIKMURthWBCS7om';
const SECRET    = 'te_cuu7g5lu1ycmtyxwfaj';

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
      DriveApp.getFileById(payload.fileId).setTrashed(true);
      out.setContent(JSON.stringify({ ok: true }));
      return out;
    }

    // Listar archivos de la carpeta -- solo lectura, no borra nada.
    // Usado por la auditoría de imágenes huérfanas (Configuración → Datos).
    if (payload.action === 'list') {
      const folder = DriveApp.getFolderById(FOLDER_ID);
      const files = folder.getFiles();
      const result = [];
      while (files.hasNext()) {
        const f = files.next();
        result.push({
          id: f.getId(),
          name: f.getName(),
          createdDate: f.getDateCreated().toISOString(),
          size: f.getSize()
        });
      }
      out.setContent(JSON.stringify({ ok: true, files: result }));
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
