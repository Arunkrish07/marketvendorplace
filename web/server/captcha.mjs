// web/server/captcha.mjs
// A stateless, image-based challenge for the sign-in screen.
//
// The server never stores the answer. It hands the browser a distorted SVG of a
// random code and, in an HttpOnly cookie, only an HMAC of that code + an expiry.
// At login the browser replays the typed code; the server re-signs it and
// compares. A correct guess is the only thing that reproduces the signature, so
// nothing on the client (and no other BFF worker) needs shared state. This is
// the same signed-cookie shape used for the session in security.mjs.

import crypto from 'node:crypto';

export const CAPTCHA_COOKIE = 'eworks_captcha';
export const CAPTCHA_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CODE_LEN = 6;

// No 0/O/1/I/5/S — glyphs that a distorted render makes genuinely ambiguous to a
// human are removed rather than shipped as a coin-flip.
const ALPHABET = 'ABCDEFGHJKLMNPQRTUVWXYZ2346789';

export function generateCaptchaCode() {
  const bytes = crypto.randomBytes(CODE_LEN);
  let code = '';
  for (let i = 0; i < CODE_LEN; i += 1) code += ALPHABET[bytes[i] % ALPHABET.length];
  return code;
}

// Case-insensitive by construction: both sign and verify upper-case first.
function sign(code, expiresTs, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(`${String(code).toUpperCase()}.${expiresTs}`)
    .digest('base64url');
}

// Returns the plaintext code (to draw) and the opaque cookie token (to store).
// The token carries the expiry and the signature — never the code itself.
export function issueCaptcha(secret, now = Date.now()) {
  const code = generateCaptchaCode();
  const expiresTs = now + CAPTCHA_TTL_MS;
  const token = `${expiresTs}.${sign(code, expiresTs, secret)}`;
  return { code, token, expiresTs };
}

export function verifyCaptcha(token, submitted, secret, now = Date.now()) {
  if (typeof token !== 'string' || typeof submitted !== 'string') return false;
  const trimmed = submitted.trim();
  if (!trimmed) return false;

  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [expiresStr, sig] = parts;
  const expiresTs = Number(expiresStr);
  if (!Number.isFinite(expiresTs) || now > expiresTs) return false;

  const expected = sign(trimmed, expiresTs, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function rint(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// A self-contained SVG — no external fonts or images, so it drops straight into
// an <img src> and honours the page's CSP. The code is A–Z/2–9 only, so no
// character here needs XML escaping.
export function renderCaptchaSvg(code) {
  const W = 150;
  const H = 48;
  const palette = ['#0c1f3d', '#1a3a6b', '#1e4480', '#2563a8'];
  const pick = () => palette[rint(0, palette.length - 1)];

  const step = (W - 28) / code.length;
  const glyphs = [];
  for (let i = 0; i < code.length; i += 1) {
    const x = 16 + i * step + rint(-2, 2);
    const y = H / 2 + rint(-3, 3);
    const rot = rint(-24, 24);
    const size = rint(22, 27);
    glyphs.push(
      `<text x="${x}" y="${y}" font-size="${size}" font-family="Georgia,'Times New Roman',serif" ` +
        `font-weight="700" fill="${pick()}" text-anchor="middle" dominant-baseline="central" ` +
        `transform="rotate(${rot} ${x} ${y})">${code[i]}</text>`,
    );
  }

  const noise = [];
  for (let i = 0; i < 4; i += 1) {
    noise.push(
      `<line x1="${rint(0, W)}" y1="${rint(0, H)}" x2="${rint(0, W)}" y2="${rint(0, H)}" ` +
        `stroke="${pick()}" stroke-width="1" opacity="0.35"/>`,
    );
  }
  for (let i = 0; i < 22; i += 1) {
    noise.push(`<circle cx="${rint(0, W)}" cy="${rint(0, H)}" r="1" fill="${pick()}" opacity="0.4"/>`);
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" ` +
    `role="img" aria-label="CAPTCHA">` +
    `<rect width="${W}" height="${H}" rx="8" fill="#eef2f7"/>${noise.join('')}${glyphs.join('')}</svg>`
  );
}
