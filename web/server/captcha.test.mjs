// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  issueCaptcha,
  verifyCaptcha,
  generateCaptchaCode,
  renderCaptchaSvg,
  CAPTCHA_TTL_MS,
} from './captcha.mjs';

const SECRET = 'test-captcha-secret';

describe('generateCaptchaCode', () => {
  it('is six characters from the unambiguous alphabet', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generateCaptchaCode()).toMatch(/^[ABCDEFGHJKLMNPQRTUVWXYZ2346789]{6}$/);
    }
  });
});

describe('issueCaptcha / verifyCaptcha', () => {
  it('accepts the code it just issued', () => {
    const { code, token } = issueCaptcha(SECRET);
    expect(verifyCaptcha(token, code, SECRET)).toBe(true);
  });

  it('is case-insensitive and tolerates surrounding whitespace', () => {
    const { code, token } = issueCaptcha(SECRET);
    expect(verifyCaptcha(token, `  ${code.toLowerCase()} `, SECRET)).toBe(true);
  });

  it('rejects the wrong code', () => {
    const { code, token } = issueCaptcha(SECRET);
    const wrong = code === 'AAAAAA' ? 'BBBBBB' : 'AAAAAA';
    expect(verifyCaptcha(token, wrong, SECRET)).toBe(false);
  });

  it('never carries the answer in the cookie token', () => {
    const { code, token } = issueCaptcha(SECRET);
    expect(token).not.toContain(code);
  });

  it('rejects a token signed with a different secret', () => {
    const { code, token } = issueCaptcha(SECRET);
    expect(verifyCaptcha(token, code, 'other-secret')).toBe(false);
  });

  it('rejects an expired token', () => {
    const now = 1_000_000;
    const { code, token } = issueCaptcha(SECRET, now);
    const later = now + CAPTCHA_TTL_MS + 1;
    expect(verifyCaptcha(token, code, SECRET, later)).toBe(false);
  });

  it('rejects empty, malformed, or non-string input', () => {
    const { token } = issueCaptcha(SECRET);
    expect(verifyCaptcha(token, '', SECRET)).toBe(false);
    expect(verifyCaptcha('not-a-token', 'ABC123', SECRET)).toBe(false);
    expect(verifyCaptcha(undefined, 'ABC123', SECRET)).toBe(false);
    expect(verifyCaptcha(token, undefined, SECRET)).toBe(false);
  });
});

describe('renderCaptchaSvg', () => {
  it('renders a standalone SVG containing every glyph of the code', () => {
    const svg = renderCaptchaSvg('ABC234');
    expect(svg.startsWith('<svg')).toBe(true);
    for (const ch of 'ABC234') expect(svg).toContain(`>${ch}</text>`);
  });
});
