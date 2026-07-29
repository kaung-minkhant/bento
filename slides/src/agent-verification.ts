// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento/Suite authors

import type { InspectionFinding } from './agent-inspect'

export type ProposalVerificationStatus = 'checking' | 'passed' | 'issues' | 'failed'

export interface ProposalVerificationSlide {
  slideId: string
  name: string | null
  image?: string
  warnings: string[]
  findings: InspectionFinding[]
  error?: string
}

export interface ProposalVerification {
  status: ProposalVerificationStatus
  revision: number
  startedAt: number
  completedAt?: number
  issueCount: number
  slides: ProposalVerificationSlide[]
  truncated: boolean
}

export function completeProposalVerification(
  verification: ProposalVerification,
  slides: ProposalVerificationSlide[],
  completedAt = Date.now(),
): ProposalVerification {
  const issueCount = slides.reduce((count, slide) => count + slide.warnings.length + slide.findings.length + (slide.error ? 1 : 0), 0)
  const failed = slides.length > 0 && slides.every((slide) => !!slide.error)
  return {
    ...verification,
    status: failed ? 'failed' : issueCount > 0 ? 'issues' : 'passed',
    completedAt,
    issueCount,
    slides: structuredClone(slides),
  }
}
