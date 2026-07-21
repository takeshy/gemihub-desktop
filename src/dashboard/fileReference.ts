export function sameFileReference(left: string, right: string): boolean {
  const normalize = (value: string) => value.trim().replaceAll("\\", "/");
  const leftPath = normalize(left);
  const rightPath = normalize(right);
  if (leftPath === rightPath) return true;
  const windowsPath = /^(?:[a-z]:\/|\/\/)/i;
  return windowsPath.test(leftPath) && windowsPath.test(rightPath) &&
    leftPath.toLocaleLowerCase() === rightPath.toLocaleLowerCase();
}

export function shouldApplyFileResult(
  currentPath: string,
  expectedPath?: string,
): boolean {
  return !expectedPath || sameFileReference(currentPath, expectedPath);
}
