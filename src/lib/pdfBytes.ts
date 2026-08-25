/**
 * A PDF signature may sit behind a short binary comment or leading whitespace,
 * so scan a small prefix instead of only the first bytes. Content stored in a
 * widget config or a workspace cache can be truncated or replaced by an error
 * payload; catching that here lets the viewer reload the file from disk instead
 * of leaving pdf.js to fail on every retry.
 */
export function hasPdfHeader(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length - 5, 1024);
  for (let i = 0; i <= limit; i++) {
    if (
      bytes[i] === 0x25 &&
      bytes[i + 1] === 0x50 &&
      bytes[i + 2] === 0x44 &&
      bytes[i + 3] === 0x46 &&
      bytes[i + 4] === 0x2d
    ) {
      return true;
    }
  }
  return false;
}
