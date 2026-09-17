import { toProfile } from './user-provisioner.js';

describe('toProfile (ADR-011f)', () => {
  it('trims and lower-cases email; keeps name; drops everything else', () => {
    expect(toProfile({ sub: 's', email: '  Candidate@Test.COM ', email_verified: true, name: ' Candy ', picture: 'x' } as never)).toEqual({
      email: 'candidate@test.com',
      emailVerified: true,
      name: 'Candy',
    });
  });

  it.each([
    ['missing', undefined],
    ['false', false],
    ['the string "true"', 'true'],
    ['1', 1],
  ])('email_verified %s → not verified', (_label, value) => {
    expect(toProfile({ sub: 's', email: 'a@test.com', email_verified: value }).emailVerified).toBe(false);
  });

  it.each([
    ['missing', undefined],
    ['empty', '   '],
    ['not a string', 42],
  ])('email %s → null and never verified, even if email_verified is true', (_label, value) => {
    expect(toProfile({ sub: 's', email: value, email_verified: true })).toEqual({ email: null, emailVerified: false, name: null });
  });
});
