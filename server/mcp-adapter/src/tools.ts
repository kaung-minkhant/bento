import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { AdapterConfig } from './config.js'
import { DocumentServiceClient } from './client.js'
import { BrowserBridge } from './bridge.js'

function result(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] }
}

function imageResult(value: unknown) {
  if (!value || typeof value !== 'object') throw new Error('The browser returned an invalid rendered slide.')
  const rendered = value as Record<string, unknown>
  if (rendered.mimeType !== 'image/png' || typeof rendered.data !== 'string' ||
      rendered.data.length > 12 * 1024 * 1024 || !/^[A-Za-z0-9+/]*={0,2}$/.test(rendered.data)) {
    throw new Error('The browser returned an invalid rendered slide.')
  }
  const { data, mimeType, ...metadata } = rendered
  return {
    content: [
      { type: 'image' as const, data, mimeType },
      { type: 'text' as const, text: JSON.stringify(metadata) },
    ],
  }
}

export function createMcpServer(config: AdapterConfig, client = new DocumentServiceClient(config), bridge?: BrowserBridge) {
  const server = new McpServer({ name: 'bento-document-service', version: '1.0.0' })
  const assertAllowed = (docId: string) => {
    if (config.allowedDocIds.size && !config.allowedDocIds.has(docId)) {
      throw new Error('This MCP adapter is not authorized for that document.')
    }
  }

  server.registerTool('list_documents', {
    description: 'List encrypted bento documents accessible to this adapter subject. Content and titles remain encrypted.',
    inputSchema: { limit: z.number().int().min(1).max(100).default(50), cursor: z.string().optional() },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ limit, cursor }) => {
    const page = await client.listDocuments(limit, cursor)
    const documents = config.allowedDocIds.size
      ? page.documents.filter((document) => typeof document === 'object' && document !== null && 'docId' in document && config.allowedDocIds.has(String(document.docId)))
      : page.documents
    return result({ ...page, documents })
  })

  server.registerTool('get_document', {
    description: 'Read encrypted metadata and access role for one explicitly selected bento document.',
    inputSchema: { docId: z.string().uuid() },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ docId }) => { assertAllowed(docId); return result(await client.getDocument(docId)) })

  server.registerTool('list_versions', {
    description: 'List immutable version metadata for one explicitly selected bento document. Snapshot content stays encrypted.',
    inputSchema: { docId: z.string().uuid() },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ docId }) => { assertAllowed(docId); return result(await client.listVersions(docId)) })

  server.registerTool('start_session', {
    description: 'Start or resume a live collaboration session for one explicitly selected document.',
    inputSchema: { docId: z.string().uuid(), relayRoom: z.string().url(), sessionId: z.string().uuid().optional() },
    annotations: { readOnlyHint: false, openWorldHint: false },
  }, async ({ docId, relayRoom, sessionId }) => { assertAllowed(docId); return result(await client.startSession(docId, relayRoom, sessionId)) })

  server.registerTool('close_session', {
    description: 'Close a live collaboration session for one explicitly selected document.',
    inputSchema: { docId: z.string().uuid(), sessionId: z.string().uuid() },
    annotations: { readOnlyHint: false, openWorldHint: false },
  }, async ({ docId, sessionId }) => { assertAllowed(docId); return result(await client.closeSession(docId, sessionId)) })

  server.registerTool('delete_document', {
    description: 'Permanently request deletion of one explicitly selected hosted document. Requires an explicit confirmation value.',
    inputSchema: { docId: z.string().uuid(), confirm: z.literal('delete') },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  }, async ({ docId }) => { assertAllowed(docId); return result(await client.deleteDocument(docId)) })

  if (bridge) {
    server.registerTool('claim_agent_pairing', {
      description: 'Claim the short-lived pairing code shown by an open bento editor. This connects the agent to exactly one document.',
      inputSchema: { code: z.string().regex(/^[A-Z0-9]{8}$/) },
      annotations: { readOnlyHint: false, openWorldHint: false },
    }, async ({ code }) => result(bridge.claimPairing(code)))

    server.registerTool('agent_read_document', {
      description: 'Read the plaintext document model from the explicitly connected browser editor. Requires an intentional browser bridge connection.',
      inputSchema: { docId: z.string().uuid() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    }, async ({ docId }) => { assertAllowed(docId); return result(await bridge.request(docId, 'read_document')) })

    server.registerTool('agent_replace_document', {
      description: 'Replace the explicitly connected browser editor document through its normal undoable mutation path.',
      inputSchema: { docId: z.string().uuid(), json: z.string().min(2).max(50_000_000) },
      annotations: { readOnlyHint: false, openWorldHint: false },
    }, async ({ docId, json }) => { assertAllowed(docId); return result(await bridge.request(docId, 'replace_document', json)) })

    server.registerTool('get_deck_summary', {
      description: 'Read a compact summary of one connected deck: title, slide IDs, and element IDs/types/text snippets without transferring the full document JSON.',
      inputSchema: { docId: z.string().uuid() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    }, async ({ docId }) => { assertAllowed(docId); return result(await bridge.request(docId, 'summary')) })

    server.registerTool('get_deck_style', {
      description: 'Read the connected deck size, theme, presentation settings, layout catalog, asset metadata, and current revision without transferring asset contents.',
      inputSchema: { docId: z.string().uuid() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    }, async ({ docId }) => { assertAllowed(docId); return result(await bridge.request(docId, 'deck_style')) })

    server.registerTool('inspect_design_system', {
      description: 'Read a statistical visual-language fingerprint of the connected deck: declared design tokens plus inferred colors, typography roles, spacing, radii, transitions, element mix, and recurring slide structures.',
      inputSchema: { docId: z.string().uuid() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    }, async ({ docId }) => { assertAllowed(docId); return result(await bridge.request(docId, 'design_language')) })

    server.registerTool('list_composition_recipes', {
      description: 'List the shared bento/slides composition recipes and their structured content fields. Recipes adapt to the connected deck design system.',
      inputSchema: { docId: z.string().uuid() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    }, async ({ docId }) => { assertAllowed(docId); return result(await bridge.request(docId, 'composition_recipes')) })

    server.registerTool('create_slide_from_recipe', {
      description: 'Create a styled, fully editable slide from a shared composition recipe. Requires the current deck revision; stale requests fail without changing the deck.',
      inputSchema: {
        docId: z.string().uuid(), expectedRevision: z.number().int().nonnegative(), recipeId: z.string().min(1),
        content: z.record(z.string()), afterSlideId: z.string().optional(),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    }, async ({ docId, expectedRevision, recipeId, content, afterSlideId }) => {
      assertAllowed(docId)
      return result(await bridge.request(docId, 'create_slide_from_recipe', undefined, { expectedRevision, recipeId, content, afterSlideId }))
    })

    server.registerTool('get_slide', {
      description: 'Read one slide and its complete element model from the explicitly connected deck, together with the current revision.',
      inputSchema: { docId: z.string().uuid(), slideId: z.string().min(1) },
      annotations: { readOnlyHint: true, openWorldHint: false },
    }, async ({ docId, slideId }) => { assertAllowed(docId); return result(await bridge.request(docId, 'slide_detail', undefined, { slideId })) })

    server.registerTool('render_slide', {
      description: 'Render one slide from the explicitly connected bento editor as a PNG preview. This is read-only and does not change document history.',
      inputSchema: { docId: z.string().uuid(), slideId: z.string().min(1), width: z.number().int().min(320).max(1600).optional() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    }, async ({ docId, slideId, width }) => { assertAllowed(docId); return imageResult(await bridge.request(docId, 'render_slide', undefined, { slideId, width })) })

    server.registerTool('validate_slide', {
      description: 'Inspect one slide in the explicitly connected bento editor for off-canvas elements, text overflow, possible overlap, and measurable contrast problems.',
      inputSchema: { docId: z.string().uuid(), slideId: z.string().min(1) },
      annotations: { readOnlyHint: true, openWorldHint: false },
    }, async ({ docId, slideId }) => { assertAllowed(docId); return result(await bridge.request(docId, 'validate_slide', undefined, { slideId })) })

    server.registerTool('render_deck_thumbnails', {
      description: 'Render a labeled contact sheet of slides from the explicitly connected bento editor. Interactive states are excluded by default.',
      inputSchema: {
        docId: z.string().uuid(), width: z.number().int().min(160).max(400).optional(),
        includeStates: z.boolean().optional(), limit: z.number().int().min(1).max(50).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    }, async ({ docId, width, includeStates, limit }) => {
      assertAllowed(docId)
      return imageResult(await bridge.request(docId, 'render_deck_thumbnails', undefined, { width, includeStates, limit }))
    })

    server.registerTool('apply_operations', {
      description: 'Atomically apply a prevalidated batch of targeted slide and element edits. Requires the current deck revision; stale batches fail without changing the deck.',
      inputSchema: {
        docId: z.string().uuid(), expectedRevision: z.number().int().nonnegative(), dryRun: z.boolean().optional(),
        operations: z.array(z.record(z.unknown())).min(1).max(100),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    }, async ({ docId, expectedRevision, dryRun, operations }) => {
      assertAllowed(docId)
      return result(await bridge.request(docId, 'apply_operations', undefined, { expectedRevision, dryRun, operations }))
    })

    server.registerTool('create_slide', {
      description: 'Create one blank slide in the connected deck. Optionally place it after a specific slide ID.',
      inputSchema: { docId: z.string().uuid(), name: z.string().max(200).optional(), afterSlideId: z.string().optional() },
      annotations: { readOnlyHint: false, openWorldHint: false },
    }, async ({ docId, name, afterSlideId }) => { assertAllowed(docId); return result(await bridge.request(docId, 'create_slide', undefined, { name, afterSlideId })) })

    server.registerTool('add_text', {
      description: 'Add one text element to a connected deck slide using normal editor mutation and undo.',
      inputSchema: { docId: z.string().uuid(), slideId: z.string().optional(), html: z.string().min(1).max(100_000), x: z.number().optional(), y: z.number().optional(), w: z.number().positive().optional(), h: z.number().positive().optional(), fontSize: z.number().positive().optional() },
      annotations: { readOnlyHint: false, openWorldHint: false },
    }, async ({ docId, slideId, html, x, y, w, h, fontSize }) => { assertAllowed(docId); return result(await bridge.request(docId, 'add_text', undefined, { slideId, html, x, y, w, h, fontSize })) })

    server.registerTool('update_element', {
      description: 'Update selected presentation properties on one connected element. Element identity and type cannot be changed.',
      inputSchema: { docId: z.string().uuid(), slideId: z.string(), elementId: z.string(), patch: z.record(z.unknown()) },
      annotations: { readOnlyHint: false, openWorldHint: false },
    }, async ({ docId, slideId, elementId, patch }) => { assertAllowed(docId); return result(await bridge.request(docId, 'update_element', undefined, { slideId, elementId, patch })) })

    server.registerTool('delete_element', {
      description: 'Delete one element from one connected deck slide through the normal undoable editor path.',
      inputSchema: { docId: z.string().uuid(), slideId: z.string(), elementId: z.string() },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    }, async ({ docId, slideId, elementId }) => { assertAllowed(docId); return result(await bridge.request(docId, 'delete_element', undefined, { slideId, elementId })) })

    server.registerTool('set_speaker_notes', {
      description: 'Replace speaker notes for one connected deck slide.',
      inputSchema: { docId: z.string().uuid(), slideId: z.string(), notes: z.string().max(100_000) },
      annotations: { readOnlyHint: false, openWorldHint: false },
    }, async ({ docId, slideId, notes }) => { assertAllowed(docId); return result(await bridge.request(docId, 'set_notes', undefined, { slideId, notes })) })
  }

  return server
}
