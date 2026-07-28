// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento/Suite authors

import {
  defaultShape, defaultText, emptySlide, uid,
  type BentoDoc, type ShapeElement, type Slide, type SlideElement, type TextElement,
  type TransitionKind,
} from './model'

type JsonObject = Record<string, unknown>

export interface PreparedAgentOperation extends JsonObject {
  type: string
}

export interface AgentOperationResult {
  created: Record<string, string>
  affectedSlideIds: string[]
  operationCount: number
}

const transitions = new Set<TransitionKind>(['none', 'fade', 'slide', 'zoom', 'morph'])
const shapeKinds = new Set<ShapeElement['shape']>(['rect', 'ellipse', 'triangle', 'arrow', 'line', 'path'])
const commonElementKeys = new Set([
  'x', 'y', 'w', 'h', 'rotation', 'opacity', 'shadow', 'blur', 'blend', 'backdropFilter',
  'fx', 'link', 'group', 'groupId', 'showOnHover', 'role', 'morphId',
])
const textKeys = new Set([
  ...commonElementKeys, 'html', 'fontSize', 'fontFamily', 'fontWeight', 'color',
  'colorGradient', 'align', 'valign', 'lineHeight', 'letterSpacing', 'textStroke', 'placeholder',
])
const shapeKeys = new Set([
  ...commonElementKeys, 'shape', 'fill', 'fillGradient', 'stroke', 'strokeWidth', 'radius',
  'strokeDash', 'strokeStyle', 'lineStart', 'lineEnd', 'd', 'pathBox', 'from', 'to',
])

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`)
  return value as JsonObject
}

function string(value: unknown, label: string, max = 100_000): string {
  if (typeof value !== 'string' || !value.length || value.length > max) throw new Error(`${label} must be a non-empty string.`)
  return value
}

function optionalString(value: unknown, label: string, max = 100_000): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string' || value.length > max) throw new Error(`${label} must be a string.`)
  return value
}

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be a finite number.`)
  return value
}

function frame(value: unknown, label: string): Pick<SlideElement, 'x' | 'y' | 'w' | 'h'> {
  const item = object(value, label)
  const result = {
    x: finite(item.x, `${label}.x`), y: finite(item.y, `${label}.y`),
    w: finite(item.w, `${label}.w`), h: finite(item.h, `${label}.h`),
  }
  if (result.w <= 0 || result.h <= 0) throw new Error(`${label} width and height must be positive.`)
  return result
}

function cleanPatch(value: unknown, allowed: Set<string>, label: string): JsonObject {
  const patch = object(value, label)
  const clean: JsonObject = {}
  for (const [key, entry] of Object.entries(patch)) {
    if (!allowed.has(key)) throw new Error(`${label}.${key} is not supported.`)
    clean[key] = structuredClone(entry)
  }
  return clean
}

/** Validate syntax and allocate permanent ids once, before preflight and commit. */
export function prepareAgentOperations(raw: unknown[]): PreparedAgentOperation[] {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 100) throw new Error('operations must contain between 1 and 100 items.')
  const clientIds = new Set<string>()
  return raw.map((entry, index) => {
    const operation = object(entry, `operations[${index}]`)
    const type = string(operation.type, `operations[${index}].type`, 80)
    const clientId = optionalString(operation.clientId, `operations[${index}].clientId`, 100)
    if (clientId) {
      if (clientIds.has(clientId)) throw new Error(`Duplicate clientId: ${clientId}.`)
      clientIds.add(clientId)
    }
    if (type === 'create_slide') {
      return {
        type, clientId, id: uid('slide'), name: optionalString(operation.name, 'name', 200),
        afterSlideId: operation.afterSlideId === null ? null : optionalString(operation.afterSlideId, 'afterSlideId', 200),
        background: optionalString(operation.background, 'background', 500),
        transition: optionalString(operation.transition, 'transition', 20),
      }
    }
    if (type === 'update_slide') {
      const patch = cleanPatch(operation.patch, new Set(['name', 'background', 'transition', 'notes']), 'patch')
      return { type, slideId: string(operation.slideId, 'slideId', 200), patch }
    }
    if (type === 'delete_slide') return { type, slideId: string(operation.slideId, 'slideId', 200) }
    if (type === 'reorder_slide') return {
      type, slideId: string(operation.slideId, 'slideId', 200),
      afterSlideId: operation.afterSlideId === null ? null : string(operation.afterSlideId, 'afterSlideId', 200),
    }
    if (type === 'create_text' || type === 'create_shape') {
      const slideId = string(operation.slideId, 'slideId', 200)
      const spec = object(operation.element, 'element')
      const bounds = frame(spec.frame, 'element.frame')
      const props = cleanPatch(spec.props ?? {}, type === 'create_text' ? textKeys : shapeKeys, 'element.props')
      if (type === 'create_text') props.html = string(spec.html, 'element.html')
      else {
        const shape = string(spec.shape, 'element.shape', 20) as ShapeElement['shape']
        if (!shapeKinds.has(shape)) throw new Error(`Unsupported shape kind: ${shape}.`)
        props.shape = shape
      }
      return { type, clientId, id: uid(type === 'create_text' ? 't' : 's'), slideId, frame: bounds, props }
    }
    if (type === 'update_element') return {
      type, slideId: string(operation.slideId, 'slideId', 200), elementId: string(operation.elementId, 'elementId', 200),
      patch: object(operation.patch, 'patch'),
    }
    if (type === 'delete_element') return {
      type, slideId: string(operation.slideId, 'slideId', 200), elementId: string(operation.elementId, 'elementId', 200),
    }
    if (type === 'reorder_element') return {
      type, slideId: string(operation.slideId, 'slideId', 200), elementId: string(operation.elementId, 'elementId', 200),
      placement: string(operation.placement, 'placement', 20),
      targetElementId: optionalString(operation.targetElementId, 'targetElementId', 200),
    }
    throw new Error(`Unsupported operation type: ${type}.`)
  })
}

function findSlide(doc: BentoDoc, id: unknown): Slide {
  const slide = doc.slides.find((item) => item.id === id)
  if (!slide) throw new Error(`Slide not found: ${String(id)}.`)
  return slide
}

function findElement(slide: Slide, id: unknown): SlideElement {
  const element = slide.elements.find((item) => item.id === id)
  if (!element) throw new Error(`Element not found: ${String(id)}.`)
  return element
}

function resolveId(value: unknown, created: Record<string, string>): unknown {
  return typeof value === 'string' && created[value] ? created[value] : value
}

function validateElementPatch(element: SlideElement, value: unknown): JsonObject {
  const allowed = element.type === 'text' ? textKeys : element.type === 'shape' ? shapeKeys : commonElementKeys
  const patch = cleanPatch(value, allowed, 'patch')
  if ('w' in patch && finite(patch.w, 'patch.w') <= 0) throw new Error('patch.w must be positive.')
  if ('h' in patch && finite(patch.h, 'patch.h') <= 0) throw new Error('patch.h must be positive.')
  if ('opacity' in patch) {
    const opacity = finite(patch.opacity, 'patch.opacity')
    if (opacity < 0 || opacity > 1) throw new Error('patch.opacity must be between 0 and 1.')
  }
  if ('shape' in patch && (!shapeKinds.has(patch.shape as ShapeElement['shape']) || element.type !== 'shape')) throw new Error('patch.shape is invalid.')
  return patch
}

/** Mutates only the supplied document. Call first on a clone, then once inside Store.commit. */
export function applyAgentOperations(doc: BentoDoc, operations: PreparedAgentOperation[]): AgentOperationResult {
  const created: Record<string, string> = {}
  const affected = new Set<string>()
  for (const operation of operations) {
    if (operation.type === 'create_slide') {
      if (operation.transition && !transitions.has(operation.transition as TransitionKind)) throw new Error(`Invalid transition: ${operation.transition}.`)
      const slide = emptySlide({
        id: operation.id as string, name: operation.name as string | undefined,
        background: operation.background as string | undefined,
        transition: operation.transition as TransitionKind | undefined,
      })
      const afterId = resolveId(operation.afterSlideId, created)
      const after = operation.afterSlideId === undefined ? doc.slides.length - 1 : operation.afterSlideId === null ? -1 : doc.slides.findIndex((item) => item.id === afterId)
      if (operation.afterSlideId && after < 0) throw new Error(`Slide not found: ${String(operation.afterSlideId)}.`)
      doc.slides.splice(after + 1, 0, slide)
      if (operation.clientId) created[operation.clientId as string] = slide.id
      affected.add(slide.id)
      continue
    }
    if (operation.type === 'update_slide') {
      const slide = findSlide(doc, resolveId(operation.slideId, created))
      const patch = operation.patch as JsonObject
      if ('transition' in patch && !transitions.has(patch.transition as TransitionKind)) throw new Error(`Invalid transition: ${String(patch.transition)}.`)
      Object.assign(slide, patch)
      affected.add(slide.id)
      continue
    }
    if (operation.type === 'delete_slide') {
      if (doc.slides.length === 1) throw new Error('A deck must contain at least one slide.')
      const slide = findSlide(doc, resolveId(operation.slideId, created))
      doc.slides.splice(doc.slides.indexOf(slide), 1)
      affected.add(slide.id)
      continue
    }
    if (operation.type === 'reorder_slide') {
      const slide = findSlide(doc, resolveId(operation.slideId, created))
      const afterId = resolveId(operation.afterSlideId, created)
      if (afterId === slide.id) throw new Error('A slide cannot be placed after itself.')
      doc.slides.splice(doc.slides.indexOf(slide), 1)
      const after = operation.afterSlideId === null ? -1 : doc.slides.findIndex((item) => item.id === afterId)
      if (operation.afterSlideId && after < 0) throw new Error(`Slide not found: ${String(operation.afterSlideId)}.`)
      doc.slides.splice(after + 1, 0, slide)
      affected.add(slide.id)
      continue
    }
    const slide = findSlide(doc, resolveId(operation.slideId, created))
    affected.add(slide.id)
    if (operation.type === 'create_text') {
      const element = defaultText({ id: operation.id as string, ...(operation.frame as Pick<TextElement, 'x' | 'y' | 'w' | 'h'>), ...(operation.props as Partial<TextElement>) })
      slide.elements.push(element)
      if (operation.clientId) created[operation.clientId as string] = element.id
      continue
    }
    if (operation.type === 'create_shape') {
      const props = operation.props as Partial<ShapeElement>
      const element = defaultShape(props.shape!, { id: operation.id as string, ...(operation.frame as Pick<ShapeElement, 'x' | 'y' | 'w' | 'h'>), ...props })
      slide.elements.push(element)
      if (operation.clientId) created[operation.clientId as string] = element.id
      continue
    }
    const element = findElement(slide, resolveId(operation.elementId, created))
    if (operation.type === 'update_element') Object.assign(element, validateElementPatch(element, operation.patch))
    else if (operation.type === 'delete_element') slide.elements.splice(slide.elements.indexOf(element), 1)
    else if (operation.type === 'reorder_element') {
      const placement = operation.placement
      const from = slide.elements.indexOf(element)
      slide.elements.splice(from, 1)
      let at = placement === 'back' ? 0 : placement === 'front' ? slide.elements.length : placement === 'backward' ? Math.max(0, from - 1) : placement === 'forward' ? Math.min(slide.elements.length, from + 1) : -1
      if (placement === 'before' || placement === 'after') {
        const target = findElement(slide, resolveId(operation.targetElementId, created))
        at = slide.elements.indexOf(target) + (placement === 'after' ? 1 : 0)
      }
      if (at < 0) throw new Error(`Invalid placement: ${String(placement)}.`)
      slide.elements.splice(at, 0, element)
    }
  }
  return { created, affectedSlideIds: [...affected], operationCount: operations.length }
}
