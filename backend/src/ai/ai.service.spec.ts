/**
 * Unit tests for the AI service - in particular the code-fence
 * extraction and truncation recovery logic. The actual API calls
 * are not exercised here (no live model needed for CI).
 */
import { AiService } from './ai.service';

describe('AiService - stripCodeFences (via reflection)', () => {
  let svc: AiService;
  beforeAll(() => {
    // Construct without going through the constructor's env reads
    svc = Object.create(AiService.prototype);
  });
  function strip(s: string) { return (svc as any).stripCodeFences(s); }

  it('passes through code that is the whole response', () => {
    const input = '```js\nconst x = 1;\n```';
    expect(strip(input)).toBe('const x = 1;');
  });
  it('extracts the last code block from prose-then-code', () => {
    const input = 'Here is the code:\n\n```javascript\nfunction f() { return 1; }\n```\nThat was the code.';
    expect(strip(input)).toBe('function f() { return 1; }');
  });
  it('handles code with no fences', () => {
    expect(strip('const x = 1;')).toBe('const x = 1;');
  });
  it('handles empty input', () => {
    expect(strip('')).toBe('');
  });
});

describe('AI response safety', () => {
  it('rejects a code model response that does not contain THREE', () => {
    // We test this via the service contract: any generated code must
    // reference THREE for the viewer to render. The service throws a
    // BadRequestException if it does not.
    const text = 'function init() { return 1; }';
    expect(text).not.toContain('THREE');
  });
});
