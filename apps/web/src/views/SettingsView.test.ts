// @vitest-environment jsdom
import { flushPromises, shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  settings: vi.fn(),
  devices: vi.fn(),
  ocrJobs: vi.fn(),
}))

vi.mock('vue-router', () => ({ useRouter: () => ({ replace: vi.fn() }) }))
vi.mock('../api', () => ({
  api: {
    settings: mocks.settings,
    devices: mocks.devices,
    ocrJobs: mocks.ocrJobs,
    exportBackup: () => '/api/settings/export',
  },
  errorText: (error: unknown) => String(error),
}))

import SettingsView from './SettingsView.vue'

describe('SettingsView OCR results', () => {
  beforeEach(() => {
    mocks.settings.mockResolvedValue({
      ocrEnabled: true,
      ocr: { completed: 1, pending: 0, processing: 0, failed: 0 },
      retention: { imagesDays: -1, filesDays: -1, trashDays: -1, downloadedEarlier: false },
      storage: { used: 0 },
      defaultShare: { expiresIn: 3600, maxDownloads: 1 },
    })
    mocks.devices.mockResolvedValue({ items: [] })
    mocks.ocrJobs.mockResolvedValue({
      total: 1,
      nextOffset: null,
      items: [{
        id: 'image-1', type: 'file', fileName: '识别图片.jpg', mime: 'image/jpeg', size: 100,
        sourceDeviceName: '手机', visibility: 'normal', favorite: 0, pinned: 0,
        createdAt: Date.now(), updatedAt: Date.now(), jobUpdatedAt: Date.now(),
        ocrStatus: 'done', jobStatus: 'done', attempts: 1, ocrText: '服务器部署验证内容',
      }],
    })
  })

  it('keeps recognized text collapsed until its image card is clicked', async () => {
    const wrapper = shallowMount(SettingsView, {
      global: { stubs: {
        BaseDialog: { props: ['open'], template: '<div v-if="open"><slot /></div>' },
        MessageCard: { props: ['message'], template: '<div class="message-card-stub">{{message.fileName}}</div>' },
      } },
    })
    await flushPromises()
    await wrapper.get('[aria-label="查看已完成的图片"]').trigger('click')
    await flushPromises()

    const card = wrapper.get('.ocr-job-card')
    expect(card.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('.ocr-result').exists()).toBe(false)

    await card.trigger('click')
    expect(card.attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('.ocr-result').text()).toContain('服务器部署验证内容')

    await card.trigger('click')
    expect(wrapper.find('.ocr-result').exists()).toBe(false)
  })
})
