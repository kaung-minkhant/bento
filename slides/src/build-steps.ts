// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento/Suite authors

import type { Slide, SlideElement } from './model'

export type BuildEntryMode = 'forward' | 'backward' | 'jump' | 'restore'
export type BuildMove =
  | { kind: 'reveal'; step: number; position: number; total: number }
  | { kind: 'hide'; step: number; position: number; total: number }
  | { kind: 'advance-slide'; position: number; total: number }
  | { kind: 'previous-slide'; position: number; total: number }

export interface BuildProgress {
  position: number
  total: number
  revealedSteps: number[]
  remainingSteps: number[]
}

/** Sorted, unique, valid build steps. Invalid legacy values remain visible. */
export function buildSteps(slide: Slide): number[] {
  return [...new Set(slide.elements.map((element) => element.buildStep)
    .filter((step): step is number => Number.isInteger(step) && step! >= 1 && step! <= 999))]
    .sort((a, b) => a - b)
}

/**
 * Runtime-only presenter state. It never mutates the document and deliberately
 * keys progress by stable slide id so interactive-state detours can restore a
 * parent's exact build position.
 */
export class BuildStepState {
  private positions = new Map<string, number>()

  enter(slide: Slide, mode: BuildEntryMode): BuildProgress {
    const total = buildSteps(slide).length
    if (mode === 'restore' && this.positions.has(slide.id)) return this.progress(slide)
    this.positions.set(slide.id, mode === 'backward' ? total : 0)
    return this.progress(slide)
  }

  reset() { this.positions.clear() }

  showAll(slide: Slide): BuildProgress {
    this.positions.set(slide.id, buildSteps(slide).length)
    return this.progress(slide)
  }

  progress(slide: Slide): BuildProgress {
    const steps = buildSteps(slide)
    const position = Math.max(0, Math.min(this.positions.get(slide.id) ?? 0, steps.length))
    if (position !== (this.positions.get(slide.id) ?? 0)) this.positions.set(slide.id, position)
    return { position, total: steps.length, revealedSteps: steps.slice(0, position), remainingSteps: steps.slice(position) }
  }

  forward(slide: Slide): BuildMove {
    const steps = buildSteps(slide)
    const current = this.progress(slide).position
    if (current >= steps.length) return { kind: 'advance-slide', position: current, total: steps.length }
    const position = current + 1
    this.positions.set(slide.id, position)
    return { kind: 'reveal', step: steps[current], position, total: steps.length }
  }

  backward(slide: Slide): BuildMove {
    const steps = buildSteps(slide)
    const current = this.progress(slide).position
    if (current <= 0) return { kind: 'previous-slide', position: 0, total: steps.length }
    const position = current - 1
    this.positions.set(slide.id, position)
    return { kind: 'hide', step: steps[position], position, total: steps.length }
  }

  isVisible(slide: Slide, element: SlideElement): boolean {
    const step = element.buildStep
    if (!Number.isInteger(step) || step! < 1 || step! > 999) return true
    return this.progress(slide).revealedSteps.includes(step!)
  }
}

