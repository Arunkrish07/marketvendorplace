// @vitest-environment node
//
// Pure unit tests for the identity-portal classifier. `lookupProfile` itself
// is DB-backed (queries eworks.user_roles etc.) and covered by the .db.test.mjs
// suites; this file only exercises the role-code -> portal mapping, which is
// the part of db.mjs that decided the earlier DISTRICT_ADMIN bug (it was
// classified as 'unknown' instead of 'gov').
import { describe, it, expect } from 'vitest';
import { classifyPortal } from './db.mjs';

describe('classifyPortal', () => {
  it('classifies DISTRICT_ADMIN as gov', () => {
    expect(classifyPortal(['DISTRICT_ADMIN'])).toBe('gov');
  });

  it('classifies other gov roles as gov', () => {
    expect(classifyPortal(['DISTRICT_OFFICER'])).toBe('gov');
    expect(classifyPortal(['HEAD_ADMIN'])).toBe('gov');
  });

  it('classifies vendor-side roles as vendor, even mixed with gov roles', () => {
    expect(classifyPortal(['LAB_VENDOR'])).toBe('vendor');
    expect(classifyPortal(['FIELD_TECHNICIAN'])).toBe('vendor');
    expect(classifyPortal(['LAB_VENDOR', 'DISTRICT_ADMIN'])).toBe('vendor');
  });

  it('classifies CONTRACTOR as contractor', () => {
    expect(classifyPortal(['CONTRACTOR'])).toBe('contractor');
  });

  it('classifies no roles or unrecognized roles as unknown', () => {
    expect(classifyPortal([])).toBe('unknown');
    expect(classifyPortal(['SOME_FUTURE_ROLE'])).toBe('unknown');
  });
});
