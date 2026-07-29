// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento/Suite authors

import { applyAgentOperations, prepareAgentOperations, type AgentOperationResult, type PreparedAgentOperation } from './agent-operations'
import { parseDoc, uid, type BentoDoc } from './model'

export type AgentProposalStatus = 'pending' | 'applied' | 'rejected' | 'stale'

export interface AgentProposal {
  id: string
  title: string
  summary?: string
  status: AgentProposalStatus
  baseRevision: number
  createdAt: number
  decidedAt?: number
  operationCount: number
  affectedSlideIds: string[]
  destructive: boolean
  changes: AgentProposalChange[]
}

export interface AgentProposalChange {
  type: string
  slideId?: string
  elementId?: string
  properties: string[]
  value?: string
  destructive: boolean
}

export interface AgentProposalInput {
  expectedRevision: number
  title: string
  summary?: string
  operations: unknown[]
}

interface StoredAgentProposal extends AgentProposal {
  operations: PreparedAgentOperation[]
}

function requiredText(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new Error(`${label} must contain between 1 and ${max} characters.`)
  return value.trim()
}

function optionalText(value: unknown, label: string, max: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || value.trim().length > max) throw new Error(`${label} must contain at most ${max} characters.`)
  return value.trim() || undefined
}

function publicProposal(proposal: StoredAgentProposal): AgentProposal {
  const { operations: _operations, ...result } = proposal
  return structuredClone(result)
}

function plainText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
  return text ? text.slice(0, 160) : undefined
}

function proposalChange(operation: PreparedAgentOperation): AgentProposalChange {
  const patch = operation.patch && typeof operation.patch === 'object' ? operation.patch as Record<string, unknown> : undefined
  const props = operation.props && typeof operation.props === 'object' ? operation.props as Record<string, unknown> : undefined
  const properties = patch ? Object.keys(patch) : props ? Object.keys(props) : []
  const destructive = operation.type.startsWith('delete_')
  return {
    type: operation.type,
    slideId: typeof operation.slideId === 'string' ? operation.slideId : undefined,
    elementId: typeof operation.elementId === 'string' ? operation.elementId : undefined,
    properties,
    value: plainText(props?.html ?? patch?.html ?? operation.name),
    destructive,
  }
}

/** Page-lifetime proposal registry. Proposals never enter the portable document model. */
export class AgentProposalRegistry {
  private proposals: StoredAgentProposal[] = []

  create(doc: BentoDoc, currentRevision: number, input: AgentProposalInput): AgentProposal {
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) throw new Error('expectedRevision must be a non-negative integer.')
    if (input.expectedRevision !== currentRevision) throw new Error(`Revision conflict: expected ${input.expectedRevision}, current ${currentRevision}. Refresh the deck and retry.`)
    const title = requiredText(input.title, 'title', 160)
    const summary = optionalText(input.summary, 'summary', 1200)
    const operations = prepareAgentOperations(input.operations)
    const draft = structuredClone(doc)
    const preview = applyAgentOperations(draft, operations)
    if (!parseDoc(JSON.stringify(draft))) throw new Error('The proposal would produce an invalid bento/slides document.')
    const proposal: StoredAgentProposal = {
      id: uid('proposal'), title, summary, status: 'pending', baseRevision: currentRevision,
      createdAt: Date.now(), operationCount: preview.operationCount,
      affectedSlideIds: preview.affectedSlideIds, operations,
      destructive: operations.some((operation) => operation.type.startsWith('delete_')),
      changes: operations.map(proposalChange),
    }
    this.proposals.push(proposal)
    if (this.proposals.length > 50) this.proposals.shift()
    return publicProposal(proposal)
  }

  list(currentRevision: number): AgentProposal[] {
    this.markStale(currentRevision)
    return this.proposals.map(publicProposal)
  }

  get(id: string, currentRevision: number): AgentProposal {
    this.markStale(currentRevision)
    return publicProposal(this.find(id))
  }

  operationsForApproval(id: string, currentRevision: number): PreparedAgentOperation[] {
    this.markStale(currentRevision)
    const proposal = this.find(id)
    if (proposal.status !== 'pending') throw new Error(`Proposal ${id} is ${proposal.status} and cannot be approved.`)
    return structuredClone(proposal.operations)
  }

  previewDocument(id: string, doc: BentoDoc, currentRevision: number): BentoDoc {
    const operations = this.operationsForApproval(id, currentRevision)
    const draft = structuredClone(doc)
    applyAgentOperations(draft, operations)
    return draft
  }

  markApplied(id: string, result: AgentOperationResult, decidedAt = Date.now()): AgentProposal {
    const proposal = this.find(id)
    if (proposal.status !== 'pending') throw new Error(`Proposal ${id} is ${proposal.status} and cannot be applied.`)
    proposal.status = 'applied'
    proposal.decidedAt = decidedAt
    proposal.affectedSlideIds = [...result.affectedSlideIds]
    return publicProposal(proposal)
  }

  reject(id: string, currentRevision: number, decidedAt = Date.now()): AgentProposal {
    this.markStale(currentRevision)
    const proposal = this.find(id)
    if (proposal.status !== 'pending') throw new Error(`Proposal ${id} is ${proposal.status} and cannot be rejected.`)
    proposal.status = 'rejected'
    proposal.decidedAt = decidedAt
    return publicProposal(proposal)
  }

  private markStale(currentRevision: number) {
    for (const proposal of this.proposals) if (proposal.status === 'pending' && proposal.baseRevision !== currentRevision) proposal.status = 'stale'
  }

  private find(id: string): StoredAgentProposal {
    const proposal = this.proposals.find((item) => item.id === id)
    if (!proposal) throw new Error(`Proposal not found: ${id}.`)
    return proposal
  }
}
