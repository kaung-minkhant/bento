# Direct-file authoring

Use this path only when working on a standalone `.bento.html` file without a
paired MCP editor.

The document model is plaintext JSON in the `#bento-doc` script block. Edit
that block only and leave the shipped runtime untouched. Escape every `<` in
serialized JSON as `\u003c` before splicing it back into the HTML.

## Existing file

1. Confirm the document format is `bento/slides` and read the current size,
   theme, slides, assets, and stable IDs.
2. Preserve `docId`, document format, and unknown fields.
3. Modify the smallest necessary part of the document model.
4. Splice the serialized JSON back into the same plaintext block. Never
   regenerate the surrounding HTML.
5. Open the result in a browser and inspect the changed slides when possible.

## Starting from nothing

Download the current signed bento/slides release from:

`https://bento.page/releases/slides/Bento_Slides.bento.html`

Verify that it contains the `#bento-doc` block, then replace only the showcase
document JSON. Fetch `https://bento.page/agents.md` for the current standalone
schema and minimal document skeleton. Omit `docId` and `collab` in a genuinely
new deck so the app can mint fresh identity and collaboration credentials on
first open.

## Safety

- Never place a literal closing script sequence inside the document block.
- Never regenerate an existing `docId`.
- Keep embedded assets reasonably sized and disclose external dependencies.
- Fully specify required document and element fields from the current guide.
- Preserve self-containment and offline behavior unless the user explicitly
  accepts linked assets.
