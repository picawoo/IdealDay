export class StorageLockUnavailableError extends Error {
  constructor() { super('Запись недоступна: браузер не поддерживает синхронизацию локальных данных между вкладками.') }
}

export async function withStorageLock<T>(key: string, action: () => T | Promise<T>): Promise<T> {
  if (!globalThis.navigator?.locks?.request) throw new StorageLockUnavailableError()
  return navigator.locks.request(key, action)
}
