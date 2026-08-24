import { describe, expect, it } from 'vitest'
import { defaultDropValues } from './drop-defaults'

describe('quick drop defaults', () => {
  it('uses the same safe defaults as the full create form', () => {
    expect(defaultDropValues()).toEqual({
      name: '给我投递文件',
      expiresIn: 86400,
      maxUploads: 5,
      maxFileSize: 500 * 1024 * 1024,
      allowedTypes: [],
    })
  })

  it('returns a fresh allowed-types array', () => {
    const first = defaultDropValues()
    first.allowedTypes.push('image/*')
    expect(defaultDropValues().allowedTypes).toEqual([])
  })
})
