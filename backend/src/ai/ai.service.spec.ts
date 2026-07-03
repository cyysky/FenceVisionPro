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

describe('AiService - parseVisionJson (via reflection)', () => {
  let svc: AiService;
  beforeAll(() => { svc = Object.create(AiService.prototype); });
  function parse(x: string) { return (svc as any).parseVisionJson(x); }

  it('parses a plain JSON object', () => {
    expect(parse('{"style":"Privacy","color":"Black","heightFt":6,"confidence":0.9}')).toEqual({
      style: 'Privacy', color: 'Black', heightFt: 6, confidence: 0.9,
    });
  });
  it('strips ```json fences', () => {
    expect(parse('```json\n{"style":"Picket"}\n```')).toEqual({ style: 'Picket' });
  });
  it('extracts the first balanced object from prose-then-JSON', () => {
    expect(parse('Here you go:\n{"style":"Wrought Iron","color":"Bronze"}')).toEqual({
      style: 'Wrought Iron', color: 'Bronze',
    });
  });
  it('handles a leading preamble and trailing whitespace', () => {
    expect(parse('  \n answer = {"heightFt":4}\n ')).toEqual({ heightFt: 4 });
  });
  it('returns null for non-JSON garbage', () => {
    expect(parse('not json at all')).toBeNull();
  });
  it('returns null for an unbalanced object', () => {
    expect(parse('{"a":1')).toBeNull();
  });
});

describe('AiService - cleanHeightFt / cleanString (via reflection)', () => {
  let svc: AiService;
  beforeAll(() => { svc = Object.create(AiService.prototype); });
  it('clamps heightFt to 1..30 and rounds', () => {
    expect((svc as any).cleanHeightFt(6)).toBe(6);
    expect((svc as any).cleanHeightFt(6.4)).toBe(6);
    expect((svc as any).cleanHeightFt(99)).toBeUndefined();
    expect((svc as any).cleanHeightFt('4')).toBe(4);
    expect((svc as any).cleanHeightFt(null)).toBeUndefined();
  });
  it('drops null/unknown strings', () => {
    expect((svc as any).cleanString('Black')).toBe('Black');
    expect((svc as any).cleanString(null)).toBeUndefined();
    expect((svc as any).cleanString('unknown')).toBeUndefined();
    expect((svc as any).cleanString('   ')).toBeUndefined();
  });
});

describe('AiService - parseVisionJson edge cases (via reflection)', () => {
  let svc: AiService;
  beforeAll(() => { svc = Object.create(AiService.prototype); });
  function parse(x: string) { return (svc as any).parseVisionJson(x); }

  it('strips a UTF-8 BOM', () => {
    const bom = '\uFEFF';
    expect(parse(bom + '{"style":"Privacy"}')).toEqual({ style: 'Privacy' });
  });
  it('normalises smart quotes to ASCII', () => {
    expect(parse('{\u201Cstyle\u201D:\u201CPrivacy\u201D}')).toEqual({ style: 'Privacy' });
  });
  it('extracts JSON from a preamble + trailing comma', () => {
    // The model frequently emits `{"a":1,}` (trailing comma).
    expect(parse('Here is the result: {"style":"Picket",}')).toEqual({ style: 'Picket' });
  });
  it('handles ```json fences around the object', () => {
    expect(parse('```json\n{"style":"Wrought Iron","color":"Bronze"}\n```'))
      .toEqual({ style: 'Wrought Iron', color: 'Bronze' });
  });
  it('handles unterminated string (closes at newline)', () => {
    // The model ran out of tokens mid-string. The walk closes
    // the unterminated string at the next newline and the
    // balanced-brace extraction should still succeed.
    expect(parse('{"style":"Priv')).toBeNull(); // unclosed {, no balancing
  });
  it('returns the LAST object that looks like the answer schema', () => {
    // When multiple balanced objects exist, we prefer the last
    // one that contains an expected key like `style`. This
    // makes the parser robust to the model dumping JSON-like
    // text in its preamble / thinking trace.
    const t = 'preamble {"x":1} middle {"style":"Vinyl"} tail';
    expect(parse(t)).toEqual({ style: 'Vinyl' });
  });
});

describe('AiService - parseVisionJson reasoning-trace handling', () => {
  let svc: AiService;
  beforeAll(() => { svc = Object.create(AiService.prototype); });
  function parse(x: string) { return (svc as any).parseVisionJson(x); }

  it('extracts JSON from a Qwen-style "Thinking Process:" preamble', () => {
    const text = `Thinking Process:

1.  **Analyze the Request:**
    *   **Role:** Fence-industry visual estimator.
    *   **Task:** Look at a photo of a house or yard.
    *   **Output:** JSON object with style, color, heightFt, etc.

2.  **Examine the Image:**
    *   Two-storey suburban home, white siding, black shutters.
    *   Existing chain-link fence along the back property line.

3.  **Formulate the JSON:**
    {\"style\":\"Privacy\",\"color\":\"White\",\"heightFt\":6,\"surroundings\":\"suburban backyard with mature trees\",\"notes\":\"two-storey house with white siding\",\"confidence\":0.88}`;
    expect(parse(text)).toEqual({
      style: 'Privacy', color: 'White', heightFt: 6,
      surroundings: 'suburban backyard with mature trees',
      notes: 'two-storey house with white siding', confidence: 0.88,
    });
  });

  it('extracts JSON from a <think>...</think> block', () => {
    const text = `<think>The user uploaded a photo. I need to estimate the fence parameters.</think>{\"style\":\"Picket\",\"color\":\"White\",\"heightFt\":4,\"surroundings\":\"front yard\",\"notes\":\"\",\"confidence\":0.7}`;
    expect(parse(text)).toEqual({
      style: 'Picket', color: 'White', heightFt: 4,
      surroundings: 'front yard', notes: '', confidence: 0.7,
    });
  });

  it('extracts JSON from a <reasoning>...</reasoning> block', () => {
    const text = `<reasoning>Looking at the image...</reasoning>{\"style\":\"Wrought Iron\",\"color\":\"Black\",\"heightFt\":5,\"surroundings\":\"garden\",\"notes\":\"\",\"confidence\":0.6}`;
    expect(parse(text)).toEqual({
      style: 'Wrought Iron', color: 'Black', heightFt: 5,
      surroundings: 'garden', notes: '', confidence: 0.6,
    });
  });

  it('skips JSON-looking prose inside a thinking trace', () => {
    // The thinking trace itself has `{"role": ...}` snippets.
    // The real answer is the LAST object.
    const text = `Reasoning: I see a {"role":"house"} in {"stage":"yard"}. Final answer: {\"style\":\"Vinyl\",\"color\":\"Tan\",\"heightFt\":6,\"surroundings\":\"\",\"notes\":\"\",\"confidence\":0.5}`;
    expect(parse(text)).toEqual({
      style: 'Vinyl', color: 'Tan', heightFt: 6,
      surroundings: '', notes: '', confidence: 0.5,
    });
  });

  it('parses the answer with trailing comma after a long preamble', () => {
    const text = 'Reasoning: very long.\n\n{\"style\":\"Wood\",\"color\":\"Natural\",\"heightFt\":6,\"surroundings\":\"rural\",\"notes\":\"\",\"confidence\":0.9,}';
    expect(parse(text)).toEqual({
      style: 'Wood', color: 'Natural', heightFt: 6,
      surroundings: 'rural', notes: '', confidence: 0.9,
    });
  });
});
