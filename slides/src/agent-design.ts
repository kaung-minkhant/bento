// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento/Suite authors

import type { BentoDoc, DesignTokens, SlideElement, TypographyToken } from './model'

interface Counted<T> { value: T; uses: number }

function count<T>(map: Map<string, Counted<T>>, key: string, value: T) {
  const hit = map.get(key)
  if (hit) hit.uses += 1
  else map.set(key, { value, uses: 1 })
}

function ranked<T>(map: Map<string, Counted<T>>, limit = 12): Counted<T>[] {
  return [...map.values()].sort((a, b) => b.uses - a.uses).slice(0, limit)
}

function plainText(html: string): string {
  return html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

function rounded(value: number): number { return Math.round(value / 4) * 4 }

function typographyKey(style: TypographyToken): string {
  return [style.fontFamily, style.fontSize, style.fontWeight, style.lineHeight, style.letterSpacing ?? '', style.color].join('|')
}

function inferredRole(style: TypographyToken): string {
  const size = style.fontSize ?? 0
  if (size >= 60) return 'display'
  if (size >= 32) return 'title'
  if (size >= 21) return 'subtitle'
  if (size >= 14) return 'body'
  return (style.letterSpacing ?? 0) >= 1 ? 'label' : 'caption'
}

/** Read-only statistical fingerprint of the deck's actual visual language. */
export function inspectDesignLanguage(doc: BentoDoc) {
  const colors = new Map<string, Counted<string>>()
  const typography = new Map<string, Counted<TypographyToken & { examples: string[] }>>()
  const radii = new Map<string, Counted<number>>()
  const gaps = new Map<string, Counted<number>>()
  const transitions = new Map<string, Counted<string>>()
  const elementTypes = new Map<string, Counted<string>>()
  const structures = new Map<string, Counted<string>>()
  const margins = { left: [] as number[], right: [] as number[], top: [] as number[], bottom: [] as number[] }

  count(colors, doc.theme.background, doc.theme.background)
  count(colors, doc.theme.color, doc.theme.color)
  count(colors, doc.theme.accent, doc.theme.accent)
  for (const color of doc.theme.chartPalette ?? []) count(colors, color, color)

  for (const slide of doc.slides.filter((item) => !item.stateOf)) {
    count(colors, slide.background, slide.background)
    count(transitions, slide.transition, slide.transition)
    const typeCounts = new Map<string, number>()
    for (const element of slide.elements) {
      count(elementTypes, element.type, element.type)
      typeCounts.set(element.type, (typeCounts.get(element.type) ?? 0) + 1)
      collectElementVisuals(element, colors, typography, radii)
    }
    const signature = [...typeCounts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([type, uses]) => `${type}:${uses}`).join('|') || 'blank'
    count(structures, signature, signature)
    if (slide.elements.length) {
      margins.left.push(Math.min(...slide.elements.map((element) => element.x)))
      margins.right.push(doc.size.width - Math.max(...slide.elements.map((element) => element.x + element.w)))
      margins.top.push(Math.min(...slide.elements.map((element) => element.y)))
      margins.bottom.push(doc.size.height - Math.max(...slide.elements.map((element) => element.y + element.h)))
      collectGaps(slide.elements, gaps)
    }
  }

  const roleUses = new Map<string, number>()
  const typeRows = ranked(typography, 16)
    .sort((a, b) => (b.value.fontSize ?? 0) - (a.value.fontSize ?? 0))
    .map((entry) => {
      const base = inferredRole(entry.value)
      const sequence = (roleUses.get(base) ?? 0) + 1
      roleUses.set(base, sequence)
      return { role: sequence === 1 ? base : `${base}-${sequence}`, ...entry }
    })
  return {
    declared: structuredClone(doc.theme.design ?? {}) as DesignTokens,
    inferred: {
      colors: ranked(colors),
      typography: typeRows,
      spacing: {
        canvasMargins: {
          left: median(margins.left), right: median(margins.right),
          top: median(margins.top), bottom: median(margins.bottom),
        },
        commonGaps: ranked(gaps, 10),
      },
      radii: ranked(radii, 10),
      transitions: ranked(transitions),
      elementTypes: ranked(elementTypes),
      slideStructures: ranked(structures, 10),
    },
    slideCount: doc.slides.filter((slide) => !slide.stateOf).length,
  }
}

function collectElementVisuals(
  element: SlideElement,
  colors: Map<string, Counted<string>>,
  typography: Map<string, Counted<TypographyToken & { examples: string[] }>>,
  radii: Map<string, Counted<number>>,
) {
  if (element.type === 'text') {
    count(colors, element.color, element.color)
    const style: TypographyToken = {
      fontFamily: element.fontFamily, fontSize: element.fontSize, fontWeight: element.fontWeight,
      lineHeight: element.lineHeight, letterSpacing: element.letterSpacing, color: element.color,
    }
    const key = typographyKey(style)
    const hit = typography.get(key)
    const example = plainText(element.html).slice(0, 80)
    if (hit) {
      hit.uses += 1
      if (example && hit.value.examples.length < 3 && !hit.value.examples.includes(example)) hit.value.examples.push(example)
    } else typography.set(key, { value: { ...style, examples: example ? [example] : [] }, uses: 1 })
  } else if (element.type === 'shape') {
    if (element.fill && element.fill !== 'transparent') count(colors, element.fill, element.fill)
    if (element.stroke && element.stroke !== 'transparent') count(colors, element.stroke, element.stroke)
    if (element.radius !== undefined) count(radii, String(rounded(element.radius)), rounded(element.radius))
  } else if (element.type === 'table') {
    for (const color of [element.style.headerBg, element.style.headerColor, element.style.borderColor, element.style.color]) {
      if (color) count(colors, color, color)
    }
    if (element.style.radius !== undefined) count(radii, String(rounded(element.style.radius)), rounded(element.style.radius))
  }
}

function collectGaps(elements: SlideElement[], gaps: Map<string, Counted<number>>) {
  const byX = [...elements].sort((a, b) => a.x - b.x)
  const byY = [...elements].sort((a, b) => a.y - b.y)
  for (let i = 1; i < byX.length; i++) {
    const gap = rounded(byX[i].x - (byX[i - 1].x + byX[i - 1].w))
    if (gap >= 0 && gap <= 240) count(gaps, String(gap), gap)
  }
  for (let i = 1; i < byY.length; i++) {
    const gap = rounded(byY[i].y - (byY[i - 1].y + byY[i - 1].h))
    if (gap >= 0 && gap <= 240) count(gaps, String(gap), gap)
  }
}

function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = values.map(rounded).sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}
