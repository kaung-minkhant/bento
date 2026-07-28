// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento/Suite authors

import {
  applyChartPalette, defaultChart, defaultImage, defaultMedia, defaultShape, defaultTable, defaultText, emptySlide, internAsset, uid,
  type BentoDoc, type ChartElement, type ImageElement, type MediaElement, type ShapeElement,
  type Slide, type SlideElement, type SvgElement, type TableElement, type TextElement,
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
const imageKeys = new Set([...commonElementKeys, 'src', 'fit', 'radius'])
const svgKeys = new Set([...commonElementKeys, 'asset', 'markup', 'css'])
const chartKeys = new Set([...commonElementKeys, 'preset', 'option', 'source'])
const tableKeys = new Set([...commonElementKeys, 'columns', 'rows', 'header', 'style'])
const mediaKeys = new Set([...commonElementKeys, 'kind', 'src', 'poster', 'fit', 'radius', 'autoplay', 'loop', 'muted', 'controls'])
const createTypes = new Set(['create_text', 'create_shape', 'create_image', 'create_svg', 'create_chart', 'create_table', 'create_media'])

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
        stateOf: optionalString(operation.stateOf, 'stateOf', 200), hover: operation.hover === undefined ? undefined : object(operation.hover, 'hover'),
      }
    }
    if (type === 'update_slide') {
      const patch = cleanPatch(operation.patch, new Set(['name', 'background', 'transition', 'notes', 'stateOf', 'hover']), 'patch')
      return { type, slideId: string(operation.slideId, 'slideId', 200), patch }
    }
    if (type === 'duplicate_slide') return {
      type, clientId, id: uid('slide'), slideId: string(operation.slideId, 'slideId', 200),
      afterSlideId: operation.afterSlideId === undefined ? undefined : operation.afterSlideId === null ? null : string(operation.afterSlideId, 'afterSlideId', 200),
      name: optionalString(operation.name, 'name', 200),
    }
    if (type === 'delete_slide') return { type, slideId: string(operation.slideId, 'slideId', 200) }
    if (type === 'reorder_slide') return {
      type, slideId: string(operation.slideId, 'slideId', 200),
      afterSlideId: operation.afterSlideId === null ? null : string(operation.afterSlideId, 'afterSlideId', 200),
    }
    if (createTypes.has(type)) {
      const slideId = string(operation.slideId, 'slideId', 200)
      const spec = object(operation.element, 'element')
      const bounds = frame(spec.frame, 'element.frame')
      const allowed = type === 'create_text' ? textKeys : type === 'create_shape' ? shapeKeys : type === 'create_image' ? imageKeys :
        type === 'create_svg' ? svgKeys : type === 'create_chart' ? chartKeys : type === 'create_table' ? tableKeys : mediaKeys
      const props = cleanPatch(spec.props ?? {}, allowed, 'element.props')
      if (type === 'create_text') props.html = string(spec.html, 'element.html')
      else if (type === 'create_shape') {
        const shape = string(spec.shape, 'element.shape', 20) as ShapeElement['shape']
        if (!shapeKinds.has(shape)) throw new Error(`Unsupported shape kind: ${shape}.`)
        props.shape = shape
      }
      else if (type === 'create_image') props.src = string(spec.src, 'element.src', 20_000_000)
      else if (type === 'create_svg') {
        if (spec.asset !== undefined) props.asset = string(spec.asset, 'element.asset', 200)
        else props.markup = string(spec.markup, 'element.markup', 2_000_000)
      }
      else if (type === 'create_chart') props.option = object(spec.option, 'element.option')
      else if (type === 'create_table') {
        if (spec.columns !== undefined) props.columns = structuredClone(spec.columns)
        if (spec.rows !== undefined) props.rows = structuredClone(spec.rows)
      }
      else {
        props.kind = string(spec.kind, 'element.kind', 10)
        props.src = string(spec.src, 'element.src', 20_000_000)
      }
      const prefix = type === 'create_text' ? 't' : type === 'create_shape' ? 's' : type === 'create_image' ? 'i' :
        type === 'create_svg' ? 'v' : type === 'create_chart' ? 'c' : type === 'create_table' ? 'tbl' : 'm'
      return { type, clientId, id: uid(prefix), slideId, frame: bounds, props }
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
    if (type === 'duplicate_elements') {
      const elementIds = Array.isArray(operation.elementIds) ? operation.elementIds.map((id, item) => string(id, `elementIds[${item}]`, 200)) : []
      if (!elementIds.length || elementIds.length > 100) throw new Error('duplicate_elements requires between 1 and 100 elementIds.')
      return {
        type, clientId, slideId: string(operation.slideId, 'slideId', 200), elementIds,
        ids: elementIds.map(() => uid('e')), dx: operation.dx === undefined ? 24 : finite(operation.dx, 'dx'),
        dy: operation.dy === undefined ? 24 : finite(operation.dy, 'dy'),
      }
    }
    if (type === 'group_elements' || type === 'ungroup_elements' || type === 'align_elements' || type === 'distribute_elements') {
      const elementIds = Array.isArray(operation.elementIds) ? operation.elementIds.map((id, item) => string(id, `elementIds[${item}]`, 200)) : []
      if (!elementIds.length || elementIds.length > 100) throw new Error(`${type} requires between 1 and 100 elementIds.`)
      return {
        type, clientId, slideId: string(operation.slideId, 'slideId', 200), elementIds,
        groupId: type === 'group_elements' ? optionalString(operation.groupId, 'groupId', 200) ?? uid('group') : undefined,
        alignment: type === 'align_elements' ? string(operation.alignment, 'alignment', 20) : undefined,
        relativeTo: type === 'align_elements' ? optionalString(operation.relativeTo, 'relativeTo', 20) ?? 'selection' : undefined,
        direction: type === 'distribute_elements' ? string(operation.direction, 'direction', 20) : undefined,
      }
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
  const allowed = element.type === 'text' ? textKeys : element.type === 'shape' ? shapeKeys : element.type === 'image' ? imageKeys :
    element.type === 'svg' ? svgKeys : element.type === 'chart' ? chartKeys : element.type === 'table' ? tableKeys : mediaKeys
  const patch = cleanPatch(value, allowed, 'patch')
  for (const key of ['x', 'y', 'w', 'h', 'rotation', 'opacity', 'blur', 'backdropFilter', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'strokeWidth', 'strokeDash', 'radius']) {
    if (key in patch && patch[key] !== undefined) finite(patch[key], `patch.${key}`)
  }
  if ('w' in patch && (patch.w as number) <= 0) throw new Error('patch.w must be positive.')
  if ('h' in patch && (patch.h as number) <= 0) throw new Error('patch.h must be positive.')
  if ('opacity' in patch) {
    const opacity = finite(patch.opacity, 'patch.opacity')
    if (opacity < 0 || opacity > 1) throw new Error('patch.opacity must be between 0 and 1.')
  }
  if ('shape' in patch && (!shapeKinds.has(patch.shape as ShapeElement['shape']) || element.type !== 'shape')) throw new Error('patch.shape is invalid.')
  if ('align' in patch && !['left', 'center', 'right'].includes(String(patch.align))) throw new Error('patch.align is invalid.')
  if ('valign' in patch && !['top', 'middle', 'bottom'].includes(String(patch.valign))) throw new Error('patch.valign is invalid.')
  if ('fit' in patch && !['contain', 'cover', 'fill'].includes(String(patch.fit))) throw new Error('patch.fit is invalid.')
  if ('strokeStyle' in patch && !['solid', 'dashed', 'dotted'].includes(String(patch.strokeStyle))) throw new Error('patch.strokeStyle is invalid.')
  return patch
}

function safeSource(value: unknown, label: string): string {
  const source = string(value, label, 20_000_000)
  if (/^javascript:/i.test(source) || /^data:text\/html/i.test(source)) throw new Error(`${label} uses an unsafe source.`)
  return source
}

function safeSvgMarkup(value: unknown): string {
  const markup = string(value, 'element.markup', 2_000_000)
  if (!/^\s*<svg[\s>]/i.test(markup) || /<\s*script\b/i.test(markup) || /<\s*foreignObject\b/i.test(markup) || /\son[a-z]+\s*=/i.test(markup) || /(?:href|src)\s*=\s*["']\s*(?:javascript:|https?:)/i.test(markup) || /@import|url\s*\(\s*["']?\s*(?:javascript:|https?:|data:text\/html)/i.test(markup)) {
    throw new Error('SVG markup contains unsupported or unsafe content.')
  }
  return markup
}

function safeSvgCss(value: unknown): string {
  const css = string(value, 'element.css', 200_000)
  if (/@import|url\s*\(\s*["']?\s*(?:javascript:|https?:|data:text\/html)/i.test(css)) throw new Error('SVG CSS contains an unsafe external source.')
  return css
}

function selected(slide: Slide, ids: unknown[], created: Record<string, string>): SlideElement[] {
  const result = ids.map((id) => findElement(slide, resolveId(id, created)))
  if (new Set(result.map((item) => item.id)).size !== result.length) throw new Error('elementIds must be unique.')
  return result
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
        stateOf: operation.stateOf as string | undefined,
        hover: operation.hover as Slide['hover'],
      })
      if (slide.stateOf && !doc.slides.some((item) => item.id === resolveId(slide.stateOf, created))) throw new Error(`Parent slide not found: ${slide.stateOf}.`)
      if (slide.stateOf) slide.stateOf = resolveId(slide.stateOf, created) as string
      if (slide.hover && slide.hover.type !== 'focus-group' && slide.hover.type !== 'reveal') throw new Error('hover.type is invalid.')
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
      if ('stateOf' in patch && patch.stateOf !== undefined && patch.stateOf !== null) {
        const parentId = resolveId(patch.stateOf, created)
        if (parentId === slide.id || !doc.slides.some((item) => item.id === parentId)) throw new Error(`Invalid parent slide: ${String(patch.stateOf)}.`)
        patch.stateOf = parentId
      }
      if ('hover' in patch && patch.hover !== undefined && patch.hover !== null) {
        const hover = object(patch.hover, 'patch.hover')
        if (hover.type !== 'focus-group' && hover.type !== 'reveal') throw new Error('patch.hover.type is invalid.')
      }
      if (patch.stateOf === null) { delete slide.stateOf; delete patch.stateOf }
      if (patch.hover === null) { delete slide.hover; delete patch.hover }
      Object.assign(slide, patch)
      affected.add(slide.id)
      continue
    }
    if (operation.type === 'duplicate_slide') {
      const source = findSlide(doc, resolveId(operation.slideId, created))
      const clone = structuredClone(source)
      clone.id = operation.id as string
      if (operation.name !== undefined) clone.name = operation.name as string
      const afterId = operation.afterSlideId === undefined ? source.id : resolveId(operation.afterSlideId, created)
      const after = operation.afterSlideId === null ? -1 : doc.slides.findIndex((item) => item.id === afterId)
      if (after < 0 && operation.afterSlideId !== null) throw new Error(`Slide not found: ${String(afterId)}.`)
      doc.slides.splice(after + 1, 0, clone)
      if (operation.clientId) created[operation.clientId as string] = clone.id
      affected.add(clone.id)
      continue
    }
    if (operation.type === 'delete_slide') {
      const slide = findSlide(doc, resolveId(operation.slideId, created))
      const doomed = new Set([slide.id, ...doc.slides.filter((item) => item.stateOf === slide.id).map((item) => item.id)])
      if (!doc.slides.some((item) => !item.stateOf && !doomed.has(item.id))) throw new Error('A deck must contain at least one linear slide.')
      doc.slides = doc.slides.filter((item) => !doomed.has(item.id))
      for (const item of doc.slides) for (const element of item.elements) if (element.link && doomed.has(element.link)) delete element.link
      for (const id of doomed) affected.add(id)
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
      validateElementPatch(element, operation.props)
      slide.elements.push(element)
      if (operation.clientId) created[operation.clientId as string] = element.id
      continue
    }
    if (operation.type === 'create_shape') {
      const props = operation.props as Partial<ShapeElement>
      const element = defaultShape(props.shape!, { id: operation.id as string, ...(operation.frame as Pick<ShapeElement, 'x' | 'y' | 'w' | 'h'>), ...props })
      validateElementPatch(element, operation.props)
      slide.elements.push(element)
      if (operation.clientId) created[operation.clientId as string] = element.id
      continue
    }
    if (operation.type === 'create_image') {
      const props = operation.props as Partial<ImageElement>
      const source = internAsset(doc, safeSource(props.src, 'element.src'))
      const element = defaultImage(source, { id: operation.id as string, ...(operation.frame as Pick<ImageElement, 'x' | 'y' | 'w' | 'h'>), ...props, src: source })
      validateElementPatch(element, operation.props)
      slide.elements.push(element)
      if (operation.clientId) created[operation.clientId as string] = element.id
      continue
    }
    if (operation.type === 'create_svg') {
      const props = operation.props as Partial<SvgElement>
      if (props.markup !== undefined) props.markup = safeSvgMarkup(props.markup)
      if (props.css !== undefined) props.css = safeSvgCss(props.css)
      if (!props.markup && !props.asset) throw new Error('create_svg requires markup or an asset key.')
      if (props.asset && !doc.assets?.[props.asset]) throw new Error(`SVG asset not found: ${props.asset}.`)
      const element: SvgElement = { id: operation.id as string, type: 'svg', ...(operation.frame as Pick<SvgElement, 'x' | 'y' | 'w' | 'h'>), rotation: 0, opacity: 1, ...props }
      validateElementPatch(element, operation.props)
      slide.elements.push(element)
      if (operation.clientId) created[operation.clientId as string] = element.id
      continue
    }
    if (operation.type === 'create_chart') {
      const props = operation.props as Partial<ChartElement>
      const option = applyChartPalette(structuredClone(object(props.option, 'element.option')), doc.theme)
      const element = defaultChart(option, { id: operation.id as string, ...(operation.frame as Pick<ChartElement, 'x' | 'y' | 'w' | 'h'>), ...props, option })
      validateElementPatch(element, operation.props)
      slide.elements.push(element)
      if (operation.clientId) created[operation.clientId as string] = element.id
      continue
    }
    if (operation.type === 'create_table') {
      const props = operation.props as Partial<TableElement>
      const element = defaultTable({ id: operation.id as string, ...(operation.frame as Pick<TableElement, 'x' | 'y' | 'w' | 'h'>), ...props }, doc.theme)
      validateElementPatch(element, operation.props)
      if (!Array.isArray(element.columns) || !element.columns.length || !Array.isArray(element.rows) || !element.rows.length || element.rows.some((row) => !Array.isArray(row.cells) || row.cells.length !== element.columns.length)) throw new Error('Table rows and columns must be non-empty and rectangular.')
      slide.elements.push(element)
      if (operation.clientId) created[operation.clientId as string] = element.id
      continue
    }
    if (operation.type === 'create_media') {
      const props = operation.props as Partial<MediaElement>
      if (props.kind !== 'audio' && props.kind !== 'video') throw new Error('Media kind must be audio or video.')
      const source = internAsset(doc, safeSource(props.src, 'element.src'))
      const element = defaultMedia(props.kind, source, { id: operation.id as string, ...(operation.frame as Pick<MediaElement, 'x' | 'y' | 'w' | 'h'>), ...props, src: source })
      validateElementPatch(element, operation.props)
      slide.elements.push(element)
      if (operation.clientId) created[operation.clientId as string] = element.id
      continue
    }
    if (operation.type === 'duplicate_elements') {
      const sources = selected(slide, operation.elementIds as unknown[], created)
      const ids = operation.ids as string[]
      const clones = sources.map((element, index) => ({ ...structuredClone(element), id: ids[index], x: element.x + (operation.dx as number), y: element.y + (operation.dy as number) })) as SlideElement[]
      slide.elements.push(...clones)
      if (operation.clientId) clones.forEach((clone, index) => { created[`${operation.clientId}:${index}`] = clone.id })
      continue
    }
    if (operation.type === 'group_elements' || operation.type === 'ungroup_elements') {
      const elements = selected(slide, operation.elementIds as unknown[], created)
      for (const element of elements) {
        if (operation.type === 'group_elements') element.groupId = operation.groupId as string
        else delete element.groupId
      }
      if (operation.clientId && operation.type === 'group_elements') created[operation.clientId as string] = operation.groupId as string
      continue
    }
    if (operation.type === 'align_elements') {
      const elements = selected(slide, operation.elementIds as unknown[], created)
      const alignment = operation.alignment
      if (!['left', 'center', 'right', 'top', 'middle', 'bottom'].includes(alignment as string)) throw new Error(`Invalid alignment: ${String(alignment)}.`)
      const relativeTo = operation.relativeTo
      if (relativeTo !== 'slide' && relativeTo !== 'selection') throw new Error('relativeTo must be slide or selection.')
      const minX = relativeTo === 'slide' ? 0 : Math.min(...elements.map((item) => item.x))
      const maxX = relativeTo === 'slide' ? doc.size.width : Math.max(...elements.map((item) => item.x + item.w))
      const minY = relativeTo === 'slide' ? 0 : Math.min(...elements.map((item) => item.y))
      const maxY = relativeTo === 'slide' ? doc.size.height : Math.max(...elements.map((item) => item.y + item.h))
      for (const element of elements) {
        if (alignment === 'left') element.x = minX
        else if (alignment === 'center') element.x = (minX + maxX - element.w) / 2
        else if (alignment === 'right') element.x = maxX - element.w
        else if (alignment === 'top') element.y = minY
        else if (alignment === 'middle') element.y = (minY + maxY - element.h) / 2
        else element.y = maxY - element.h
      }
      continue
    }
    if (operation.type === 'distribute_elements') {
      const elements = selected(slide, operation.elementIds as unknown[], created)
      if (elements.length < 3) throw new Error('distribute_elements requires at least three elements.')
      const direction = operation.direction
      if (direction !== 'horizontal' && direction !== 'vertical') throw new Error('direction must be horizontal or vertical.')
      const axis = direction === 'horizontal' ? 'x' : 'y'
      const size = direction === 'horizontal' ? 'w' : 'h'
      const ordered = [...elements].sort((a, b) => a[axis] - b[axis])
      const start = ordered[0][axis]
      const end = ordered[ordered.length - 1][axis] + ordered[ordered.length - 1][size]
      const occupied = ordered.reduce((sum, item) => sum + item[size], 0)
      const gap = (end - start - occupied) / (ordered.length - 1)
      let cursor = start
      for (const element of ordered) { element[axis] = cursor; cursor += element[size] + gap }
      continue
    }
    const element = findElement(slide, resolveId(operation.elementId, created))
    if (operation.type === 'update_element') {
      const patch = validateElementPatch(element, operation.patch)
      if ((element.type === 'image' || element.type === 'media') && 'src' in patch) patch.src = internAsset(doc, safeSource(patch.src, 'patch.src'))
      if (element.type === 'media' && 'poster' in patch && patch.poster !== undefined) patch.poster = internAsset(doc, safeSource(patch.poster, 'patch.poster'))
      if (element.type === 'svg' && 'markup' in patch && patch.markup !== undefined) patch.markup = safeSvgMarkup(patch.markup)
      if (element.type === 'svg' && 'css' in patch && patch.css !== undefined) patch.css = safeSvgCss(patch.css)
      if (element.type === 'svg' && 'asset' in patch && patch.asset && !doc.assets?.[String(patch.asset)]) throw new Error(`SVG asset not found: ${String(patch.asset)}.`)
      Object.assign(element, patch)
      if (element.type === 'table' && (!Array.isArray(element.columns) || !element.columns.length || !Array.isArray(element.rows) || !element.rows.length || element.rows.some((row) => !Array.isArray(row.cells) || row.cells.length !== element.columns.length))) throw new Error('Table rows and columns must be non-empty and rectangular.')
      if (element.type === 'media' && element.kind !== 'audio' && element.kind !== 'video') throw new Error('Media kind must be audio or video.')
    }
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
