// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento/Suite authors

import { defaultChart, defaultImage, defaultShape, defaultText, readableInk, uid, type BentoDoc, type Slide, type SlideElement } from './model'

export type CompositionRecipeId =
  | 'title-thesis' | 'comparison' | 'academic-results'
  | 'section-divider' | 'agenda-roadmap' | 'quote-insight'
  | 'process-timeline' | 'data-chart-takeaway' | 'image-narrative'
  | 'closing-decision'

export interface CompositionRecipe {
  id: CompositionRecipeId
  name: string
  description: string
  fields: Array<{ key: string; label: string; required?: boolean; multiline?: boolean }>
  sample: Record<string, string>
}

export const COMPOSITION_RECIPES: CompositionRecipe[] = [
  {
    id: 'title-thesis', name: 'Title and thesis', description: 'Frame one argument with a concise thesis.',
    fields: [
      { key: 'eyebrow', label: 'Eyebrow' }, { key: 'title', label: 'Title', required: true },
      { key: 'thesis', label: 'Thesis', required: true, multiline: true }, { key: 'source', label: 'Source' },
    ],
    sample: { eyebrow: 'POINT OF VIEW', title: 'Clarity compounds', thesis: 'One memorable argument gives every detail a reason to exist.', source: 'Supporting context' },
  },
  {
    id: 'comparison', name: 'Comparison', description: 'Compare two alternatives and close with a takeaway.',
    fields: [
      { key: 'title', label: 'Title', required: true }, { key: 'leftTitle', label: 'Left heading', required: true },
      { key: 'leftBody', label: 'Left argument', required: true, multiline: true }, { key: 'rightTitle', label: 'Right heading', required: true },
      { key: 'rightBody', label: 'Right argument', required: true, multiline: true }, { key: 'takeaway', label: 'Takeaway' },
    ],
    sample: { title: 'Two paths, one decision', leftTitle: 'Option A', leftBody: 'Fast to begin\nSimple to explain', rightTitle: 'Option B', rightBody: 'Built to scale\nMore flexible', takeaway: 'Choose for the constraint that matters most.' },
  },
  {
    id: 'academic-results', name: 'Academic results', description: 'Lead with one finding and supporting metrics.',
    fields: [
      { key: 'title', label: 'Title', required: true }, { key: 'finding', label: 'Finding', required: true, multiline: true },
      { key: 'metric1', label: 'Metric 1 value', required: true }, { key: 'label1', label: 'Metric 1 label', required: true },
      { key: 'metric2', label: 'Metric 2 value' }, { key: 'label2', label: 'Metric 2 label' }, { key: 'metric3', label: 'Metric 3 value' },
      { key: 'label3', label: 'Metric 3 label' }, { key: 'source', label: 'Source' },
    ],
    sample: { title: 'Results at a glance', finding: 'The intervention produced a consistent, practically meaningful effect.', metric1: '+24%', label1: 'Primary outcome', metric2: '0.82', label2: 'Effect size', metric3: 'n = 418', label3: 'Participants', source: 'Study citation · 2026' },
  },
  {
    id: 'section-divider', name: 'Section divider', description: 'Open a new chapter with one clear promise.',
    fields: [
      { key: 'section', label: 'Section label' }, { key: 'title', label: 'Title', required: true },
      { key: 'promise', label: 'Section promise', multiline: true },
    ],
    sample: { section: 'PART TWO', title: 'From evidence to action', promise: 'Turn the strongest signal into a decision the room can make.' },
  },
  {
    id: 'agenda-roadmap', name: 'Agenda and roadmap', description: 'Set expectations with an ordered path through the story.',
    fields: [
      { key: 'title', label: 'Title', required: true },
      { key: 'item1', label: 'Item 1', required: true }, { key: 'item2', label: 'Item 2', required: true },
      { key: 'item3', label: 'Item 3' }, { key: 'item4', label: 'Item 4' }, { key: 'item5', label: 'Item 5' },
      { key: 'current', label: 'Current item number' },
    ],
    sample: { title: 'Today’s path', item1: 'Frame the decision', item2: 'Read the evidence', item3: 'Compare the options', item4: 'Choose the next move', current: '2' },
  },
  {
    id: 'quote-insight', name: 'Quote or key insight', description: 'Give one voice or insight the full weight of the slide.',
    fields: [
      { key: 'title', label: 'Context label' }, { key: 'quote', label: 'Quote', required: true, multiline: true },
      { key: 'attribution', label: 'Attribution' }, { key: 'context', label: 'Supporting context', multiline: true },
    ],
    sample: { title: 'WHAT WE HEARD', quote: 'The hard part was never collecting more data. It was knowing what deserved a decision.', attribution: 'Research participant · Operations lead', context: 'A repeated theme across 14 interviews.' },
  },
  {
    id: 'process-timeline', name: 'Process and timeline', description: 'Explain an ordered process without reducing it to identical cards.',
    fields: [
      { key: 'title', label: 'Title', required: true },
      { key: 'step1', label: 'Step 1', required: true }, { key: 'detail1', label: 'Step 1 detail' },
      { key: 'step2', label: 'Step 2', required: true }, { key: 'detail2', label: 'Step 2 detail' },
      { key: 'step3', label: 'Step 3' }, { key: 'detail3', label: 'Step 3 detail' },
      { key: 'step4', label: 'Step 4' }, { key: 'detail4', label: 'Step 4 detail' },
    ],
    sample: { title: 'How the decision moves', step1: 'Observe', detail1: 'Week 1', step2: 'Synthesize', detail2: 'Week 2', step3: 'Decide', detail3: 'Week 3', step4: 'Ship', detail4: 'Week 4' },
  },
  {
    id: 'data-chart-takeaway', name: 'Data chart and takeaway', description: 'Pair an editable chart with the conclusion it supports.',
    fields: [
      { key: 'title', label: 'Title', required: true }, { key: 'takeaway', label: 'Takeaway', required: true, multiline: true },
      { key: 'label1', label: 'Category 1', required: true }, { key: 'value1', label: 'Value 1', required: true },
      { key: 'label2', label: 'Category 2', required: true }, { key: 'value2', label: 'Value 2', required: true },
      { key: 'label3', label: 'Category 3' }, { key: 'value3', label: 'Value 3' },
      { key: 'label4', label: 'Category 4' }, { key: 'value4', label: 'Value 4' },
      { key: 'source', label: 'Source' },
    ],
    sample: { title: 'Adoption accelerated after onboarding changed', takeaway: 'Guided setup moved the median team from trial to first value twice as fast.', label1: 'Before', value1: '38', label2: 'Pilot', value2: '61', label3: 'Current', value3: '79', source: 'Product analytics · indexed score' },
  },
  {
    id: 'image-narrative', name: 'Image-led narrative', description: 'Let one image carry the scene while text supplies meaning.',
    fields: [
      { key: 'image', label: 'Image URL', required: true }, { key: 'title', label: 'Title', required: true },
      { key: 'caption', label: 'Narrative caption', required: true, multiline: true }, { key: 'credit', label: 'Image credit' },
    ],
    sample: { image: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80', title: 'The context changes the choice', caption: 'A decision that looks simple in a spreadsheet becomes different when you see where the work happens.', credit: 'Photo · Unsplash' },
  },
  {
    id: 'closing-decision', name: 'Closing and decision', description: 'End with the decision, next move, and accountable owner.',
    fields: [
      { key: 'title', label: 'Title', required: true }, { key: 'decision', label: 'Decision', required: true, multiline: true },
      { key: 'nextStep', label: 'Next step', required: true }, { key: 'owner', label: 'Owner' }, { key: 'timing', label: 'Timing' },
    ],
    sample: { title: 'The decision in one sentence', decision: 'Fund the focused path now; hold the broader rollout until the pilot proves retention.', nextStep: 'Approve the six-week pilot', owner: 'Owner · Product + Ops', timing: 'Decision requested today' },
  },
]

const esc = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
const lines = (value: string) => esc(value).replace(/\n/g, '<br>')

function token<T>(record: Record<string, T> | undefined, names: string[], fallback: T): T {
  for (const name of names) if (record?.[name] !== undefined) return record[name]
  return fallback
}

function style(doc: BentoDoc) {
  const design = doc.theme.design
  const bg = token(design?.colors, ['background', 'canvas'], doc.theme.background)
  const ink = token(design?.colors, ['ink', 'text', 'foreground'], readableInk(bg))
  const accent = token(design?.colors, ['accent', 'primary'], doc.theme.accent)
  const surface = token(design?.colors, ['surface', 'card'], bg)
  const muted = token(design?.colors, ['muted', 'secondary'], ink)
  const title = token(design?.typography, ['title', 'display', 'heading'], {})
  const body = token(design?.typography, ['body'], {})
  return {
    bg, ink, accent, surface, muted,
    margin: token(design?.spacing, ['margin', 'page'], Math.round(doc.size.width * 0.065)),
    gap: token(design?.spacing, ['gap', 'md'], 28), radius: token(design?.radii, ['card', 'md'], 20),
    family: title.fontFamily ?? body.fontFamily ?? doc.theme.fontFamily,
    titleSize: title.fontSize ?? 58, titleWeight: title.fontWeight ?? 700,
    bodyFamily: body.fontFamily ?? doc.theme.fontFamily, bodySize: body.fontSize ?? 26,
  }
}

function text(html: string, partial: Parameters<typeof defaultText>[0]): SlideElement {
  return defaultText({ html, align: 'left', valign: 'top', ...partial })
}

export function getCompositionRecipe(id: string): CompositionRecipe {
  const recipe = COMPOSITION_RECIPES.find((item) => item.id === id)
  if (!recipe) throw new Error(`Unknown composition recipe: ${id}.`)
  return recipe
}

export function instantiateCompositionRecipe(doc: BentoDoc, recipeId: string, raw: Record<string, unknown>, id = uid('slide')): Slide {
  const recipe = getCompositionRecipe(recipeId)
  const content: Record<string, string> = {}
  for (const field of recipe.fields) {
    const value = raw[field.key]
    if (value !== undefined && typeof value !== 'string') throw new Error(`${field.key} must be a string.`)
    content[field.key] = (value as string | undefined)?.trim() ?? ''
    if (field.required && !content[field.key]) throw new Error(`${field.key} is required.`)
  }
  const s = style(doc), { width: w, height: h } = doc.size, m = s.margin, gap = s.gap
  const base = { fontFamily: s.bodyFamily, color: s.ink }
  let elements: SlideElement[] = []
  if (recipe.id === 'title-thesis') {
    elements = [
      defaultShape('rect', { x: m, y: m, w: 10, h: h - m * 2, fill: s.accent, radius: 5 }),
      text(lines(content.eyebrow), { ...base, role: 'kicker', x: m + 42, y: m + 8, w: w - m * 2 - 42, h: 40, fontSize: 17, fontWeight: 700, color: s.accent, letterSpacing: 2 }),
      text(lines(content.title), { ...base, role: 'title', x: m + 42, y: m + 82, w: w - m * 2 - 42, h: 180, fontFamily: s.family, fontSize: s.titleSize, fontWeight: s.titleWeight, lineHeight: 1.02 }),
      text(lines(content.thesis), { ...base, role: 'body', x: m + 42, y: m + 300, w: Math.min(850, w - m * 2 - 42), h: 190, fontSize: s.bodySize + 6, lineHeight: 1.3 }),
      text(lines(content.source), { ...base, role: 'caption', x: m + 42, y: h - m - 34, w: w - m * 2, h: 28, fontSize: 15, color: s.muted }),
    ]
  } else if (recipe.id === 'comparison') {
    const cardW = (w - m * 2 - gap) / 2, cardY = m + 145, cardH = h - cardY - m - 68
    const card = (x: number, heading: string, body: string, accent: boolean): SlideElement[] => [
      defaultShape('rect', { x, y: cardY, w: cardW, h: cardH, fill: s.surface, stroke: accent ? s.accent : s.muted, strokeWidth: accent ? 3 : 1, radius: s.radius }),
      text(lines(heading), { ...base, role: 'subtitle', x: x + 34, y: cardY + 32, w: cardW - 68, h: 52, fontSize: 27, fontWeight: 700, color: accent ? s.accent : s.ink }),
      text(lines(body), { ...base, role: 'body', x: x + 34, y: cardY + 108, w: cardW - 68, h: cardH - 138, fontSize: s.bodySize, lineHeight: 1.45 }),
    ]
    elements = [
      text(lines(content.title), { ...base, role: 'title', x: m, y: m, w: w - m * 2, h: 100, fontFamily: s.family, fontSize: s.titleSize - 10, fontWeight: s.titleWeight }),
      ...card(m, content.leftTitle, content.leftBody, false), ...card(m + cardW + gap, content.rightTitle, content.rightBody, true),
      text(lines(content.takeaway), { ...base, role: 'takeaway', x: m, y: h - m - 38, w: w - m * 2, h: 32, fontSize: 18, fontWeight: 600, color: s.accent, align: 'center' }),
    ]
  } else if (recipe.id === 'academic-results') {
    const metrics = [1, 2, 3].filter((n) => content[`metric${n}`] || content[`label${n}`])
    const metricW = (w - m * 2 - gap * Math.max(0, metrics.length - 1)) / Math.max(1, metrics.length)
    elements = [
      text(lines(content.title), { ...base, role: 'title', x: m, y: m, w: w - m * 2, h: 90, fontFamily: s.family, fontSize: s.titleSize - 14, fontWeight: s.titleWeight }),
      text(lines(content.finding), { ...base, role: 'body', x: m, y: m + 112, w: w - m * 2, h: 150, fontSize: s.bodySize + 5, lineHeight: 1.25 }),
      ...metrics.flatMap((n, i) => {
        const x = m + i * (metricW + gap), y = m + 310
        return [
          defaultShape('rect', { x, y, w: metricW, h: 190, fill: s.surface, stroke: i === 0 ? s.accent : s.muted, strokeWidth: i === 0 ? 3 : 1, radius: s.radius }),
          text(lines(content[`metric${n}`]), { ...base, role: 'metric', x: x + 26, y: y + 32, w: metricW - 52, h: 75, fontSize: 46, fontWeight: 750, color: i === 0 ? s.accent : s.ink }),
          text(lines(content[`label${n}`]), { ...base, role: 'caption', x: x + 26, y: y + 116, w: metricW - 52, h: 48, fontSize: 18, color: s.muted }),
        ]
      }),
      text(lines(content.source), { ...base, role: 'caption', x: m, y: h - m - 30, w: w - m * 2, h: 25, fontSize: 14, color: s.muted }),
    ]
  } else if (recipe.id === 'section-divider') {
    elements = [
      defaultShape('rect', { x: 0, y: 0, w: Math.round(w * 0.34), h, fill: s.accent, radius: 0 }),
      text(lines(content.section), { ...base, role: 'kicker', x: m, y: m, w: Math.round(w * 0.22), h: 48, fontSize: 18, fontWeight: 800, color: readableInk(s.accent), letterSpacing: 2 }),
      text(lines(content.title), { ...base, role: 'title', x: Math.round(w * 0.34) + m, y: Math.round(h * 0.24), w: Math.round(w * 0.56) - m, h: 190, fontFamily: s.family, fontSize: s.titleSize + 4, fontWeight: s.titleWeight, lineHeight: 1.02 }),
      defaultShape('rect', { x: Math.round(w * 0.34) + m, y: Math.round(h * 0.57), w: 84, h: 6, fill: s.accent, radius: 3 }),
      text(lines(content.promise), { ...base, role: 'body', x: Math.round(w * 0.34) + m, y: Math.round(h * 0.63), w: Math.round(w * 0.5), h: 120, fontSize: s.bodySize, lineHeight: 1.35, color: s.muted }),
    ]
  } else if (recipe.id === 'agenda-roadmap') {
    const items = [1, 2, 3, 4, 5].filter((n) => content[`item${n}`])
    const current = Math.max(1, Math.min(items.length, Number.parseInt(content.current, 10) || 1))
    const rowH = Math.min(82, (h - m * 2 - 130) / Math.max(1, items.length))
    elements = [
      text(lines(content.title), { ...base, role: 'title', x: m, y: m, w: w - m * 2, h: 90, fontFamily: s.family, fontSize: s.titleSize - 12, fontWeight: s.titleWeight }),
      ...items.flatMap((n, i) => {
        const y = m + 126 + i * rowH, active = n === current
        return [
          defaultShape('ellipse', { x: m, y: y + 8, w: 46, h: 46, fill: active ? s.accent : 'transparent', stroke: active ? s.accent : s.muted, strokeWidth: active ? 0 : 1 }),
          text(String(n).padStart(2, '0'), { ...base, x: m, y: y + 8, w: 46, h: 46, fontSize: 15, fontWeight: 800, color: active ? readableInk(s.accent) : s.muted, align: 'center', valign: 'middle' }),
          text(lines(content[`item${n}`]), { ...base, role: 'body', x: m + 78, y, w: w - m * 2 - 78, h: 58, fontSize: active ? s.bodySize + 5 : s.bodySize + 1, fontWeight: active ? 750 : 500, color: active ? s.ink : s.muted, valign: 'middle' }),
          ...(i < items.length - 1 ? [defaultShape('line', { x: m + 23, y: y + 54, w: 1, h: Math.max(8, rowH - 46), stroke: s.muted, strokeWidth: 1, fill: 'transparent' })] : []),
        ]
      }),
    ]
  } else if (recipe.id === 'quote-insight') {
    const quoteX = m + Math.round(w * 0.08)
    elements = [
      text(lines(content.title), { ...base, role: 'kicker', x: m, y: m, w: w - m * 2, h: 42, fontSize: 17, fontWeight: 800, color: s.ink, letterSpacing: 2 }),
      text('“', { ...base, x: m, y: m + 72, w: 92, h: 140, fontFamily: s.family, fontSize: 112, fontWeight: 700, color: s.ink, lineHeight: 1 }),
      text(lines(content.quote), { ...base, role: 'title', x: quoteX, y: m + 100, w: w - quoteX - m, h: 290, fontFamily: s.family, fontSize: Math.max(36, s.titleSize - 12), fontWeight: 600, lineHeight: 1.16 }),
      defaultShape('rect', { x: quoteX, y: h - m - 142, w: 64, h: 5, fill: s.accent, radius: 3 }),
      text(lines(content.attribution), { ...base, role: 'subtitle', x: quoteX + 86, y: h - m - 156, w: w - quoteX - m - 86, h: 42, fontSize: 19, fontWeight: 750 }),
      text(lines(content.context), { ...base, role: 'caption', x: quoteX + 86, y: h - m - 108, w: w - quoteX - m - 86, h: 65, fontSize: 17, color: s.muted, lineHeight: 1.35 }),
    ]
  } else if (recipe.id === 'process-timeline') {
    const steps = [1, 2, 3, 4].filter((n) => content[`step${n}`])
    const usable = w - m * 2, segment = usable / Math.max(1, steps.length)
    elements = [
      text(lines(content.title), { ...base, role: 'title', x: m, y: m, w: usable, h: 90, fontFamily: s.family, fontSize: s.titleSize - 12, fontWeight: s.titleWeight }),
      defaultShape('line', { x: m + segment / 2, y: Math.round(h * 0.49), w: Math.max(1, usable - segment), h: 1, stroke: s.muted, strokeWidth: 2, fill: 'transparent' }),
      ...steps.flatMap((n, i) => {
        const cx = m + segment * i + segment / 2, accent = i === steps.length - 1
        return [
          text(String(n).padStart(2, '0'), { ...base, x: cx - 35, y: Math.round(h * 0.34), w: 70, h: 38, fontSize: 16, fontWeight: 800, color: s.muted, align: 'center' }),
          defaultShape('ellipse', { x: cx - 14, y: Math.round(h * 0.49) - 14, w: 28, h: 28, fill: accent ? s.accent : s.bg, stroke: accent ? s.accent : s.ink, strokeWidth: 3 }),
          text(lines(content[`step${n}`]), { ...base, role: 'subtitle', x: cx - segment / 2 + 12, y: Math.round(h * 0.57), w: segment - 24, h: 58, fontSize: 24, fontWeight: 750, color: s.ink, align: 'center' }),
          text(lines(content[`detail${n}`]), { ...base, role: 'body', x: cx - segment / 2 + 12, y: Math.round(h * 0.67), w: segment - 24, h: 52, fontSize: 17, color: s.muted, align: 'center' }),
        ]
      }),
    ]
  } else if (recipe.id === 'data-chart-takeaway') {
    const points = [1, 2, 3, 4].filter((n) => content[`label${n}`] && content[`value${n}`])
    const values = points.map((n) => Number.parseFloat(content[`value${n}`].replace(/[^0-9+-.]/g, '')) || 0)
    const labels = points.map((n) => content[`label${n}`])
    const chartW = Math.round((w - m * 2) * 0.61), sideX = m + chartW + gap
    elements = [
      text(lines(content.title), { ...base, role: 'title', x: m, y: m, w: w - m * 2, h: 82, fontFamily: s.family, fontSize: s.titleSize - 16, fontWeight: s.titleWeight }),
      defaultChart({
        color: [s.accent], grid: { left: 44, right: 18, top: 18, bottom: 48 },
        xAxis: { type: 'category', data: labels, axisTick: { show: false }, axisLabel: { color: s.muted } },
        yAxis: { type: 'value', axisLabel: { color: s.muted }, splitLine: { lineStyle: { color: s.muted } } },
        series: [{ type: 'bar', data: values, itemStyle: { borderRadius: [7, 7, 0, 0] } }],
      }, { x: m, y: m + 120, w: chartW, h: h - m * 2 - 150, preset: 'bar' }),
      defaultShape('rect', { x: sideX, y: m + 128, w: w - m - sideX, h: h - m * 2 - 170, fill: s.surface, stroke: s.accent, strokeWidth: 2, radius: s.radius }),
      defaultShape('rect', { x: sideX + 30, y: m + 164, w: 62, h: 6, fill: s.accent, radius: 3 }),
      text(lines(content.takeaway), { ...base, role: 'takeaway', x: sideX + 30, y: m + 205, w: w - m - sideX - 60, h: 245, fontSize: s.bodySize + 2, fontWeight: 650, lineHeight: 1.3 }),
      text(lines(content.source), { ...base, role: 'caption', x: sideX + 30, y: h - m - 82, w: w - m - sideX - 60, h: 44, fontSize: 14, color: s.muted }),
    ]
  } else if (recipe.id === 'image-narrative') {
    const imageW = Math.round(w * 0.58), panelW = w - imageW
    elements = [
      defaultImage(content.image, { x: panelW, y: 0, w: imageW, h, fit: 'cover', radius: 0 }),
      defaultShape('rect', { x: 0, y: 0, w: panelW, h, fill: s.bg, radius: 0 }),
      defaultShape('rect', { x: m, y: m, w: 72, h: 6, fill: s.accent, radius: 3 }),
      text(lines(content.title), { ...base, role: 'title', x: m, y: m + 62, w: panelW - m * 1.55, h: 190, fontFamily: s.family, fontSize: s.titleSize - 8, fontWeight: s.titleWeight, lineHeight: 1.04 }),
      text(lines(content.caption), { ...base, role: 'body', x: m, y: m + 292, w: panelW - m * 1.55, h: 190, fontSize: s.bodySize - 2, lineHeight: 1.4, color: s.muted }),
      text(lines(content.credit), { ...base, role: 'caption', x: m, y: h - m - 32, w: panelW - m * 1.55, h: 26, fontSize: 14, color: s.muted }),
    ]
  } else if (recipe.id === 'closing-decision') {
    const stripY = h - m - 118
    elements = [
      text(lines(content.title), { ...base, role: 'kicker', x: m, y: m, w: w - m * 2, h: 72, fontSize: 18, fontWeight: 800, color: s.ink, letterSpacing: 1.5 }),
      text(lines(content.decision), { ...base, role: 'title', x: m, y: m + 105, w: w - m * 2, h: 280, fontFamily: s.family, fontSize: s.titleSize - 2, fontWeight: s.titleWeight, lineHeight: 1.08 }),
      defaultShape('rect', { x: m, y: stripY, w: w - m * 2, h: 118, fill: s.accent, radius: s.radius }),
      text(lines(content.nextStep), { ...base, role: 'body', x: m + 30, y: stripY + 24, w: Math.round((w - m * 2) * 0.52), h: 70, fontSize: 24, fontWeight: 800, color: readableInk(s.accent), valign: 'middle' }),
      text(lines(content.owner), { ...base, role: 'caption', x: m + Math.round((w - m * 2) * 0.56), y: stripY + 24, w: Math.round((w - m * 2) * 0.2), h: 70, fontSize: 16, fontWeight: 650, color: readableInk(s.accent), valign: 'middle' }),
      text(lines(content.timing), { ...base, role: 'caption', x: m + Math.round((w - m * 2) * 0.78), y: stripY + 24, w: Math.round((w - m * 2) * 0.18) - 24, h: 70, fontSize: 16, color: readableInk(s.accent), align: 'right', valign: 'middle' }),
    ]
  }
  return { id, name: content.title || recipe.name, background: s.bg, transition: 'fade', notes: '', elements }
}
