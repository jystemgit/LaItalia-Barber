export async function notifyAfterSuccess<T>(operation: Promise<T>, notify: () => void) {
  const result = await operation;
  notify();
  return result;
}
