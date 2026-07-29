import assert from 'node:assert/strict'
import { applyAgentOperations } from '../slides/src/agent-operations.ts'
import { AgentProposalRegistry } from '../slides/src/agent-proposals.ts'
import { defaultText, newDoc } from '../slides/src/model.ts'

const doc = newDoc()
doc.slides[0].elements = [defaultText({ id: 'existing', html: 'Before' })]
const registry = new AgentProposalRegistry()
const proposal = registry.create(doc, 4, {
  expectedRevision: 4,
  title: 'Clarify the opening',
  summary: 'Replace the placeholder copy with a specific assertion.',
  operations: [{ type: 'update_element', slideId: doc.slides[0].id, elementId: 'existing', patch: { html: 'After' } }],
})
assert.equal(proposal.status, 'pending')
assert.equal(proposal.operationCount, 1)
assert.deepEqual(proposal.affectedSlideIds, [doc.slides[0].id])
assert.equal(proposal.destructive, false)
assert.deepEqual(proposal.changes, [{ type: 'update_element', slideId: doc.slides[0].id, elementId: 'existing', properties: ['html'], value: 'After', destructive: false }])
assert.equal(doc.slides[0].elements[0].type === 'text' && doc.slides[0].elements[0].html, 'Before', 'proposal creation is read-only')
const preview = registry.previewDocument(proposal.id, doc, 4)
assert.equal(preview.slides[0].elements[0].type === 'text' && preview.slides[0].elements[0].html, 'After')
assert.equal(doc.slides[0].elements[0].type === 'text' && doc.slides[0].elements[0].html, 'Before', 'preview generation is read-only')

const prepared = registry.operationsForApproval(proposal.id, 4)
const applied = applyAgentOperations(doc, prepared)
assert.equal(doc.slides[0].elements[0].type === 'text' && doc.slides[0].elements[0].html, 'After')
assert.equal(registry.markApplied(proposal.id, applied, 100).status, 'applied')
assert.throws(() => registry.operationsForApproval(proposal.id, 5), /applied/)

const rejected = registry.create(doc, 5, {
  expectedRevision: 5, title: 'Delete supporting copy',
  operations: [{ type: 'delete_element', slideId: doc.slides[0].id, elementId: 'existing' }],
})
assert.equal(rejected.destructive, true)
assert.equal(rejected.changes[0].destructive, true)
assert.equal(registry.reject(rejected.id, 5, 101).status, 'rejected')

const stale = registry.create(doc, 5, {
  expectedRevision: 5, title: 'Rename the deck', operations: [{ type: 'update_deck', patch: { title: 'New name' } }],
})
assert.equal(registry.get(stale.id, 6).status, 'stale')
assert.throws(() => registry.operationsForApproval(stale.id, 6), /stale/)

assert.throws(() => registry.create(doc, 4, { expectedRevision: 3, title: 'Old plan', operations: [{ type: 'update_deck', patch: { title: 'No' } }] }), /Revision conflict/)
assert.throws(() => registry.create(doc, 4, { expectedRevision: 4, title: '', operations: [{ type: 'update_deck', patch: { title: 'No' } }] }), /title/)
assert.equal(registry.list(6).length, 3)

console.log('agent proposals: all assertions passed')
