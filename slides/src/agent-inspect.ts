// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento/Suite authors
// Read-only visual inspection for explicitly paired document agents.

import type { BentoDoc, Slide, SlideElement, TextElement } from './model'
import { renderSlide } from './render'

const SVG_NS = 'http://www.w3.org/2000/svg'
const XHTML_NS = 'http://www.w3.org/1999/xhtml'
const MIN_RENDER_WIDTH = 320
const MAX_RENDER_WIDTH = 1600
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const ASSET_WAIT_MS = 3000

export type InspectionSeverity = 'error' | 'warning' | 'info'
export type InspectionConfidence = 'high' | 'medium' | 'low'

export type InspectionFinding = {
  code: 'off_canvas' | 'text_overflow' | 'possible_overlap' | 'low_contrast'
  severity: InspectionSeverity
  confidence: InspectionConfidence
  elementIds: string[]
  message: string
  bounds?: { x: number; y: number; w: number; h: number }
  ratio?: number
}

export type SlideValidation = {
  slideId: string
  findings: InspectionFinding[]
  checked: Array<'off_canvas' | 'text_overflow' | 'overlap' | 'contrast'>
}

export type RenderedSlide = {
  slideId: string
  mimeType: 'image/png'
  data: string
  width: number
  height: number
  bytes: number
  warnings: string[]
}

type MountedSlide = { host: HTMLElement; surface: HTMLElement; slide: Slide }

function requireSlide(doc: BentoDoc, slideId: string): Slide {
  const slide = doc.slides.find((item) => item.id === slideId)
  if (!slide) throw new Error('The requested slide was not found.')
  return slide
}

function boundedWidth(width: number | undefined): number {
  const value = width ?? 1280
  if (!Number.isFinite(value) || value < MIN_RENDER_WIDTH || value > MAX_RENDER_WIDTH) {
    throw new Error(`Render width must be between ${MIN_RENDER_WIDTH} and ${MAX_RENDER_WIDTH} pixels.`)
  }
  return Math.round(value)
}

function mountSlide(doc: BentoDoc, slideId: string): MountedSlide {
  const slide = requireSlide(doc, slideId)
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText =
    'position:fixed;left:-100000px;top:0;pointer-events:none;z-index:-1;' +
    `width:${doc.size.width}px;height:${doc.size.height}px;overflow:hidden`
  const surface = renderSlide(slide, doc, { svgAsImage: true, hidePlaceholders: true })
  host.appendChild(surface)
  document.body.appendChild(host)
  return { host, surface, slide }
}

function waitWithTimeout(promise: Promise<unknown>, ms: number): Promise<void> {
  return Promise.race([
    promise.then(() => undefined, () => undefined),
    new Promise<void>((resolve) => window.setTimeout(resolve, ms)),
  ])
}

async function settleAssets(surface: HTMLElement): Promise<string[]> {
  const warnings: string[] = []
  if ('fonts' in document) await waitWithTimeout(document.fonts.ready, ASSET_WAIT_MS)
  const images = [...surface.querySelectorAll('img')]
  await waitWithTimeout(Promise.all(images.map(async (image) => {
    try {
      if (!image.complete) await image.decode()
      else if (!image.naturalWidth) warnings.push('An embedded image could not be decoded.')
    } catch {
      warnings.push('An embedded image could not be decoded.')
    }
  })), ASSET_WAIT_MS)
  return [...new Set(warnings)]
}

function inlineComputedStyles(source: Element, target: Element) {
  if ((target instanceof HTMLElement || target instanceof SVGElement) &&
      (source instanceof HTMLElement || source instanceof SVGElement)) {
    const computed = getComputedStyle(source)
    for (const property of computed) {
      target.style.setProperty(property, computed.getPropertyValue(property), computed.getPropertyPriority(property))
    }
    target.style.setProperty('animation', 'none', 'important')
    target.style.setProperty('transition', 'none', 'important')
  }
  const sourceChildren = [...source.children]
  const targetChildren = [...target.children]
  for (let index = 0; index < sourceChildren.length; index++) {
    const child = targetChildren[index]
    if (child) inlineComputedStyles(sourceChildren[index], child)
  }
}

function embeddedFontCss(doc: BentoDoc): string {
  return (doc.fonts ?? []).map((font) => {
    const source = doc.assets?.[font.asset]
    if (!source) return ''
    return `@font-face{font-family:${JSON.stringify(font.family)};src:url(${JSON.stringify(source)});` +
      `font-weight:${font.weight ?? 'normal'};font-style:${font.style ?? 'normal'};font-display:block}`
  }).join('\n')
}

function serialisedSlideSvg(doc: BentoDoc, surface: HTMLElement): string {
  const clone = surface.cloneNode(true) as HTMLElement
  clone.setAttribute('xmlns', XHTML_NS)
  inlineComputedStyles(surface, clone)

  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('xmlns', SVG_NS)
  svg.setAttribute('width', String(doc.size.width))
  svg.setAttribute('height', String(doc.size.height))
  svg.setAttribute('viewBox', `0 0 ${doc.size.width} ${doc.size.height}`)
  const fonts = embeddedFontCss(doc)
  if (fonts) {
    const style = document.createElementNS(SVG_NS, 'style')
    style.textContent = fonts
    svg.appendChild(style)
  }
  const foreignObject = document.createElementNS(SVG_NS, 'foreignObject')
  foreignObject.setAttribute('width', '100%')
  foreignObject.setAttribute('height', '100%')
  foreignObject.appendChild(clone)
  svg.appendChild(foreignObject)
  return new XMLSerializer().serializeToString(svg)
}

async function svgToPng(svg: string, width: number, height: number): Promise<Blob> {
  const image = new Image()
  image.decoding = 'async'
  // A blob URL gives the nested foreignObject an opaque origin in Chromium,
  // which taints the canvas even when every document asset is embedded. A
  // data URL stays self-contained and preserves an exportable canvas.
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas rendering is unavailable.')
  context.drawImage(image, 0, 0, width, height)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('The browser could not encode the slide preview.')
  if (blob.size > MAX_IMAGE_BYTES) throw new Error('The rendered slide exceeds the 8 MB response limit.')
  return blob
}

function blobBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('The rendered slide could not be encoded.'))
    reader.onload = () => {
      const value = String(reader.result)
      const comma = value.indexOf(',')
      if (comma < 0) reject(new Error('The rendered slide produced an invalid data URL.'))
      else resolve(value.slice(comma + 1))
    }
    reader.readAsDataURL(blob)
  })
}

export async function renderSlideImage(doc: BentoDoc, slideId: string, requestedWidth?: number): Promise<RenderedSlide> {
  const width = boundedWidth(requestedWidth)
  const height = Math.max(1, Math.round(width * doc.size.height / doc.size.width))
  const mounted = mountSlide(doc, slideId)
  try {
    const warnings = await settleAssets(mounted.surface)
    const svg = serialisedSlideSvg(doc, mounted.surface)
    const blob = await svgToPng(svg, width, height)
    return { slideId, mimeType: 'image/png', data: await blobBase64(blob), width, height, bytes: blob.size, warnings }
  } finally {
    mounted.host.remove()
  }
}

type Bounds = { x: number; y: number; w: number; h: number }

function boundsWithinSurface(node: HTMLElement, surface: HTMLElement): Bounds {
  const outer = surface.getBoundingClientRect()
  const rect = node.getBoundingClientRect()
  return { x: rect.left - outer.left, y: rect.top - outer.top, w: rect.width, h: rect.height }
}

function intersection(a: Bounds, b: Bounds): number {
  const width = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
  const height = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
  return width * height
}

function contains(a: Bounds, b: Bounds): boolean {
  const epsilon = 1
  return a.x <= b.x + epsilon && a.y <= b.y + epsilon &&
    a.x + a.w >= b.x + b.w - epsilon && a.y + a.h >= b.y + b.h - epsilon
}

function rgba(value: string): [number, number, number, number] | null {
  const match = value.match(/^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i)
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? 1 : Number(match[4])]
}

function luminance(color: [number, number, number, number]): number {
  const channels = color.slice(0, 3).map((channel) => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrastRatio(foreground: [number, number, number, number], background: [number, number, number, number]): number | null {
  if (foreground[3] !== 1 || background[3] !== 1) return null
  const light = Math.max(luminance(foreground), luminance(background))
  const dark = Math.min(luminance(foreground), luminance(background))
  return (light + 0.05) / (dark + 0.05)
}

function elementById(slide: Slide, id: string): SlideElement | undefined {
  return slide.elements.find((element) => element.id === id)
}

export async function validateSlideVisuals(doc: BentoDoc, slideId: string): Promise<SlideValidation> {
  const mounted = mountSlide(doc, slideId)
  try {
    await settleAssets(mounted.surface)
    const findings: InspectionFinding[] = []
    const nodes = [...mounted.surface.querySelectorAll<HTMLElement>(':scope > .bento-el')]
      .filter((node) => getComputedStyle(node).display !== 'none' && Number(getComputedStyle(node).opacity) > 0)
    const entries = nodes.map((node) => ({ node, id: node.dataset.elId!, bounds: boundsWithinSurface(node, mounted.surface) }))

    for (const entry of entries) {
      const { x, y, w, h } = entry.bounds
      if (x < -1 || y < -1 || x + w > doc.size.width + 1 || y + h > doc.size.height + 1) {
        findings.push({
          code: 'off_canvas', severity: 'warning', confidence: 'high', elementIds: [entry.id],
          message: 'Element extends outside the slide bounds.', bounds: entry.bounds,
        })
      }
      const element = elementById(mounted.slide, entry.id)
      if (element?.type === 'text') {
        const inner = entry.node.querySelector<HTMLElement>('.bento-text-inner')
        if (inner && (inner.scrollHeight > entry.node.clientHeight + 1 || inner.scrollWidth > entry.node.clientWidth + 1)) {
          findings.push({
            code: 'text_overflow', severity: 'error', confidence: 'high', elementIds: [entry.id],
            message: 'Text exceeds its element bounds.', bounds: entry.bounds,
          })
        }
      }
    }

    for (let first = 0; first < entries.length; first++) {
      for (let second = first + 1; second < entries.length; second++) {
        const a = entries[first]
        const b = entries[second]
        if (contains(a.bounds, b.bounds) || contains(b.bounds, a.bounds)) continue
        const area = intersection(a.bounds, b.bounds)
        const smaller = Math.min(a.bounds.w * a.bounds.h, b.bounds.w * b.bounds.h)
        if (!area || !smaller) continue
        const ratio = area / smaller
        if (ratio < 0.15) continue
        const aElement = elementById(mounted.slide, a.id)
        const bElement = elementById(mounted.slide, b.id)
        const bothText = aElement?.type === 'text' && bElement?.type === 'text'
        findings.push({
          code: 'possible_overlap', severity: bothText ? 'warning' : 'info', confidence: 'low',
          elementIds: [a.id, b.id], message: 'Elements overlap significantly; review the rendered slide to confirm intent.',
          ratio: Math.round(ratio * 1000) / 1000,
        })
      }
    }

    const surfaceStyle = getComputedStyle(mounted.surface)
    const background = surfaceStyle.backgroundImage === 'none' ? rgba(surfaceStyle.backgroundColor) : null
    if (background) {
      for (const entry of entries) {
        const element = elementById(mounted.slide, entry.id)
        if (element?.type !== 'text' || element.colorGradient || element.textStroke?.fill === 'none') continue
        const elementIndex = mounted.slide.elements.findIndex((item) => item.id === entry.id)
        const hasPaintedBackground = entries.some((candidate) => {
          const candidateIndex = mounted.slide.elements.findIndex((item) => item.id === candidate.id)
          const candidateElement = elementById(mounted.slide, candidate.id)
          return candidateIndex >= 0 && candidateIndex < elementIndex && candidateElement?.type !== 'text' &&
            intersection(entry.bounds, candidate.bounds) > entry.bounds.w * entry.bounds.h * 0.05
        })
        // Contrast against shapes, images, charts, gradients, and blended
        // layers cannot be reduced to the slide's flat background colour.
        if (hasPaintedBackground) continue
        const inner = entry.node.querySelector<HTMLElement>('.bento-text-inner')
        const foreground = inner ? rgba(getComputedStyle(inner).color) : null
        const ratio = foreground ? contrastRatio(foreground, background) : null
        if (ratio !== null && ratio < contrastThreshold(element)) {
          findings.push({
            code: 'low_contrast', severity: 'warning', confidence: 'medium', elementIds: [entry.id],
            message: `Text contrast is ${ratio.toFixed(2)}:1 against the slide background.`, ratio: Math.round(ratio * 100) / 100,
          })
        }
      }
    }

    return { slideId, findings, checked: ['off_canvas', 'text_overflow', 'overlap', 'contrast'] }
  } finally {
    mounted.host.remove()
  }
}

function contrastThreshold(element: TextElement): number {
  return element.fontSize >= 18 || (element.fontSize >= 14 && element.fontWeight >= 700) ? 3 : 4.5
}
