import { describe, expect, it } from 'vitest'
import { __pkg } from '../index'

describe('package smoke', () => {
  it('exports __pkg constant', () => {
    expect(__pkg).toMatch(/^@chirag127\//)
  })
})
