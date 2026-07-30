import assert from 'node:assert/strict'
import { classifyVerificationFindings, completeProposalVerification, type ProposalVerification } from '../slides/src/agent-verification.ts'

const checking: ProposalVerification = {
  status: 'checking', revision: 7, startedAt: 10, issueCount: 0, existingIssueCount: 0, slides: [], truncated: false,
}

const baseSlide = { slideId: 'slide-1', name: 'Opening', width: 1280, height: 720, warnings: [], elementLabels: {} }
const passed = completeProposalVerification(checking, [{ ...baseSlide, findings: [] }], 20)
assert.equal(passed.status, 'passed')
assert.equal(passed.issueCount, 0)
assert.equal(passed.completedAt, 20)

const classified = classifyVerificationFindings([
  { code: 'text_overflow', severity: 'error', confidence: 'high', elementIds: ['existing'], message: 'Existing overflow.' },
  { code: 'low_contrast', severity: 'warning', confidence: 'high', elementIds: ['new'], message: 'New contrast issue.' },
], [{ code: 'text_overflow', severity: 'error', confidence: 'high', elementIds: ['existing'], message: 'Existing overflow.' }])
assert.equal(classified[0].introduced, false)
assert.equal(classified[1].introduced, true)
const issues = completeProposalVerification(checking, [{ ...baseSlide, warnings: ['External image omitted.'], findings: classified }], 21)
assert.equal(issues.status, 'issues')
assert.equal(issues.issueCount, 1)
assert.equal(issues.existingIssueCount, 1)

const failed = completeProposalVerification(checking, [{ ...baseSlide, name: null, findings: [], error: 'Render failed.' }], 22)
assert.equal(failed.status, 'failed')
assert.equal(failed.issueCount, 1)

console.log('agent verification: all assertions passed')
