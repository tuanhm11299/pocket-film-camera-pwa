import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { cameraLibrary } from '@/presets/library'

const doc = readFileSync(new URL('../../docs/LOOKS.md', import.meta.url), 'utf8')

describe('docs/LOOKS.md', () => {
  // When this fails, run `npm run docs:looks` to regenerate the catalog and samples.
  it('has a sample of every look', () => {
    for (const { id } of cameraLibrary.looks) {
      const image = `images/looks/${id.replace('/', '-')}.jpg`
      expect(doc, id).toContain(`\`${id}\``)
      expect(doc, id).toContain(image)
      expect(existsSync(new URL(`../../docs/${image}`, import.meta.url)), image).toBe(true)
    }
  })
})
