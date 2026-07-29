// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento/Suite authors

import type { BentoDoc, Slide, SlideElement, TextElement } from './model'

export type DeckQualitySeverity = 'warning' | 'info'
export type DeckQualityCategory = 'hierarchy' | 'rhythm' | 'consistency' | 'density' | 'variety' | 'narrative' | 'semantics'

export interface DeckQualityFinding {
  code: string
  category: DeckQualityCategory
  severity: DeckQualitySeverity
  slideIds: string[]
  elementIds: string[]
  message: string
  evidence: Record<string, string | number | string[]>
  suggestion: string
}

export interface DeckQualityReport {
  score: number
  rating: 'excellent' | 'good' | 'needs-attention'
  slideCount: number
  findings: DeckQualityFinding[]
  summary: { warnings: number; info: number; categories: Partial<Record<DeckQualityCategory, number>> }
  checked: DeckQualityCategory[]
  narrative: {
    titleCoveragePercent: number
    semanticRoleCoveragePercent: number
    slides: Array<{
      slideId: string
      index: number
      title?: string
      titleElementId?: string
      wordCount: number
      roles: string[]
      signals: string[]
    }>
  }
}

const checked: DeckQualityCategory[] = ['hierarchy', 'rhythm', 'consistency', 'density', 'variety', 'narrative', 'semantics']
const textOf = (element: TextElement) => element.html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
const words = (slide: Slide) => slide.elements.filter((item): item is TextElement => item.type === 'text').reduce((sum, item) => sum + (textOf(item).match(/\S+/g)?.length ?? 0), 0)
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0
const round = (value: number) => Math.round(value)
const signature = (slide: Slide) => {
  const counts = new Map<string, number>()
  for (const element of slide.elements) counts.set(element.type, (counts.get(element.type) ?? 0) + 1)
  return [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([type, count]) => `${type}:${count}`).join('|') || 'blank'
}

function meaningfulElements(doc: BentoDoc, slide: Slide): SlideElement[] {
  const canvasArea = doc.size.width * doc.size.height
  return slide.elements.filter((item) => {
    if (item.opacity <= .05 || item.w * item.h > canvasArea * .88) return false
    if (item.type !== 'shape') return true
    if (item.shape === 'line' || item.shape === 'path') return false
    return item.w * item.h > canvasArea * .002
  })
}

function occupiedRatio(doc: BentoDoc, elements: SlideElement[]): number {
  const columns = 16, rows = 9, occupied = new Set<number>()
  for (const item of elements) {
    const x0 = Math.max(0, Math.floor(item.x / doc.size.width * columns))
    const x1 = Math.min(columns - 1, Math.floor((item.x + item.w) / doc.size.width * columns))
    const y0 = Math.max(0, Math.floor(item.y / doc.size.height * rows))
    const y1 = Math.min(rows - 1, Math.floor((item.y + item.h) / doc.size.height * rows))
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) occupied.add(y * columns + x)
  }
  return occupied.size / (columns * rows)
}

function margins(doc: BentoDoc, slide: Slide) {
  const elements = meaningfulElements(doc, slide)
  if (!elements.length) return null
  return {
    left: Math.min(...elements.map((item) => item.x)),
    right: doc.size.width - Math.max(...elements.map((item) => item.x + item.w)),
    top: Math.min(...elements.map((item) => item.y)),
    bottom: doc.size.height - Math.max(...elements.map((item) => item.y + item.h)),
  }
}

function styleKey(element: TextElement) {
  return [element.fontFamily, Math.round(element.fontSize / 2) * 2, Math.round(element.fontWeight / 100) * 100].join('|')
}

function titleOf(doc: BentoDoc, slide: Slide): TextElement | undefined {
  const texts = slide.elements.filter((item): item is TextElement => item.type === 'text' && !!textOf(item))
  const declared = texts.filter((item) => item.role === 'title')
  if (declared.length === 1) return declared[0]
  return texts
    .filter((item) => item.y < doc.size.height * .42 && item.fontSize >= 24)
    .sort((a, b) => (b.fontSize * (b.fontWeight >= 600 ? 1.08 : 1)) - (a.fontSize * (a.fontWeight >= 600 ? 1.08 : 1)) || a.y - b.y)[0]
}

function normalizedTitle(element: TextElement | undefined): string {
  return element ? textOf(element).toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim() : ''
}

function slideSignals(slide: Slide, index: number, total: number): string[] {
  const signals: string[] = []
  if (index === 0) signals.push('opening')
  if (index === total - 1) signals.push('landing')
  if (slide.elements.some((item) => item.type === 'chart' || item.type === 'table')) signals.push('data')
  if (slide.elements.some((item) => item.type === 'image' || item.type === 'media')) signals.push('media')
  if (slide.elements.some((item) => item.buildStep !== undefined)) signals.push('builds')
  if (slide.elements.some((item) => !!item.link) || slide.hover) signals.push('interactive')
  if (slide.transition === 'morph') signals.push('morph')
  return signals
}

/** Conservative, model-only deck audit. Findings are evidence, not automatic edits. */
export function inspectDeckQuality(doc: BentoDoc): DeckQualityReport {
  const slides = doc.slides.filter((slide) => !slide.stateOf)
  const findings: DeckQualityFinding[] = []
  const add = (finding: DeckQualityFinding) => findings.push(finding)
  const narrativeSlides = slides.map((slide, index) => {
    const title = titleOf(doc, slide)
    return {
      slideId: slide.id, index, title: title ? textOf(title) : undefined, titleElementId: title?.id,
      wordCount: words(slide),
      roles: [...new Set(slide.elements.map((item) => item.role).filter((role): role is string => !!role))].sort(),
      signals: slideSignals(slide, index, slides.length),
    }
  })

  for (const slide of slides) {
    const texts = slide.elements.filter((item): item is TextElement => item.type === 'text' && !!textOf(item))
    const wordCount = words(slide)
    const content = meaningfulElements(doc, slide)
    const coverage = occupiedRatio(doc, content)
    const declaredTitles = texts.filter((item) => item.role === 'title')
    if (declaredTitles.length > 1) add({
      code: 'multiple_title_roles', category: 'semantics', severity: 'warning', slideIds: [slide.id], elementIds: declaredTitles.map((item) => item.id),
      message: 'More than one text element is marked as the slide title.', evidence: { titleRoleCount: declaredTitles.length },
      suggestion: 'Keep one title role for the main assertion and use subtitle, body, or a custom role for supporting text.',
    })
    if (declaredTitles.length === 1) {
      const title = declaredTitles[0]
      const larger = texts.filter((item) => item.id !== title.id && item.fontSize >= title.fontSize * 1.25)
      if (larger.length) add({
        code: 'title_role_mismatch', category: 'semantics', severity: 'info', slideIds: [slide.id], elementIds: [title.id, ...larger.map((item) => item.id)],
        message: 'The declared title is visually subordinate to another text element.', evidence: { titleFontSize: title.fontSize, largerTextFontSizes: larger.map((item) => String(item.fontSize)) },
        suggestion: 'Confirm the semantic title role matches the text audiences will read as the main assertion.',
      })
    }
    if (texts.length >= 2) {
      const sizes = texts.map((item) => item.fontSize)
      const largest = Math.max(...sizes), second = [...sizes].sort((a, b) => b - a)[1]
      if (largest < 30 || largest < second * 1.18) add({
        code: 'weak_hierarchy', category: 'hierarchy', severity: 'warning', slideIds: [slide.id], elementIds: texts.map((item) => item.id),
        message: 'The slide has no clearly dominant text level.', evidence: { largestFontSize: largest, secondLargestFontSize: second },
        suggestion: 'Make the main assertion visibly larger or heavier than supporting copy.',
      })
    }
    const dataVisuals = slide.elements.filter((item) => item.type === 'chart' || item.type === 'table')
    const hasTitle = texts.some((item) => item.role === 'title' || (item.fontSize >= 28 && item.y < doc.size.height * .38))
    if (dataVisuals.length && !hasTitle) add({
      code: 'unframed_data_visualization', category: 'narrative', severity: 'warning', slideIds: [slide.id], elementIds: dataVisuals.map((item) => item.id),
      message: 'A chart or table has no visible title or assertion framing it.', evidence: { chartOrTableCount: dataVisuals.length, textBoxCount: texts.length },
      suggestion: 'Add a concise assertion that tells the audience what to notice, plus a source or takeaway when relevant.',
    })
    if (wordCount > 170 || (wordCount > 110 && texts.length > 8) || (wordCount > 90 && coverage > .72)) add({
      code: 'dense_slide', category: 'density', severity: 'warning', slideIds: [slide.id], elementIds: slide.elements.map((item) => item.id),
      message: 'This slide carries substantially more material than audiences can scan quickly.',
      evidence: { meaningfulElementCount: content.length, textBoxCount: texts.length, wordCount, occupiedPercent: round(coverage * 100) },
      suggestion: 'Remove secondary detail, split the idea, or reveal supporting groups progressively.',
    })
  }

  const roleTagged = narrativeSlides.filter((row) => row.roles.length > 0)
  const titleRoleTagged = slides.filter((slide) => slide.elements.some((element) => element.role === 'title'))
  if (titleRoleTagged.length >= 2) {
    const missingTitleRole = slides.filter((slide) => {
      const texts = slide.elements.filter((item): item is TextElement => item.type === 'text' && !!textOf(item))
      return texts.length >= 2 && !!titleOf(doc, slide) && !texts.some((item) => item.role === 'title')
    })
    if (missingTitleRole.length) add({
      code: 'partial_title_role_coverage', category: 'semantics', severity: 'info', slideIds: missingTitleRole.map((slide) => slide.id), elementIds: [],
      message: 'Some visually titled slides are missing the title role used elsewhere in the deck.',
      evidence: { titleRoleTaggedSlideCount: titleRoleTagged.length, missingTitleRoleSlideCount: missingTitleRole.length },
      suggestion: 'Apply the title role to the main assertion on these slides so layouts and agents can preserve their meaning.',
    })
  }

  const roleRows = new Map<string, Array<{ slide: Slide; element: TextElement }>>()
  for (const slide of slides) for (const element of slide.elements) {
    if (element.type !== 'text' || !element.role || !textOf(element)) continue
    roleRows.set(element.role, [...(roleRows.get(element.role) ?? []), { slide, element }])
  }
  for (const [role, rows] of roleRows) {
    if (rows.length < 4) continue
    const roleStyles = new Set(rows.map((row) => styleKey(row.element)))
    if (roleStyles.size > Math.max(3, Math.ceil(rows.length * .6))) add({
      code: 'semantic_role_style_drift', category: 'semantics', severity: role === 'title' ? 'warning' : 'info',
      slideIds: [...new Set(rows.map((row) => row.slide.id))], elementIds: rows.map((row) => row.element.id),
      message: `The ${role} role uses many unrelated typography styles.`, evidence: { role, elementCount: rows.length, distinctStyleCount: roleStyles.size },
      suggestion: `Consolidate the ${role} role around a deliberate typography family while preserving intentional section-level exceptions.`,
    })
  }

  for (let start = 0; start < narrativeSlides.length;) {
    if (narrativeSlides[start].title || narrativeSlides[start].wordCount < 8) { start++; continue }
    let end = start + 1
    while (end < narrativeSlides.length && !narrativeSlides[end].title && narrativeSlides[end].wordCount >= 8) end++
    const run = narrativeSlides.slice(start, end)
    if (run.length >= 3) add({
      code: 'untitled_narrative_run', category: 'narrative', severity: 'warning', slideIds: run.map((row) => row.slideId), elementIds: [],
      message: `${run.length} consecutive content slides have no identifiable title or assertion.`, evidence: { consecutiveSlides: run.length, wordCounts: run.map((row) => String(row.wordCount)) },
      suggestion: 'Give each slide a concise assertion so the storyline remains legible in thumbnails and spoken delivery.',
    })
    start = end
  }

  for (let start = 0; start < narrativeSlides.length;) {
    const normalized = normalizedTitle(titleOf(doc, slides[start]))
    if (!normalized) { start++; continue }
    let end = start + 1
    while (end < slides.length && normalizedTitle(titleOf(doc, slides[end])) === normalized) end++
    if (end - start >= 3) add({
      code: 'repeated_narrative_titles', category: 'narrative', severity: 'info', slideIds: slides.slice(start, end).map((slide) => slide.id), elementIds: narrativeSlides.slice(start, end).map((row) => row.titleElementId!).filter(Boolean),
      message: `${end - start} consecutive slides repeat the same title.`, evidence: { consecutiveSlides: end - start, title: narrativeSlides[start].title ?? '' },
      suggestion: 'Turn repeated topic labels into specific assertions that show how the argument advances.',
    })
    start = end
  }

  for (let index = 1; index < narrativeSlides.length; index++) {
    const previous = narrativeSlides[index - 1], current = narrativeSlides[index]
    const high = Math.max(previous.wordCount, current.wordCount), low = Math.min(previous.wordCount, current.wordCount)
    if (high - low >= 80 && high / Math.max(12, low) >= 3) add({
      code: 'abrupt_density_shift', category: 'narrative', severity: 'info', slideIds: [previous.slideId, current.slideId], elementIds: [],
      message: 'Adjacent slides shift abruptly between sparse and detail-heavy storytelling.', evidence: { previousWordCount: previous.wordCount, currentWordCount: current.wordCount },
      suggestion: 'Confirm the pacing change is intentional; otherwise move supporting detail or add a bridging slide.',
    })
  }

  if (slides.length >= 4) {
    const first = narrativeSlides[0], last = narrativeSlides.at(-1)!
    if (!first.title && first.wordCount >= 12) add({
      code: 'unframed_opening', category: 'narrative', severity: 'warning', slideIds: [first.slideId], elementIds: [],
      message: 'The opening slide contains content but no identifiable title or framing assertion.', evidence: { wordCount: first.wordCount },
      suggestion: 'Open with the subject, tension, or thesis the audience should use to interpret the deck.',
    })
    if (!last.title && meaningfulElements(doc, slides.at(-1)!).length >= 3) add({
      code: 'unframed_landing', category: 'narrative', severity: 'info', slideIds: [last.slideId], elementIds: [],
      message: 'The final slide has no identifiable landing assertion.', evidence: { wordCount: last.wordCount, meaningfulElementCount: meaningfulElements(doc, slides.at(-1)!).length },
      suggestion: 'End with the conclusion, decision, or next action the audience should retain.',
    })
  }

  const marginRows = slides.map((slide) => ({ slide, value: margins(doc, slide) })).filter((row): row is { slide: Slide; value: NonNullable<ReturnType<typeof margins>> } => !!row.value)
  if (marginRows.length >= 3) {
    const typical = {
      left: median(marginRows.map((row) => row.value.left)), right: median(marginRows.map((row) => row.value.right)),
      top: median(marginRows.map((row) => row.value.top)), bottom: median(marginRows.map((row) => row.value.bottom)),
    }
    for (const row of marginRows) {
      const horizontal = Math.max(Math.abs(row.value.left - typical.left), Math.abs(row.value.right - typical.right))
      const vertical = Math.max(Math.abs(row.value.top - typical.top), Math.abs(row.value.bottom - typical.bottom))
      if (horizontal > doc.size.width * .1 || vertical > doc.size.height * .1) add({
        code: 'margin_outlier', category: 'rhythm', severity: 'info', slideIds: [row.slide.id], elementIds: row.slide.elements.map((item) => item.id),
        message: 'The slide edges differ noticeably from the deck’s typical content frame.',
        evidence: { left: round(row.value.left), right: round(row.value.right), top: round(row.value.top), bottom: round(row.value.bottom), typicalLeft: round(typical.left), typicalRight: round(typical.right), typicalTop: round(typical.top), typicalBottom: round(typical.bottom) },
        suggestion: 'Confirm this is an intentional full-bleed or section-break composition; otherwise align it to the deck frame.',
      })
    }
  }

  const textElements = slides.flatMap((slide) => slide.elements.filter((item): item is TextElement => item.type === 'text').map((element) => ({ slide, element })))
  const styles = new Map<string, typeof textElements>()
  for (const row of textElements) styles.set(styleKey(row.element), [...(styles.get(styleKey(row.element)) ?? []), row])
  if (textElements.length >= 10 && styles.size > Math.max(7, Math.ceil(textElements.length * .48))) {
    const oneOffs = [...styles.values()].filter((rows) => rows.length === 1).flat()
    const heterogeneous = new Set(slides.map((slide) => colorFamily(slide.background))).size > 2
    add({
      code: 'typography_fragmentation', category: 'consistency', severity: heterogeneous ? 'info' : 'warning', slideIds: [...new Set(oneOffs.map((row) => row.slide.id))], elementIds: oneOffs.map((row) => row.element.id),
      message: 'Typography is fragmented across many one-off styles.', evidence: { textElementCount: textElements.length, distinctStyleCount: styles.size, oneOffStyleCount: oneOffs.length },
      suggestion: 'Consolidate repeated roles into a small title, body, label, and caption scale.',
    })
  }

  const colors = new Set<string>()
  const radii = new Set<number>()
  for (const slide of slides) for (const element of slide.elements) collectSurfaceTokens(element, colors, radii)
  const colorFamilies = clusteredColors([...colors])
  const radiusFamilies = clusteredNumbers([...radii].filter((value) => value > 4), 4)
  if (colorFamilies.length > 9) add({
    code: 'palette_fragmentation', category: 'consistency', severity: 'info', slideIds: slides.map((slide) => slide.id), elementIds: [],
    message: 'The deck uses a broad set of visually distinct color families.', evidence: { explicitColorCount: colors.size, colorFamilyCount: colorFamilies.length, colors: colorFamilies.slice(0, 20) },
    suggestion: 'Map incidental colors back to a compact background, ink, accent, surface, and data palette.',
  })
  if (radiusFamilies.length > 4) add({
    code: 'radius_fragmentation', category: 'consistency', severity: 'info', slideIds: slides.map((slide) => slide.id), elementIds: [],
    message: 'Rounded surfaces use many unrelated corner-radius families.', evidence: { explicitRadiusCount: radii.size, radiusFamilyCount: radiusFamilies.length, radii: radiusFamilies.map(String) },
    suggestion: 'Reduce corners to two or three intentional radius tokens.',
  })

  for (let start = 0; start < slides.length;) {
    let end = start + 1
    while (end < slides.length && signature(slides[end]) === signature(slides[start])) end++
    if (end - start >= 3 && signature(slides[start]) !== 'blank') add({
      code: 'repetitive_sequence', category: 'variety', severity: 'info', slideIds: slides.slice(start, end).map((slide) => slide.id), elementIds: [],
      message: `${end - start} consecutive slides use the same element structure.`, evidence: { consecutiveSlides: end - start, structure: signature(slides[start]) },
      suggestion: 'Vary emphasis or composition when the narrative changes, while preserving the design system.',
    })
    start = end
  }

  if (slides.length >= 4) {
    const last = slides.at(-1)!
    if (words(last) > 100) add({
      code: 'dense_ending', category: 'narrative', severity: 'info', slideIds: [last.id], elementIds: last.elements.map((item) => item.id),
      message: 'The deck ends on a detail-heavy slide rather than a concise landing point.', evidence: { meaningfulElementCount: meaningfulElements(doc, last).length, wordCount: words(last) },
      suggestion: 'Consider ending with the conclusion, decision, or next action the audience should retain.',
    })
  }

  const warnings = findings.filter((item) => item.severity === 'warning').length
  const info = findings.length - warnings
  const score = Math.max(0, 100 - Math.min(56, warnings * 8) - Math.min(12, info))
  const categories: DeckQualityReport['summary']['categories'] = {}
  for (const finding of findings) categories[finding.category] = (categories[finding.category] ?? 0) + 1
  const narrative: DeckQualityReport['narrative'] = {
    titleCoveragePercent: slides.length ? round(narrativeSlides.filter((row) => !!row.title).length / slides.length * 100) : 0,
    semanticRoleCoveragePercent: slides.length ? round(roleTagged.length / slides.length * 100) : 0,
    slides: narrativeSlides,
  }
  return { score, rating: score >= 90 ? 'excellent' : score >= 72 ? 'good' : 'needs-attention', slideCount: slides.length, findings, summary: { warnings, info, categories }, checked, narrative }
}

function rgb(color: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{6})$/i.exec(color.trim())
  if (!match) return null
  const value = parseInt(match[1], 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

function colorFamily(color: string): string {
  const value = rgb(color)
  return value ? value.map((channel) => Math.round(channel / 64) * 64).join(',') : color.trim().toLowerCase()
}

function clusteredColors(colors: string[]): string[] {
  const families: Array<{ sample: string; rgb: [number, number, number] | null }> = []
  for (const color of colors) {
    const value = rgb(color)
    const similar = families.some((family) => value && family.rgb
      ? Math.hypot(value[0] - family.rgb[0], value[1] - family.rgb[1], value[2] - family.rgb[2]) < 62
      : family.sample.trim().toLowerCase() === color.trim().toLowerCase())
    if (!similar) families.push({ sample: color, rgb: value })
  }
  return families.map((family) => family.sample)
}

function clusteredNumbers(values: number[], tolerance: number): number[] {
  const families: number[] = []
  for (const value of values.sort((a, b) => a - b)) if (!families.some((family) => Math.abs(family - value) <= tolerance)) families.push(value)
  return families
}

function collectSurfaceTokens(element: SlideElement, colors: Set<string>, radii: Set<number>) {
  if (element.type === 'text') colors.add(element.color)
  else if (element.type === 'shape') {
    if (element.fill && element.fill !== 'transparent') colors.add(element.fill)
    if (element.stroke && element.stroke !== 'transparent') colors.add(element.stroke)
    if (element.shape === 'rect' && element.radius !== undefined) radii.add(round(element.radius))
  } else if (element.type === 'table') {
    for (const color of [element.style.headerBg, element.style.headerColor, element.style.borderColor, element.style.color]) if (color) colors.add(color)
    if (element.style.radius !== undefined) radii.add(round(element.style.radius))
  }
}
