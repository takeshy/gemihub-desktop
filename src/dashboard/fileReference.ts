export function sameFileReference(left: string, right: string): boolean {
  const normalize = (value: string) => value.trim().replaceAll("\\", "/");
  const leftPath = normalize(left);
  const rightPath = normalize(right);
  if (leftPath === rightPath) return true;
  const scope = (value: string) =>
    value.match(/^(workspace|files):\/\//i)?.[1]?.toLocaleLowerCase() || "";
  const leftScope = scope(leftPath);
  const rightScope = scope(rightPath);
  if (leftScope && rightScope && leftScope !== rightScope) return false;
  const leftBare = leftPath.replace(/^(?:workspace|files):\/\//i, "");
  const rightBare = rightPath.replace(/^(?:workspace|files):\/\//i, "");
  if (leftBare === rightBare) return true;
  const windowsPath = /^(?:[a-z]:\/|\/\/)/i;
  return windowsPath.test(leftBare) && windowsPath.test(rightBare) &&
    leftBare.toLocaleLowerCase() === rightBare.toLocaleLowerCase();
}
