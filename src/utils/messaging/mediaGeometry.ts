const dimensions = new Map<string, { width: number; height: number }>();
export function getMediaGeometry(uri: string) {
  return dimensions.get(uri);
}
export function rememberMediaGeometry(
  uri: string,
  width: number,
  height: number,
) {
  if (
    !uri ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  )
    return;
  dimensions.delete(uri);
  dimensions.set(uri, { width, height });
  while (dimensions.size > 256)
    dimensions.delete(dimensions.keys().next().value!);
}
