// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento/Suite authors

import type { InspectionFinding } from './agent-inspect'

export type ProposalVerificationStatus = 'checking' | 'passed' | 'issues' | 'failed'

export interface ProposalVerificationSlide {
  slideId: string
  name: string | null
  width: number
  height: number
  image?: string
  warnings: string[]
  findings: ProposalVerificationFinding[]
  elementLabels: Record<string, string>
  error?: string
}

export type ProposalVerificationFinding = InspectionFinding & { introduced: boolean }

export interface ProposalVerification {
  status: ProposalVerificationStatus
  revision: number
  startedAt: number
  completedAt?: number
  issueCount: number
  existingIssueCount: number
  slides: ProposalVerificationSlide[]
  truncated: boolean
}

export function completeProposalVerification(
  verification: ProposalVerification,
  slides: ProposalVerificationSlide[],
  completedAt = Date.now(),
): ProposalVerification {
  const issueCount = slides.reduce((count, slide) => count + slide.findings.filter((finding) => finding.introduced).length + (slide.error ? 1 : 0), 0)
  const existingIssueCount = slides.reduce((count, slide) => count + slide.findings.filter((finding) => !finding.introduced).length, 0)
  const failed = slides.length > 0 && slides.every((slide) => !!slide.error)
  return {
    ...verification,
    status: failed ? 'failed' : issueCount > 0 ? 'issues' : 'passed',
    completedAt,
    issueCount,
    existingIssueCount,
    slides: structuredClone(slides),
  }
}

function findingKey(finding: InspectionFinding): string {
  return `${finding.code}:${[...finding.elementIds].sort().join(',')}`
}

export function classifyVerificationFindings(
  findings: InspectionFinding[],
  baseline: InspectionFinding[],
): ProposalVerificationFinding[] {
  const existing = new Set(baseline.map(findingKey))
  return findings.map((finding) => ({ ...structuredClone(finding), introduced: !existing.has(findingKey(finding)) }))
}
