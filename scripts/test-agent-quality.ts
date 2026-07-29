import assert from 'node:assert/strict'
import { inspectDeckQuality } from '../slides/src/agent-quality.ts'
import { defaultText, emptySlide, newDoc, type Slide } from '../slides/src/model.ts'

const title = (id: string, html: string, partial = {}) => defaultText({
  id, html, role: 'title', x: 80, y: 60, w: 800, h: 80, fontSize: 40, fontWeight: 700, ...partial,
})
const body = (id: string, html: string, partial = {}) => defaultText({
  id, html, role: 'body', x: 80, y: 190, w: 800, h: 240, fontSize: 24, ...partial,
})
const slide = (id: string, elements: Slide['elements']) => emptySlide({ id, elements })
const reportFor = (slides: Slide[]) => {
  const doc = newDoc()
  doc.slides = slides
  return inspectDeckQuality(doc)
}
const codes = (slides: Slide[]) => reportFor(slides).findings.map((finding) => finding.code)

const healthy = reportFor(Array.from({ length: 5 }, (_, index) => slide(`healthy-${index}`, [
  title(`healthy-title-${index}`, `Claim ${index + 1}`),
  body(`healthy-body-${index}`, 'A concise supporting sentence advances the argument with enough useful context.'),
])))
assert.equal(healthy.narrative.titleCoveragePercent, 100)
assert.equal(healthy.narrative.semanticRoleCoveragePercent, 100)
assert.equal(healthy.narrative.slides[0].title, 'Claim 1')
assert.deepEqual(healthy.narrative.slides[0].roles, ['body', 'title'])
assert.deepEqual(healthy.narrative.slides[0].signals, ['opening'])
assert.deepEqual(healthy.narrative.slides.at(-1)?.signals, ['landing'])

assert.ok(codes([slide('duplicate', [
  title('duplicate-a', 'Primary'), title('duplicate-b', 'Secondary', { y: 145, fontSize: 32 }),
])]).includes('multiple_title_roles'))

assert.ok(codes([slide('mismatch', [
  title('mismatch-title', 'Quiet title', { fontSize: 28 }),
  body('mismatch-body', 'Dominant statement', { fontSize: 56 }),
])]).includes('title_role_mismatch'))

const partial = [
  slide('tagged-1', [title('tagged-title-1', 'One'), body('tagged-body-1', 'Supporting copy for this assertion.')]),
  slide('tagged-2', [title('tagged-title-2', 'Two'), body('tagged-body-2', 'Supporting copy for this assertion.')]),
  slide('missing-role', [title('visual-title', 'Three', { role: undefined }), body('visual-body', 'Supporting copy for this assertion.', { role: undefined })]),
]
assert.ok(codes(partial).includes('partial_title_role_coverage'))

const legacy = Array.from({ length: 4 }, (_, index) => slide(`legacy-${index}`, [
  title(`legacy-title-${index}`, `Legacy ${index}`, { role: undefined }),
  body(`legacy-body-${index}`, 'A legacy deck with no semantic role metadata at all.', { role: undefined }),
]))
assert.ok(!codes(legacy).includes('partial_title_role_coverage'), 'legacy decks are not penalized for absent role metadata')

assert.ok(codes(Array.from({ length: 5 }, (_, index) => slide(`drift-${index}`, [
  title(`drift-title-${index}`, `Claim ${index}`, { fontFamily: `Family ${index}`, fontSize: 34 + index * 4 }),
]))).includes('semantic_role_style_drift'))

const untitled = Array.from({ length: 3 }, (_, index) => slide(`untitled-${index}`, [
  body(`untitled-body-${index}`, 'These content words deliberately form a substantial slide without any visually identifiable assertion.', { role: undefined, y: 250, fontSize: 20 }),
]))
assert.ok(codes(untitled).includes('untitled_narrative_run'))

assert.ok(codes(Array.from({ length: 3 }, (_, index) => slide(`repeat-${index}`, [
  title(`repeat-title-${index}`, 'Market overview'), body(`repeat-body-${index}`, 'Supporting information changes on every slide.'),
]))).includes('repeated_narrative_titles'))

const longCopy = Array.from({ length: 110 }, (_, index) => `word${index}`).join(' ')
assert.ok(codes([
  slide('sparse', [title('sparse-title', 'A concise point')]),
  slide('dense', [title('dense-title', 'Detailed evidence'), body('dense-body', longCopy)]),
]).includes('abrupt_density_shift'))

const framing = Array.from({ length: 4 }, (_, index) => slide(`framing-${index}`, index === 0 || index === 3
  ? [
      body(`framing-a-${index}`, 'This substantial content needs a clear framing assertion for the audience to follow.', { role: undefined, y: 220, fontSize: 20 }),
      body(`framing-b-${index}`, 'A second block makes the slide meaningfully composed.', { role: undefined, y: 370, fontSize: 20 }),
      body(`framing-c-${index}`, 'A third block completes the test composition.', { role: undefined, y: 500, fontSize: 20 }),
    ]
  : [title(`framing-title-${index}`, `Middle ${index}`), body(`framing-body-${index}`, 'A normal middle slide.')]))
const framingCodes = codes(framing)
assert.ok(framingCodes.includes('unframed_opening'))
assert.ok(framingCodes.includes('unframed_landing'))

console.log('agent quality: all assertions passed')
