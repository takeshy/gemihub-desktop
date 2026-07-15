// Memo file naming (specs/memo.md §4): encodes a document's absolute path
// into a single memo file name, with a hash fallback for very long paths.

const MAX_NAME_BYTES = 200;
const TRUNCATED_NAME_BYTES = 180;

const textEncoder = new TextEncoder();

export function isWindowsPath(path: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("\\\\");
}

// §4.1: `_` -> `_u`, `/` -> `_s`, `\` -> `_s` (Windows paths only), `:` -> `_c`.
export function encodeMemoPath(absPath: string): string {
  const windows = isWindowsPath(absPath);
  let out = "";
  for (const ch of absPath) {
    if (ch === "_") out += "_u";
    else if (ch === "/") out += "_s";
    else if (ch === "\\" && windows) out += "_s";
    else if (ch === ":") out += "_c";
    else out += ch;
  }
  return out;
}

// Reverses encodeMemoPath. Returns null for names that are not a valid
// encoding (e.g. `_` followed by anything other than u/s/c — §4.1).
export function decodeMemoPath(encoded: string): string | null {
  let out = "";
  for (let i = 0; i < encoded.length; i++) {
    const ch = encoded[i];
    if (ch !== "_") {
      out += ch;
      continue;
    }
    const next = encoded[++i];
    if (next === "u") out += "_";
    else if (next === "s") out += "/";
    else if (next === "c") out += ":";
    else return null;
  }
  return out;
}

function truncateUtf8(value: string, maxBytes: number): string {
  let bytes = 0;
  let out = "";
  for (const ch of value) {
    const size = textEncoder.encode(ch).length;
    if (bytes + size > maxBytes) break;
    bytes += size;
    out += ch;
  }
  return out;
}

// §4.1 + §4.2: canonical memo file name for a document path. Falls back to a
// truncated name + SHA-256 prefix when the encoded name exceeds 200 bytes.
export function memoFileNameFor(absPath: string): string {
  const encoded = encodeMemoPath(absPath);
  const fullName = `${encoded}.md`;
  if (textEncoder.encode(fullName).length <= MAX_NAME_BYTES) return fullName;
  const truncated = truncateUtf8(encoded, TRUNCATED_NAME_BYTES);
  return `${truncated}.${sha256Hex(absPath).slice(0, 8)}.md`;
}

export function memoFilePathFor(memoDir: string, absPath: string): string {
  const separator = isWindowsPath(memoDir) ? "\\" : "/";
  const trimmed = memoDir.endsWith("/") || memoDir.endsWith("\\") ? memoDir.slice(0, -1) : memoDir;
  return `${trimmed}${separator}${memoFileNameFor(absPath)}`;
}

// Compact synchronous SHA-256 (crypto.subtle is async and unavailable in some
// non-secure webview contexts; the fallback name must be computed inline).
export function sha256Hex(input: string): string {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

  const data = textEncoder.encode(input);
  const bitLength = data.length * 8;
  const paddedLength = (((data.length + 8) >> 6) + 1) << 6;
  const padded = new Uint8Array(paddedLength);
  padded.set(data);
  padded[data.length] = 0x80;
  new DataView(padded.buffer).setUint32(paddedLength - 4, bitLength >>> 0);
  new DataView(padded.buffer).setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));

  const w = new Int32Array(64);
  const view = new DataView(padded.buffer);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }

    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + K[i] + w[i]) | 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) | 0;
      h = g; g = f; f = e;
      e = (d + temp1) | 0;
      d = c; c = b; b = a;
      a = (temp1 + temp2) | 0;
    }

    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }

  return H.map((value) => (value >>> 0).toString(16).padStart(8, "0")).join("");
}
