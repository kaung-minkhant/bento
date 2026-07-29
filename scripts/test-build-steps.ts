import assert from 'node:assert/strict'
import { BuildStepState, buildSteps } from '../slides/src/build-steps.ts'
import { emptySlide, defaultText } from '../slides/src/model.ts'
import { applyAgentOperations, prepareAgentOperations } from '../slides/src/agent-operations.ts'
import { newDoc } from '../slides/src/model.ts'

const slide = emptySlide({ name: 'Build test' })
slide.id = 'slide-build-test'
const always = defaultText({ id: 'always', html: 'Always visible' })
const oneA = defaultText({ id: 'one-a', html: 'Step one A', buildStep: 1 })
const oneB = defaultText({ id: 'one-b', html: 'Step one B', buildStep: 1 })
const three = defaultText({ id: 'three', html: 'Step three', buildStep: 3 })
const invalid = defaultText({ id: 'legacy-invalid', html: 'Invalid remains visible', buildStep: 0 })
slide.elements = [always, oneA, oneB, three, invalid]

assert.deepEqual(buildSteps(slide), [1, 3], 'steps are unique, sorted, and gaps are allowed')

const state = new BuildStepState()
assert.deepEqual(state.enter(slide, 'forward'), { position: 0, total: 2, revealedSteps: [], remainingSteps: [1, 3] })
assert.equal(state.isVisible(slide, always), true)
assert.equal(state.isVisible(slide, invalid), true)
assert.equal(state.isVisible(slide, oneA), false)

assert.deepEqual(state.forward(slide), { kind: 'reveal', step: 1, position: 1, total: 2 })
assert.equal(state.isVisible(slide, oneA), true)
assert.equal(state.isVisible(slide, oneB), true, 'equal steps reveal together')
assert.equal(state.isVisible(slide, three), false)
assert.deepEqual(state.forward(slide), { kind: 'reveal', step: 3, position: 2, total: 2 })
assert.deepEqual(state.forward(slide), { kind: 'advance-slide', position: 2, total: 2 })

assert.deepEqual(state.backward(slide), { kind: 'hide', step: 3, position: 1, total: 2 })
assert.equal(state.isVisible(slide, three), false)
assert.deepEqual(state.backward(slide), { kind: 'hide', step: 1, position: 0, total: 2 })
assert.deepEqual(state.backward(slide), { kind: 'previous-slide', position: 0, total: 2 })

state.enter(slide, 'backward')
assert.equal(state.progress(slide).position, 2, 'backward entry starts fully revealed')
state.backward(slide)
assert.equal(state.enter(slide, 'restore').position, 1, 'interactive detours preserve progress')
assert.equal(state.enter(slide, 'jump').position, 0, 'explicit jumps restart the build')
state.showAll(slide)
assert.equal(state.progress(slide).position, 2)
state.reset()
assert.equal(state.progress(slide).position, 0)

const doc = newDoc()
const target = defaultText({ id: 'agent-build-target', html: 'Target' })
doc.slides[0].elements.push(target)
applyAgentOperations(doc, prepareAgentOperations([{ type: 'update_element', slideId: doc.slides[0].id, elementId: target.id, patch: { buildStep: 4 } }]))
assert.equal(target.buildStep, 4, 'agent operations set a valid build step')
applyAgentOperations(doc, prepareAgentOperations([{ type: 'update_element', slideId: doc.slides[0].id, elementId: target.id, patch: { buildStep: null } }]))
assert.equal(target.buildStep, undefined, 'null clears a build step')
assert.throws(() => applyAgentOperations(doc, prepareAgentOperations([{ type: 'update_element', slideId: doc.slides[0].id, elementId: target.id, patch: { buildStep: 0 } }])), /integer between 1 and 999/)
assert.throws(() => applyAgentOperations(doc, prepareAgentOperations([{ type: 'update_element', slideId: doc.slides[0].id, elementId: target.id, patch: { buildStep: 1.5 } }])), /integer between 1 and 999/)

console.log('build-step state: all assertions passed')
