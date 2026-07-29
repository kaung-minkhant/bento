import assert from 'node:assert/strict'
import { COMPOSITION_RECIPES, getCompositionRecipe, instantiateCompositionRecipe } from '../slides/src/composition-recipes.ts'
import { newDoc } from '../slides/src/model.ts'

const expected = [
  'title-thesis', 'comparison', 'academic-results', 'section-divider',
  'agenda-roadmap', 'quote-insight', 'process-timeline',
  'data-chart-takeaway', 'image-narrative', 'closing-decision',
]
assert.deepEqual(COMPOSITION_RECIPES.map((recipe) => recipe.id), expected)
assert.equal(new Set(expected).size, expected.length, 'recipe ids are unique')

const doc = newDoc()
for (const recipe of COMPOSITION_RECIPES) {
  const slide = instantiateCompositionRecipe(doc, recipe.id, recipe.sample, `test-${recipe.id}`)
  assert.equal(slide.id, `test-${recipe.id}`)
  assert.ok(slide.elements.length >= 3, `${recipe.id} creates a useful composition`)
  assert.equal(slide.elements.filter((element) => element.role === 'title').length, 1, `${recipe.id} creates exactly one semantic title`)
  assert.ok(slide.elements.every((element) =>
    Number.isFinite(element.x) && Number.isFinite(element.y) && element.w > 0 && element.h > 0 &&
    element.x >= 0 && element.y >= 0 && element.x + element.w <= doc.size.width + 0.01 && element.y + element.h <= doc.size.height + 0.01
  ), `${recipe.id} keeps sample elements on canvas`)

  const missing = Object.fromEntries(Object.entries(recipe.sample))
  const required = recipe.fields.find((field) => field.required)
  assert.ok(required, `${recipe.id} has at least one required field`)
  missing[required!.key] = ''
  assert.throws(() => instantiateCompositionRecipe(doc, recipe.id, missing), new RegExp(`${required!.key} is required`))
}

assert.ok(instantiateCompositionRecipe(doc, 'data-chart-takeaway', getCompositionRecipe('data-chart-takeaway').sample)
  .elements.some((element) => element.type === 'chart'), 'data recipe creates an editable chart')
assert.ok(instantiateCompositionRecipe(doc, 'image-narrative', getCompositionRecipe('image-narrative').sample)
  .elements.some((element) => element.type === 'image'), 'image recipe creates an editable image')
assert.throws(() => getCompositionRecipe('missing'), /Unknown composition recipe/)

console.log('composition recipes: all assertions passed')
