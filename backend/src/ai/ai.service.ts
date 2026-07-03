import { Injectable, Logger, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { promises as fs } from 'fs';
import { join } from 'path';
import { v4 as uuid } from 'uuid';
import { StorageService } from '../storage/storage.service';

/**
 * Thin wrapper around an OpenAI-compatible chat/image endpoint.
 *
 * Two models are exposed:
 *  - AI_IMAGE_MODEL (default: z-image-turbo)  -> /images/generations
 *  - AI_CODE_MODEL  (default: mimo-v25-pro)   -> /chat/completions
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
  private imageSize: string;
  private imageSteps: number;
  public enabled: boolean;

  constructor(private config: ConfigService, private storage: StorageService) {
    this.enabled = String(this.config.get('AI_ENABLED') || '').toLowerCase() === 'true';
    const baseURL = this.config.get<string>('AI_BASE_URL');
    const apiKey = this.config.get<string>('AI_API_KEY');
    this.imageModel = this.config.get<string>('AI_IMAGE_MODEL') || 'z-image-turbo';
    this.codeModel = this.config.get<string>('AI_CODE_MODEL') || 'mimo-v25-pro';
    this.imageSize = this.config.get<string>('AI_IMAGE_SIZE') || '1024x1024';
    this.imageSteps = Number(this.config.get('AI_IMAGE_STEPS') || 9);

    if (this.enabled && baseURL && apiKey) {
      this.client = new OpenAI({ baseURL, apiKey });
      this.logger.log(`AI enabled - baseURL=${baseURL} imageModel=${this.imageModel} codeModel=${this.codeModel}`);
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

  private buildImagePrompt(p: { style: string; color: string; heightFt: number; surroundings?: string; extraPrompt?: string }): string {
    const styleMap: Record<string, string> = {
      'Privacy': 'tall solid privacy panels with no gaps, modern',
      'Picket': 'classic evenly-spaced vertical pickets with rounded tops',
      'Wrought Iron': 'decorative ornamental wrought iron with finials',
    };
    const styleDesc = styleMap[p.style] || p.style;
    const surroundings = this.sanitizeFreeText(p.surroundings) || 'a typical American suburban backyard, green lawn, bright midday sun';
    const extra = this.sanitizeFreeText(p.extraPrompt);
    return [
      `Photorealistic product photo of a ${p.heightFt}-foot tall ${p.color.toLowerCase()} ${styleDesc} residential fence`,
      `in ${surroundings}.`,
      'Eye-level three-quarter angle, sharp focus, no text, no people, no watermarks.',
      extra,
    ].filter(Boolean).join(' ');
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
