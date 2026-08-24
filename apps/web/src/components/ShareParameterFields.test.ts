// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ShareParameterFields from './ShareParameterFields.vue'

describe('ShareParameterFields', () => {
  it('uses in-app choices for 30 days, permanent expiry and download limits', async () => {
    const wrapper = mount(ShareParameterFields, {
      props: { expiresIn: 3600, maxDownloads: 1 },
    })

    expect(wrapper.find('select').exists()).toBe(false)
    await wrapper.get('button:nth-of-type(5)').trigger('click')
    await wrapper.get('.expiry-options button:nth-of-type(6)').trigger('click')
    await wrapper.get('.download-options button:nth-of-type(4)').trigger('click')

    expect(wrapper.emitted('update:expiresIn')).toEqual([[2592000], [null]])
    expect(wrapper.emitted('update:maxDownloads')).toEqual([[null]])
  })

  it('can leave either value unchanged while editing', () => {
    const wrapper = mount(ShareParameterFields, {
      props: { expiresIn: undefined, maxDownloads: undefined, allowUnchanged: true, downloads: 3 },
    })

    expect(wrapper.text()).toContain('保持不变')
    expect(wrapper.text()).toContain('当前已下载 3 次')
    expect(wrapper.findAll('button.active')).toHaveLength(2)
  })
})
