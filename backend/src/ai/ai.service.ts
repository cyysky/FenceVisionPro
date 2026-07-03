import { Injectable, Logger, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { promises as fs } from 'fs';
import { resolve } from 'path';
import { resolveSafe } from '../storage/safe-path';
import { v4 as uuid } from 'uuid';
import { StorageService } from '../storage/storage.service';

/**
 * Thin wrapper around an OpenAI-compatible chat/image endpoint.
 *
 * Three models are exposed:
 *  - AI_IMAGE_MODEL  (default: z-image-turbo)   -> /images/generations
 *  - AI_CODE_MODEL   (default: mimo-v25-pro)    -> /chat/completions (text-only)
 *  - AI_VISION_MODEL (default: qwen3.5-397b)    -> /chat/completions (multimodal)
 *
 * The endpoint, API key and model names are all sourced from env so
 * the values live in .env (gitignored). When AI_ENABLED=false the
 * service throws a clear "disabled" error and callers can fall back.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private client: OpenAI | null = null;
  private imageModel: string;
  private codeModel: string;
  private visionModel: string;
  private imageSize: string;
  private imageSteps: number;
  public enabled: boolean;

  constructor(private config: ConfigService, private storage: StorageService) {
    this.enabled = String(this.config.get('AI_ENABLED') || '').toLowerCase() === 'true';
    const baseURL = this.config.get<string>('AI_BASE_URL');
    const apiKey = this.config.get<string>('AI_API_KEY');
    this.imageModel = this.config.get<string>('AI_IMAGE_MODEL') || 'z-image-turbo';
    this.codeModel = this.config.get<string>('AI_CODE_MODEL') || 'mimo-v25-pro';
    this.visionModel = this.config.get<string>('AI_VISION_MODEL') || 'qwen3.5-397b';
    this.imageSize = this.config.get<string>('AI_IMAGE_SIZE') || '1024x1024';
    this.imageSteps = Number(this.config.get('AI_IMAGE_STEPS') || 9);

    if (this.enabled && baseURL && apiKey) {
      this.client = new OpenAI({ baseURL, apiKey });
      this.logger.log(`AI enabled - baseURL=${baseURL} imageModel=${this.imageModel} codeModel=${this.codeModel} visionModel=${this.visionModel}`);
    } else {
      this.logger.warn('AI disabled - set AI_ENABLED=true, AI_BASE_URL, AI_API_KEY in .env to enable');
    }
  }

  private requireClient(): OpenAI {
    if (!this.enabled || !this.client) {
      throw new ServiceUnavailableException('AI is disabled. Set AI_ENABLED=true and configure AI_BASE_URL/AI_API_KEY.');
    }
    return this.client;
  }

  /**
   * Generate a photorealistic fence image by compositing a textual
   * description of the customer's project with the chosen design. The
   * prompt is built on the server from concrete project parameters
   * (style, color, height, surroundings) so the wholesaler doesn't
   * have to write a prompt themselves.
   */
  async generateFenceImage(params: {
    style: string;            // e.g. "Privacy", "Picket", "Wrought Iron"
    color: string;            // e.g. "Black"
    heightFt: number;         // e.g. 6
    surroundings?: string;    // e.g. "suburban lawn with a two-storey house"
    extraPrompt?: string;     // user additions
    visionDescription?: string; // from analysePhoto - spliced into prompt
  }): Promise<{ url: string; relPath: string }> {
    const client = this.requireClient();
    const prompt = this.buildImagePrompt(params);

    // Up to 3 attempts - the upstream is occasionally rate-limited
    // (HTTP 429) and the cooldown window is short.
    let lastErr: any;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await (client.images.generate as any)({
          model: this.imageModel,
          prompt,
          response_format: 'b64_json',
          size: this.imageSize,
          extra_body: { guidance_scale: 0, num_inference_steps: this.imageSteps },
        });
        const d = r.data?.[0];
        if (!d) throw new Error('empty response from image API');
        if (d.b64_json) {
          const bytes = Buffer.from(d.b64_json, 'base64');
          return await this.storage.saveBuffer('renders', `ai-${uuid()}.png`, bytes);
        }
        if (d.url) {
          // Some servers ignore response_format and return a URL
          const fetched = await fetch(d.url, { headers: { Authorization: `Bearer ${this.config.get('AI_API_KEY')}` } });
          if (!fetched.ok) throw new Error(`download failed: ${fetched.status}`);
          const bytes = Buffer.from(await fetched.arrayBuffer());
          return await this.storage.saveBuffer('renders', `ai-${uuid()}.png`, bytes);
        }
        throw new Error('response has neither b64_json nor url');
      } catch (e: any) {
        lastErr = e;
        const status = e?.status || e?.response?.status;
        this.logger.warn(`AI image attempt ${attempt + 1} failed: ${status ?? ''} ${e.message?.slice(0, 200)}`);
        if (status === 400) break; // bad request - don't retry
        await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
      }
    }
    throw new ServiceUnavailableException(`AI image generation failed: ${lastErr?.message || 'unknown'}`);
  }

  /**
   * Ask the code model to produce a self-contained three.js scene
   * that visualises the chosen fence design. Returns the raw JS
   * source - the frontend renders it in a sandboxed iframe.
   */
  async generateThreeJsScene(params: {
    style: string; color: string; heightFt: number;
    panelCount?: number; gateCount?: number;
  }): Promise<{ code: string; model: string }> {
    const client = this.requireClient();
    const systemPrompt = [
      'You generate a self-contained three.js scene as JavaScript code.',
      'Rules:',
      '  - Wrap everything in an IIFE: (function(){ ... })();',
      '  - Assume THREE is a global loaded by the host page (do not import).',
      '  - Create and append a <canvas> to document.body; clear body margins.',
      '  - Use PerspectiveCamera, WebGLRenderer with antialias + shadowMap.',
      '  - One DirectionalLight with shadows + one AmbientLight.',
      '  - Build a green ground plane (rotation.x = -PI/2).',
      '  - Build the fence from BoxGeometry posts, rails and pickets/panels.',
      '  - Add OrbitControls if THREE.OrbitControls is available.',
      '  - Wire window resize.',
      '  - NO prose, NO markdown fences - output raw JS only.',
    ].join('\n');

    const userPrompt = [
      `Build a three.js scene of a ${params.style} fence.`,
      `Color: ${params.color}. Height: ${params.heightFt} feet.`,
      params.panelCount ? `Number of panels: ${params.panelCount}.` : '',
      params.gateCount ? `Number of gates: ${params.gateCount}.` : '',
      'Camera angled from the front-right, slightly above ground level.',
    ].filter(Boolean).join(' ');

    // Up to 3 attempts - the upstream occasionally returns 429/5xx.
    let lastErr: any;
    let r: any = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        r = await client.chat.completions.create({
          model: this.codeModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: 6000,
          temperature: 0.4,
        });
        break;
      } catch (e: any) {
        lastErr = e;
        const status = e?.status || e?.response?.status;
        this.logger.warn(`AI code attempt ${attempt + 1} failed: ${status ?? ''} ${e.message?.slice(0, 200)}`);
        if (status === 400 || status === 401) break; // bad request - don't retry
        if (attempt < 2) await new Promise(res => setTimeout(res, 1500 * (attempt + 1)));
      }
    }
    if (!r) throw new ServiceUnavailableException(`AI code generation failed: ${lastErr?.message || 'unknown'}`);
    // Some reasoning models (e.g. mimo-v25-pro) put the final answer
    // in `reasoning_content` and leave `content` as null. Fall back to it.
    const msg = r.choices?.[0]?.message as any;
    let text = msg?.content || msg?.reasoning_content || '';
    // If the response was truncated, attempt to close the IIFE so the
    // sandboxed iframe at least renders what was generated (instead of
    // showing nothing due to a SyntaxError).
    const finish = r.choices?.[0]?.finish_reason;
    if (finish === 'length' && text && !text.trimEnd().endsWith('})();')) {
      // The LLM ran out of tokens mid-generation. We close any
      // unterminated string literal, balance braces/parens, and
      // terminate the IIFE. The user can rerun for a clean version.
      text = text.trimEnd();
      // If we're inside a string literal, close it
      // (very rough - count unescaped quotes)
      const quoteCount = (text.match(/(?<!\\)"/g) || []).length;
      if (quoteCount % 2 === 1) text += '"';
      // Balance braces { } and parens ( )
      const opens = (text.match(/\{/g) || []).length;
      const closes = (text.match(/\}/g) || []).length;
      const parens = (text.match(/\(/g) || []).length;
      const parensClose = (text.match(/\)/g) || []).length;
      text += '}'.repeat(Math.max(0, opens - closes));
      text += ')'.repeat(Math.max(0, parens - parensClose));
      // Close the IIFE wrapper: (function(){...})();
      text += ')();';
    }
    const code = this.stripCodeFences(text);
    if (!code || (!code.includes('THREE') && !code.includes('new '))) {
      throw new BadRequestException(
        'code model did not return valid three.js code' +
        (msg?.content === null ? ' (model returned empty content)' : ''),
      );
    }
    return { code, model: this.codeModel };
  }

  /**
   * Look at a user-uploaded photo of a house / yard and infer the
   * fence parameters a wholesaler would otherwise have to type by
   * hand. Uses the multimodal chat-completions endpoint (default
   * model: qwen3.5-397b). The image is passed inline as a
   * data:image/...;base64,... content part so we don't need the
   * upstream to support a public URL.
   *
   * Returns a normalised subset of FenceParamsDto fields. The model
   * is told to reply with a single JSON object so the result is
   * trivially parseable.
   */
  async analysePhoto(params: {
    imageUrl?: string;       // a server-stored /static/uploads/... URL
    imageDataUrl?: string;   // OR a data:image/...;base64,... URL
    mimeType?: string;       // e.g. image/jpeg - used to validate the data URL
  }): Promise<{
    style?: string;
    color?: string;
    heightFt?: number;
    surroundings?: string;
    notes?: string;
    confidence?: number;
    raw?: string;
  }> {
    const client = this.requireClient();

    // Resolve the image into a data: URL. We *always* inline the
    // bytes so the upstream doesn't need to fetch our static
    // server. If the caller passed a /static/... URL we read it
    // from disk and base64-encode it.
    let dataUrl = params.imageDataUrl;
    if (!dataUrl) {
      if (!params.imageUrl) {
        throw new BadRequestException('analysePhoto requires imageUrl or imageDataUrl');
      }
      const dataDir = process.env.DATA_DIR || resolve(process.cwd(), 'data');
      const absPath = resolveSafe(dataDir, params.imageUrl);
      const buf = await fs.readFile(absPath);
      const mime = this.sniffMime(absPath, params.mimeType);
      dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
    }
    if (!/^data:image\/(png|jpe?g|webp|gif);base64,/.test(dataUrl)) {
      throw new BadRequestException('imageDataUrl must be a base64 data:image/(png|jpeg|webp|gif) URL');
    }
    // Some upstreams cap the inline image. 4 MB is a safe ceiling.
    if (dataUrl.length > 4 * 1024 * 1024 * 1.37) {
      throw new BadRequestException('image is too large for the vision model (max ~4MB)');
    }

    const systemPrompt = [
      'You are a fence-industry visual estimator. You look at a photo of a house or yard and',
      'describe what fence the customer is most likely going to buy.',
      '',
      'CRITICAL OUTPUT FORMAT:',
      'Reply with EXACTLY ONE valid JSON object and NOTHING else.',
      '- No prose before or after.',
      '- No markdown code fences (no ``` or ```json).',
      '- No explanations, no preamble, no postscript.',
      '- All string values must use straight double-quotes; escape any internal quotes with \\".',
      '- If a field is unknown, set it to null (not the string "null", not the string "unknown").',
      '',
      'Schema (all keys required, value may be null):',
      '{',
      '  "style": "Privacy" | "Picket" | "Wrought Iron" | "Chain Link" | "Vinyl" | "Wood" | "Other",',
      '  "color": "<short colour name e.g. Black, White, Bronze, Natural Wood>",',
      '  "heightFt": <integer 3..12, best guess from visible scale, or null>,',
      '  "surroundings": "<one short sentence describing the yard / neighbourhood>",',
      '  "notes": "<one short sentence of extra detail (slope, gates, obstructions) or empty string>",',
      '  "confidence": <number 0..1>',
      '}',
      '',
      'Never invent prices. Never include commentary. Begin your reply with { and end with }.',
    ].join('\n');

    let lastErr: any;
    let r: any;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        r = await (client.chat.completions.create as any)({
          model: this.visionModel,
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Analyse this customer-uploaded photo and return the JSON described in the system prompt.' },
                { type: 'image_url', image_url: { url: dataUrl } },
              ],
            },
          ],
          max_tokens: 1500,
          temperature: 0.2,
        });
        break;
      } catch (e: any) {
        lastErr = e;
        const status = e?.status || e?.response?.status;
        this.logger.warn(`AI vision attempt ${attempt + 1} failed: ${status ?? ''} ${e.message?.slice(0, 200)}`);
        if (status === 400 || status === 401) break;
        if (attempt < 2) await new Promise(res => setTimeout(res, 1500 * (attempt + 1)));
      }
    }
    if (!r) throw new ServiceUnavailableException(`AI vision failed: ${lastErr?.message || 'unknown'}`);

    const msg = r.choices?.[0]?.message as any;
    const raw: string = (msg?.content || msg?.reasoning_content || '').toString();
    const parsed = this.parseVisionJson(raw);
    if (!parsed) {
      // Surface a short snippet of the raw text in the log so the
      // operator can see why the parser gave up. The full text is
      // also returned in the response `raw` field when parsing
      // succeeds, so this stays operator-only.
      this.logger.warn(`vision model returned unparseable JSON (${raw.length} chars): ${raw.slice(0, 2000)}`);
      throw new BadRequestException(
        `vision model did not return a parseable JSON object (first 120 chars: ${JSON.stringify(raw.slice(0, 120))})`,
      );
    }
    return {
      style: this.cleanString(parsed.style),
      color: this.cleanString(parsed.color),
      heightFt: this.cleanHeightFt(parsed.heightFt),
      surroundings: this.cleanString(parsed.surroundings),
      notes: this.cleanString(parsed.notes),
      confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : undefined,
      raw,
    };
  }

  /**
   * Best-effort extractor for a JSON object embedded in a model
   * reply. The vision model is told to reply with JSON only, but
   * in practice we see:
   *   - a preamble ("Here is the JSON:") before the object
   *   - ```json ... ``` fences
   *   - trailing commas (`{"a":1,}`)
   *   - smart quotes (`“` / `”`) the model occasionally emits
   *   - leading BOM
   *   - unterminated strings (token cap)
   *
   * We try direct JSON.parse first, then progressively relax:
   * strip fences, normalise quotes, walk the string and return
   * the first balanced {...} block we can parse.
   */
  private parseVisionJson(s: string): any | null {
    if (!s) return null;
    let t = s.trim();
    // Strip a UTF-8 BOM if present.
    if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1);
    // Normalise smart quotes to ASCII. Some upstreams / models
    // emit curly quotes that JSON.parse rejects.
    t = t
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"');

    // Strip reasoning / chain-of-thought blocks. qwen3.5-397b
    // (and most reasoning-tuned models) emit a long "Thinking
    // Process:" / <think> / <reasoning> preamble before the
    // final answer, and the prose itself often contains
    // JSON-like braces that confuse brace-based extraction.
    const thinkTags = [
      /<think>[\s\S]*?<\/think>/gi,
      /<reasoning>[\s\S]*?<\/reasoning>/gi,
      /<analysis>[\s\S]*?<\/analysis>/gi,
      /<reflection>[\s\S]*?<\/reflection>/gi,
    ];
    for (const re of thinkTags) t = t.replace(re, ' ');
    // Plain-text "Thinking Process:" / "Reasoning:" / "Analysis:"
    // sections that run until a blank line or a line that begins
    // with `{` (where the actual answer starts).
    t = t.replace(
      /^(?:\s*(?:Thinking Process|Reasoning|Analysis|Chain[- ]of[- ]Thought|Internal Monologue|Scratchpad|Let me think)[\s\S]*?)(?=\n\s*\n|\n\s*\{|\n```)/i,
      ' ',
    );

    // Strategy 1: direct parse of the whole response.
    try { return JSON.parse(t); } catch { /* fall through */ }

    // Strategy 2: fenced blocks. The LAST fence is usually the
    // final answer, so try from the end first.
    const fences = [...t.matchAll(/```(?:json|js|javascript)?\s*\n?([\s\S]*?)\n?```/gi)];
    for (let i = fences.length - 1; i >= 0; i--) {
      try { return JSON.parse(fences[i][1].trim()); } catch { /* try next */ }
    }

    // Strategy 3: find the LAST balanced top-level {...} block.
    // Reasoning models dump JSON-like text in their thinking
    // trace, so the *last* { ... } is the actual answer, not
    // the first. We scan from the end of the string backwards.
    const candidates: string[] = [];
    for (let i = t.length - 1; i >= 0; i--) {
      if (t[i] === '}') {
        const start = this.findMatchingOpenBrace(t, i);
        if (start != null) {
          const candidate = t.slice(start, i + 1);
          if (this.looksLikeAnswerObject(candidate)) {
            candidates.push(candidate);
          }
          // Skip past this block so we don't re-find the same one
          i = start;
        }
      }
      if (candidates.length >= 3) break;
    }
    for (const c of candidates) {
      try { return JSON.parse(c); } catch { /* try with trailing-comma cleanup */ }
      try { return JSON.parse(this.stripTrailingCommas(c)); } catch { /* next */ }
    }

    // Strategy 4: the *last* balanced {...} block regardless of
    // whether it looks like our schema. Fallback for when the
    // model returns a slightly different shape.
    for (let i = t.length - 1; i >= 0; i--) {
      if (t[i] === '}') {
        const start = this.findMatchingOpenBrace(t, i);
        if (start != null) {
          const c = t.slice(start, i + 1);
          try { return JSON.parse(c); } catch { /* next */ }
          try { return JSON.parse(this.stripTrailingCommas(c)); } catch { /* next */ }
          return null;
        }
      }
    }
    return null;
  }

  /**
   * Given the index of a `}` in `s`, find the index of its
   * matching `{` (honouring nested braces and string literals).
   * Returns null if the brace isn't part of a balanced object.
   */
  private findMatchingOpenBrace(s: string, closeIdx: number): number | null {
    let depth = 0;
    let inStr = false;
    let strQuote = '"';
    let escape = false;
    for (let i = closeIdx; i >= 0; i--) {
      const ch = s[i];
      if (inStr) {
        if (escape) { escape = false; continue; }
        // We walk backwards, so the escape char is to the right
        if (ch === '\\') { escape = true; continue; }
        if (ch === strQuote) inStr = false;
        continue;
      }
      if (ch === '"' || ch === "'") { inStr = true; strQuote = ch; continue; }
      if (ch === '}') depth++;
      else if (ch === '{') {
        depth--;
        if (depth === 0) return i;
      }
    }
    return null;
  }

  /**
   * Heuristic: does this candidate look like the answer object
   * (contains at least one of our expected keys)? Used to
   * disambiguate from JSON-like text inside the thinking trace.
   */
  private looksLikeAnswerObject(candidate: string): boolean {
    return /"(style|color|heightFt|surroundings|notes|confidence)"\s*:/.test(candidate);
  }

  /**
   * Walk the string from `start` (which must be `{`) and return
   * the slice up to and including the matching `}`. Honours
   * single-line `//` and `/* ... *\/` comments (the model
   * occasionally emits those) and tolerates unterminated strings
   * by closing them on EOL.
   */
  private extractBalancedObject(s: string, start: number): string | null {
    let depth = 0;
    let inStr = false;
    let strQuote = '"';
    let escape = false;
    for (let i = start; i < s.length; i++) {
      const ch = s[i];
      if (inStr) {
        if (escape) { escape = false; continue; }
        if (ch === '\\') { escape = true; continue; }
        if (ch === strQuote) inStr = false;
        // Unterminated string: close at newline so the rest of
        // the response can still be parsed.
        else if (ch === '\n') inStr = false;
        continue;
      }
      if (ch === '"' || ch === "'") { inStr = true; strQuote = ch; continue; }
      if (ch === '/' && s[i + 1] === '/') {
        // line comment - skip to newline
        const nl = s.indexOf('\n', i);
        if (nl < 0) break;
        i = nl;
        continue;
      }
      if (ch === '/' && s[i + 1] === '*') {
        const end = s.indexOf('*/', i + 2);
        if (end < 0) break;
        i = end + 1;
        continue;
      }
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) return s.slice(start, i + 1);
      }
    }
    return null;
  }

  /**
   * Remove trailing commas before `}` or `]` - valid JS, invalid
   * JSON, and a common habit of LLM output.
   */
  private stripTrailingCommas(s: string): string {
    // Drop any `,` that's followed only by whitespace and a
    // closing brace/bracket. Safe even on string contents
    // because the JSON parser would have accepted the input
    // otherwise - we're just doing this fallback for inputs
    // that are *almost* JSON.
    return s.replace(/,(\s*[}\]])/g, '$1');
  }

  private cleanString(v: any): string | undefined {
    if (v === null || v === undefined) return undefined;
    const s = String(v).trim();
    if (!s || s.toLowerCase() === 'null' || s.toLowerCase() === 'unknown') return undefined;
    return this.sanitizeFreeText(s);
  }

  private cleanHeightFt(v: any): number | undefined {
    if (v === null || v === undefined) return undefined;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 1 || n > 30) return undefined;
    return Math.round(n);
  }

  private sniffMime(absPath: string, hint?: string): string {
    if (hint && /^image\/(png|jpe?g|webp|gif)$/i.test(hint)) return hint.toLowerCase();
    const lower = absPath.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.gif')) return 'image/gif';
    return 'image/jpeg';
  }

  private buildImagePrompt(p: {
    style: string; color: string; heightFt: number;
    surroundings?: string; extraPrompt?: string;
    visionDescription?: string; // from analysePhoto
  }): string {
    const styleMap: Record<string, string> = {
      'Privacy': 'tall solid privacy fence with overlapping tongue-and-groove vinyl or wood panels, no visible gaps, flat top, modern',
      'Picket': 'classic residential picket fence with evenly-spaced vertical boards, rounded or pointed tops, narrow gaps between pickets',
      'Wrought Iron': 'ornamental wrought iron or steel fence with vertical bars, decorative finials on top of each post, horizontal rails',
      'Chain Link': 'galvanized steel chain link fence with diamond mesh pattern, metal posts and top rail',
      'Vinyl': 'solid white or tan PVC vinyl fence panels, smooth finish, no visible seams',
      'Wood': 'natural wood privacy fence with horizontal or vertical planks, visible wood grain, slightly weathered',
    };
    const styleDesc = styleMap[p.style] || `${p.style.toLowerCase()} residential fence`;
    const color = p.color.toLowerCase();
    const surroundings = this.sanitizeFreeText(p.surroundings)
      || 'a typical American suburban backyard, green grass, mature trees in the background, two-storey house partially visible';
    const extra = this.sanitizeFreeText(p.extraPrompt);
    // The vision model (qwen3.5-397b) produces a richer description
    // of the property when a photo is uploaded. We splice it in
    // verbatim so the image model has the architectural context
    // (house colour, siding material, slope, existing landscaping)
    // it needs to produce a faithful rendering.
    const vision = p.visionDescription ? this.sanitizeFreeText(p.visionDescription) : '';
    const lines = [
      `Professional real-estate marketing photo, residential property with a ${p.heightFt}-foot tall ${color} ${styleDesc}.`,
      `The fence is the primary subject and must be sharply in focus, with correct colour (${color}), correct height (${p.heightFt} feet), and correct style (${p.style}).`,
      `Setting: ${surroundings}.`,
      vision && `Property details from the customer photo: ${vision}.`,
      'Three-quarter perspective from outside the fence looking in, eye-level camera, golden-hour late afternoon lighting, soft natural shadows, sharp focus on the fence in the foreground with gentle bokeh in the background.',
      'No text, no labels, no watermarks, no logos, no people, no cars in the foreground, no artificial-looking renders.',
      extra,
    ].filter(Boolean);
    return lines.join(' ');
  }

  /**
   * Strip control characters and known prompt-injection patterns
   * from a free-text user field before pasting it into an image
   * prompt. The AI service is just a thin pass-through, so this
   * is the only layer between a hostile wholesaler and the
   * upstream model. We don't try to be exhaustive - just to
   * break the obvious attacks.
   */
  private sanitizeFreeText(s?: string): string {
    if (!s) return '';
    return s
      .replace(/[\u0000-\u001f\u007f]+/g, ' ')   // control chars
      .replace(/\b(ignore|disregard|forget)\b[^{}]{0,80}\b(instruction|instruction|prompt|directive)s?\b/gi, '') // "ignore previous instructions"
      .replace(/\b(system|assistant)\s*:/gi, '')  // role labels
      .replace(/\s+/g, ' ')
      .trim();
  }

  private stripCodeFences(s: string): string {
    if (!s) return '';
    let out = s.trim();
    // First: try a code block that spans the entire response
    const whole = out.match(/^```(?:javascript|js)?\s*\n([\s\S]*?)\n```\s*$/);
    if (whole) return whole[1].trim();
    // Otherwise: extract the LAST fenced code block in the response
    // (mimo-v25-pro emits prose followed by the code block)
    const any = out.match(/```(?:javascript|js)?\s*\n([\s\S]*?)\n```/g);
    if (any && any.length) {
      const last = any[any.length - 1].match(/```(?:javascript|js)?\s*\n([\s\S]*?)\n```/);
      if (last) return last[1].trim();
    }
    // Fall back to the longest line run that looks like JS
    return out;
  }
}
