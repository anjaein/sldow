// 사용자가 고른 로컬 폴더에 문서를 `{id}.json` 파일로 저장한다.
// 고른 폴더는 IndexedDB에 기억해 두어 새로고침 후에도 다시 쓴다.
import type { DocumentPreview } from './types';

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options: {
    mode: 'readwrite';
  }) => Promise<FileSystemDirectoryHandle>;
};

// 권한 확인·요청 메서드는 아직 TypeScript DOM 타입에 없다.
type PermissionedDirectory = FileSystemDirectoryHandle & {
  queryPermission?: (options: {
    mode: 'readwrite';
  }) => Promise<PermissionState>;
  requestPermission?: (options: {
    mode: 'readwrite';
  }) => Promise<PermissionState>;
};

const DATABASE_NAME = 'sldow';
const STORE_NAME = 'directories';
const DIRECTORY_KEY = 'documents';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// 폴더 핸들(폴더를 가리키는 참조)만 IndexedDB에 기억한다. 문서 내용은 폴더의 파일에 있다.
async function readSavedDirectory(): Promise<
  PermissionedDirectory | undefined
> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database
        .transaction(STORE_NAME)
        .objectStore(STORE_NAME)
        .get(DIRECTORY_KEY);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

async function writeSavedDirectory(
  directory: FileSystemDirectoryHandle,
): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(directory, DIRECTORY_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

// 권한까지 확인되어 바로 읽고 쓸 수 있는 폴더
let directory: FileSystemDirectoryHandle | undefined;
// 클릭 직후 권한 요청이 늦어지지 않게, 기억해 둔 폴더는 한 번만 읽어 둔다.
let savedDirectory: Promise<PermissionedDirectory | undefined> | undefined;
// 저장을 요청 순서대로 하나씩 실행해, 늦게 끝난 이전 저장이 최신 내용을 덮지 않게 한다.
let pendingWrite: Promise<void> = Promise.resolve();

function loadSavedDirectory() {
  savedDirectory ??= readSavedDirectory().catch((error) => {
    // 실패한 결과를 붙잡아 두지 않고 다음에 다시 읽게 한다.
    savedDirectory = undefined;
    throw error;
  });
  return savedDirectory;
}

function getDirectory(): FileSystemDirectoryHandle {
  if (!directory) throw new Error('저장 폴더를 먼저 연결해 주세요.');
  return directory;
}

// 사용자 동작 없이 기억해 둔 폴더에 다시 연결한다. 연결되면 true를 돌려준다.
export async function restoreDirectory(): Promise<boolean> {
  if (directory) return true;
  const saved = await loadSavedDirectory();
  // "방문할 때마다 허용"을 골랐다면 묻지 않고 바로 연결된다.
  if ((await saved?.queryPermission?.({ mode: 'readwrite' })) === 'granted') {
    directory = saved;
  }
  return directory !== undefined;
}

// 사용자 동작(클릭 등) 안에서 호출한다. 이미 연결되어 있으면 바로 끝난다.
export async function connectDirectory(): Promise<void> {
  if (directory) return;
  // 기억해 둔 폴더가 있으면 폴더 선택 대신 권한만 다시 요청한다.
  // 읽기에 실패하면 폴더 선택으로 넘어간다.
  const saved = await loadSavedDirectory().catch(() => undefined);
  if ((await saved?.requestPermission?.({ mode: 'readwrite' })) === 'granted') {
    directory = saved;
    return;
  }

  const pickerWindow = window as DirectoryPickerWindow;
  if (!pickerWindow.showDirectoryPicker) {
    throw new Error(
      '이 브라우저는 폴더 선택을 지원하지 않습니다. Chrome 또는 Edge에서 열어 주세요.',
    );
  }
  const selected = await pickerWindow.showDirectoryPicker({
    mode: 'readwrite',
  });
  directory = selected;
  savedDirectory = Promise.resolve(selected);
  // 기억하지 못해도 이번 연결은 그대로 쓸 수 있다. 다음 방문에 다시 고르면 된다.
  await writeSavedDirectory(selected).catch(() => {});
}

export async function findDocument(
  id: number,
): Promise<DocumentPreview | null> {
  // 진행 중인 저장이 끝난 뒤에 읽어, 방금 저장한 내용을 읽게 한다.
  await pendingWrite;
  let handle: FileSystemFileHandle;
  try {
    handle = await getDirectory().getFileHandle(`${id}.json`);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      return null;
    }
    throw error;
  }
  const file = await handle.getFile();
  return JSON.parse(await file.text()) as DocumentPreview;
}

async function writeDocument(document: DocumentPreview): Promise<void> {
  const handle = await getDirectory().getFileHandle(`${document.id}.json`, {
    create: true,
  });
  const writable = await handle.createWritable();
  try {
    await writable.write(JSON.stringify(document, null, 2));
    await writable.close();
  } catch (error) {
    // 쓰다 실패하면 반쯤 쓴 내용이 파일에 반영되지 않게 취소한다.
    await writable.abort().catch(() => {});
    throw error;
  }
}

export function saveDocument(document: DocumentPreview): Promise<void> {
  const operation = pendingWrite.then(() => writeDocument(document));
  // 실패한 저장이 다음 저장을 막지 않게 한다. 오류는 operation으로 전달된다.
  pendingWrite = operation.catch(() => {});
  return operation;
}
