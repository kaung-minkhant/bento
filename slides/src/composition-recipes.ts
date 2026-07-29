// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento/Suite authors

import { defaultShape, defaultText, readableInk, uid, type BentoDoc, type Slide, type SlideElement } from './model'

export type CompositionRecipeId = 'title-thesis' | 'comparison' | 'academic-results'

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
      text(lines(content.eyebrow), { ...base, x: m + 42, y: m + 8, w: w - m * 2 - 42, h: 40, fontSize: 17, fontWeight: 700, color: s.accent, letterSpacing: 2 }),
      text(lines(content.title), { ...base, x: m + 42, y: m + 82, w: w - m * 2 - 42, h: 180, fontFamily: s.family, fontSize: s.titleSize, fontWeight: s.titleWeight, lineHeight: 1.02 }),
      text(lines(content.thesis), { ...base, x: m + 42, y: m + 300, w: Math.min(850, w - m * 2 - 42), h: 190, fontSize: s.bodySize + 6, lineHeight: 1.3 }),
      text(lines(content.source), { ...base, x: m + 42, y: h - m - 34, w: w - m * 2, h: 28, fontSize: 15, color: s.muted }),
    ]
  } else if (recipe.id === 'comparison') {
    const cardW = (w - m * 2 - gap) / 2, cardY = m + 145, cardH = h - cardY - m - 68
    const card = (x: number, heading: string, body: string, accent: boolean): SlideElement[] => [
      defaultShape('rect', { x, y: cardY, w: cardW, h: cardH, fill: s.surface, stroke: accent ? s.accent : s.muted, strokeWidth: accent ? 3 : 1, radius: s.radius }),
      text(lines(heading), { ...base, x: x + 34, y: cardY + 32, w: cardW - 68, h: 52, fontSize: 27, fontWeight: 700, color: accent ? s.accent : s.ink }),
      text(lines(body), { ...base, x: x + 34, y: cardY + 108, w: cardW - 68, h: cardH - 138, fontSize: s.bodySize, lineHeight: 1.45 }),
    ]
    elements = [
      text(lines(content.title), { ...base, x: m, y: m, w: w - m * 2, h: 100, fontFamily: s.family, fontSize: s.titleSize - 10, fontWeight: s.titleWeight }),
      ...card(m, content.leftTitle, content.leftBody, false), ...card(m + cardW + gap, content.rightTitle, content.rightBody, true),
      text(lines(content.takeaway), { ...base, x: m, y: h - m - 38, w: w - m * 2, h: 32, fontSize: 18, fontWeight: 600, color: s.accent, align: 'center' }),
    ]
  } else {
    const metrics = [1, 2, 3].filter((n) => content[`metric${n}`] || content[`label${n}`])
    const metricW = (w - m * 2 - gap * Math.max(0, metrics.length - 1)) / Math.max(1, metrics.length)
    elements = [
      text(lines(content.title), { ...base, x: m, y: m, w: w - m * 2, h: 90, fontFamily: s.family, fontSize: s.titleSize - 14, fontWeight: s.titleWeight }),
      text(lines(content.finding), { ...base, x: m, y: m + 112, w: w - m * 2, h: 150, fontSize: s.bodySize + 5, lineHeight: 1.25 }),
      ...metrics.flatMap((n, i) => {
        const x = m + i * (metricW + gap), y = m + 310
        return [
          defaultShape('rect', { x, y, w: metricW, h: 190, fill: s.surface, stroke: i === 0 ? s.accent : s.muted, strokeWidth: i === 0 ? 3 : 1, radius: s.radius }),
          text(lines(content[`metric${n}`]), { ...base, x: x + 26, y: y + 32, w: metricW - 52, h: 75, fontSize: 46, fontWeight: 750, color: i === 0 ? s.accent : s.ink }),
          text(lines(content[`label${n}`]), { ...base, x: x + 26, y: y + 116, w: metricW - 52, h: 48, fontSize: 18, color: s.muted }),
        ]
      }),
      text(lines(content.source), { ...base, x: m, y: h - m - 30, w: w - m * 2, h: 25, fontSize: 14, color: s.muted }),
    ]
  }
  return { id, name: content.title || recipe.name, background: s.bg, transition: 'fade', notes: '', elements }
}
