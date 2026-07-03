import { resolveSafe } from './safe-path';
import { join } from 'path';

describe('resolveSafe', () => {
  const root = '/var/data';

  it('resolves a /static/* path inside dataDir', () => {
    const p = resolveSafe(root, '/static/uploads/foo.png');
    expect(p).toBe(join(root, 'uploads/foo.png'));
  });

  it('rejects a path that escapes via ../', () => {
    expect(() => resolveSafe(root, '/static/../etc/passwd')).toThrow(/escapes/);
  });

  it('rejects a non-/static/ path', () => {
    expect(() => resolveSafe(root, '/etc/passwd')).toThrow(/expected/);
  });

  it('handles nested directories', () => {
    const p = resolveSafe(root, '/static/renders/sub/dir/img.png');
    expect(p).toBe(join(root, 'renders/sub/dir/img.png'));
  });
});
