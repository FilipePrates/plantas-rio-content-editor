import { parseCatalog } from "./catalog.mjs";
import type { Catalog } from "./catalog.mjs";
const databaseName = "plantas-rio-editor-v1";
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(
        new Error("Feche outras abas do editor para abrir o banco local."),
      );
  });
}
export async function loadCatalog(): Promise<Catalog | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("drafts", "readonly");
    const request = tx.objectStore("drafts").get("catalog");
    tx.oncomplete = () => {
      db.close();
      try {
        resolve(request.result ? parseCatalog(request.result) : null);
      } catch (error) {
        reject(error);
      }
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
export async function storeCatalog(catalog: Catalog): Promise<void> {
  parseCatalog(catalog);
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("drafts", "readwrite");
    tx.objectStore("drafts").put(catalog, "catalog");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(tx.error || new Error("Falha ao salvar no navegador."));
    };
  });
}
