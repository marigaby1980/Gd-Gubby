export function restoreSaves(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('gdwasm_saves', 1);

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('files')) {
        request.result.createObjectStore('files');
      }
    };

    request.onerror = () => reject(request.error);
    request.onblocked = () => console.warn('IndexedDB gdwasm_saves blocked');

    request.onsuccess = () => {
      const db = request.result;
      let tx: IDBTransaction;
      let err: any;

      try {
        tx = db.transaction('files', 'readonly');
      } catch (e) {
        db.close();
        reject(e);
        return;
      }

      tx.oncomplete = () => {
        db.close();
        if (err) reject(err);
        else resolve();
      };

      tx.onerror = tx.onabort = () => {
        db.close();
        reject(err || tx.error || new Error('Save restoration aborted'));
      };

      const cursorReq = tx.objectStore('files').openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) return;

        try {
          if (cursor.value != null) {
            const path = savePath(cursor.key);
            const data = cursor.value;
            const uint8 = ArrayBuffer.isView(data)
              ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
              : new Uint8Array(data);

            const dir = path.substring(0, path.lastIndexOf('/')) || '/';
            if ((window as any).Module && (window as any).Module.FS) {
              try {
                (window as any).Module.FS.mkdirTree(dir);
              } catch (_) {}
              (window as any).Module.FS.writeFile(path, uint8);
            }
          }
          cursor.continue();
        } catch (e) {
          err = e;
          tx.abort();
        }
      };
    };
  });
}

export function savePath(rawPath: IDBValidKey | string): string {
  const p = String(rawPath).replace(/\\/g, '/');
  const normalized = p.startsWith('/')
    ? p
    : /^(AppData|Resources)\//.test(p)
    ? '/' + p
    : '/AppData/' + p;
  const parts: string[] = [];
  for (const part of normalized.split('/')) {
    if (part === '..') {
      parts.pop();
    } else if (part && part !== '.') {
      parts.push(part);
    }
  }
  return '/' + parts.join('/');
}

export function requestSave(): void {
  if ((window as any).__gdSaveReady && (window as any).Module && (window as any).Module._gd_save) {
    try {
      (window as any).Module._gd_save();
    } catch (e) {
      console.warn('Failed to save GD state:', e);
    }
  }
}
