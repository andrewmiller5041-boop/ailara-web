// Turns a client "task" request into an Anthropic request. The browser never
// supplies a model, system prompt, token limit, or tool definitions — only a
// task name and small, validated variables. Everything else lives here.
import {
  CHAT_SYSTEM, MEAL_DAY_SYSTEM, PLAN_SYSTEM, WORKOUT_PROGRAM_SYSTEM, IMAGE_CONTEXT,
} from './prompts.js';
import { AILARA_TOOLS } from './tools.js';

const MODEL = 'claude-sonnet-5';
export const MAX_MESSAGES = 200;

const PLAN_TYPES = new Set(['FAT SHRED', 'BALANCE BOOSTER', 'ENDURANCE', 'MASS BUILDER']);
const WEEKDAYS = new Set(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
// 'thinking' blocks come back from the model and are echoed on tool follow-ups.
const BLOCK_TYPES = new Set(['text', 'image', 'tool_use', 'tool_result', 'thinking', 'redacted_thinking']);

// Structured-JSON tasks: thinking tokens count against max_tokens and truncate the JSON.
const NO_THINKING = { type: 'disabled' };

const isStr = (v, max) => typeof v === 'string' && v.length <= max;
const isNum = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const bad = (msg) => ({ error: msg });

// Single-pass fill: values are inserted literally and never re-scanned, so user
// text containing "{MEMORY}" or "$&" cannot alter or expand the template.
function fill(template, values) {
  return template.replace(/\{([A-Z_]+)\}/g, (m, k) => (Object.hasOwn(values, k) ? String(values[k]) : m));
}

function validMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) return false;
  if (messages[messages.length - 1].role !== 'user') return false;
  return messages.every((m) => {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) return false;
    if (typeof m.content === 'string') return m.content.length <= 60000;
    if (!Array.isArray(m.content) || m.content.length > 50) return false;
    return m.content.every((b) => {
      if (!b || !BLOCK_TYPES.has(b.type)) return false;
      if (b.type === 'text') return isStr(b.text, 60000);
      if (b.type === 'image') {
        return b.source?.type === 'base64' && IMAGE_TYPES.has(b.source.media_type) && isStr(b.source.data, 3_000_000);
      }
      if (b.type === 'thinking') return isStr(b.thinking ?? '', 60000) && isStr(b.signature ?? '', 20000);
      if (b.type === 'redacted_thinking') return isStr(b.data ?? '', 60000);
      return true;
    });
  });
}

const TASKS = {
  plan(v) {
    if (!isStr(v.profileText, 6000) || !v.profileText) return bad('Invalid profile');
    return {
      max_tokens: 3000,
      thinking: NO_THINKING,
      system: PLAN_SYSTEM,
      messages: [{ role: 'user', content: `Generate my personalized plan based on this profile:\n${v.profileText}\n\nReturn ONLY valid JSON.` }],
    };
  },

  meal_day(v) {
    const ok = PLAN_TYPES.has(v.planType) && WEEKDAYS.has(v.dayName)
      && isNum(v.calories, 500, 8000) && isNum(v.protein, 0, 1000) && isNum(v.carbs, 0, 1500)
      && isNum(v.fat, 0, 700) && Number.isInteger(v.mealCount) && v.mealCount >= 1 && v.mealCount <= 8
      && isStr(v.profile, 500) && isStr(v.allergies, 300)
      && Array.isArray(v.avoid) && v.avoid.length <= 40 && v.avoid.every((a) => isStr(a, 80));
    if (!ok) return bad('Invalid meal plan request');
    const system = fill(MEAL_DAY_SYSTEM, {
      PLAN_TYPE: v.planType, CALORIES: v.calories, PROTEIN: v.protein, CARBS: v.carbs,
      FAT: v.fat, MEAL_COUNT: v.mealCount, PROFILE: v.profile, ALLERGIES: v.allergies,
    });
    const avoid = v.avoid.length ? `Avoid repeating: ${v.avoid.join(', ')}.` : '';
    return {
      max_tokens: 1500,
      thinking: NO_THINKING,
      system,
      messages: [{ role: 'user', content: `Generate meals for ${v.dayName}. ${avoid} Return JSON only.` }],
    };
  },

  workout_program(v) {
    if (!isStr(v.profileText, 1000) || !v.profileText) return bad('Invalid profile');
    return {
      max_tokens: 3000,
      thinking: NO_THINKING,
      system: WORKOUT_PROGRAM_SYSTEM,
      messages: [{ role: 'user', content: `Build a weekly workout program for: ${v.profileText} Return JSON only.` }],
    };
  },

  coach(v, messages) {
    const ok = isStr(v.profile, 4000) && isStr(v.planStatus, 8000) && isStr(v.memory, 4000)
      && Object.hasOwn(IMAGE_CONTEXT, v.imageContext);
    if (!ok) return bad('Invalid coach context');
    if (!validMessages(messages)) return bad('Invalid messages');
    return {
      max_tokens: 2000,
      system: fill(CHAT_SYSTEM, {
        PROFILE: v.profile, PLAN_STATUS: v.planStatus, MEMORY: v.memory,
        IMAGE_CONTEXT: IMAGE_CONTEXT[v.imageContext],
      }),
      tools: AILARA_TOOLS,
      messages,
    };
  },
};

// Returns { payload } ready for Anthropic, or { error } for the client.
export function buildRequest(body) {
  const { task, vars, messages } = body || {};
  if (typeof task !== 'string' || !Object.hasOwn(TASKS, task)) {
    return bad('Please refresh the page to get the latest version of AILARA.');
  }
  if (vars === null || typeof vars !== 'object' || Array.isArray(vars)) return bad('Invalid request');
  const built = TASKS[task](vars, messages);
  if (built.error) return built;
  return { payload: { model: MODEL, ...built } };
}
