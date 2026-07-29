import assert from 'node:assert/strict'
import { completeProposalVerification, type ProposalVerification } from '../slides/src/agent-verification.ts'

const checking: ProposalVerification = {
  status: 'checking', revision: 7, startedAt: 10, issueCount: 0, slides: [], truncated: false,
}

const passed = completeProposalVerification(checking, [{ slideId: 'slide-1', name: 'Opening', warnings: [], findings: [] }], 20)
assert.equal(passed.status, 'passed')
assert.equal(passed.issueCount, 0)
assert.equal(passed.completedAt, 20)

const issues = completeProposalVerification(checking, [{
  slideId: 'slide-1', name: 'Opening', warnings: ['External image omitted.'],
  findings: [{ code: 'text_overflow', severity: 'warning', confidence: 'high', elementIds: ['title'], message: 'Title overflows.' }],
}], 21)
assert.equal(issues.status, 'issues')
assert.equal(issues.issueCount, 2)

const failed = completeProposalVerification(checking, [{ slideId: 'slide-1', name: null, warnings: [], findings: [], error: 'Render failed.' }], 22)
assert.equal(failed.status, 'failed')
assert.equal(failed.issueCount, 1)

console.log('agent verification: all assertions passed')
