import { describe, expect, it } from 'vitest';
import { escapeRegExp } from '../stringHelpers';

describe('escapeRegExp', () => {
  it('escapes regex metacharacters', () => {
    expect(escapeRegExp('remoteEntry.js')).toBe('remoteEntry\\.js');
    expect(escapeRegExp('a+b*c?')).toBe('a\\+b\\*c\\?');
  });
});
