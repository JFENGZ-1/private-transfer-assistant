// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import CopyableValue from './CopyableValue.vue'

describe('CopyableValue', () => {
  it('renders the complete link as selectable wrapping text instead of a single-line input', () => {
    const link = `https://transfer.example/s/${'very-long-token-'.repeat(12)}`
    const wrapper = mount(CopyableValue, { props: { label: '分享链接', value: link } })

    expect(wrapper.find('input').exists()).toBe(false)
    expect(wrapper.get('p').text()).toBe(link)
    expect(wrapper.text()).toContain('长按或拖动选择')
    expect(wrapper.get('p').attributes('tabindex')).toBe('0')
  })
})
