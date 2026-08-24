const translations = {
  en: {
    demoNotice: 'Fictional-data demo · No file leaves your browser and no server API is called.', viewSource: 'View source', assistant: 'Assistant', favorites: 'Favorites', transfers: 'Transfers', settings: 'Settings', search: 'Search', privateSpace: 'PRIVATE SPACE', assistantTitle: 'Transfer Assistant', github: 'GitHub', pinned: 'Pinned', pinnedHint: 'Deployment notes and frequently used content', open: 'Open', today: 'Today', messageDeploy: 'Production checklist: domain, HTTPS certificate, reverse proxy, and an off-server backup.', deviceLaptop: 'Studio laptop', devicePhone: 'Travel phone', boardingPass: 'boarding-pass.png', ocrPreview: 'Recognized: Flight ZJ 2026 · Gate 18 · 14:30', composerPlaceholder: 'Type or paste something…', organized: 'ORGANIZED', favoriteTitle: 'Saved for later', favoriteRepo: 'Source, releases, and installation instructions', favoritePdf: 'Shared from Studio laptop · today', backupTitle: 'Backup checklist', backupText: 'Database + files + production configuration', outbound: 'OUTBOUND', transferTitle: 'Share and receive', newTransfer: '+ New', temporaryShares: 'Temporary shares', externalDrops: 'External drops', shareMeta: 'Expires in 23 hours · 1 / 5 downloads', shareHint: 'The link can be displayed again or opened as a QR code.', dropName: 'Send files to me', dropMeta: '0 / 10 uploads · 500 MB per file', dropHint: 'Accepts files or plain text from any browser.', ocrSearch: 'OCR image search', ocrHint: 'Images are indexed asynchronously after upload.', completed: 'Completed', queued: 'Queued', processing: 'Processing', failed: 'Failed', storage: 'STORAGE', retention: 'Files, images, and trash are kept forever by default.', trustedDevices: 'TRUSTED DEVICES', trustedHint: 'Studio laptop · Travel phone · Home tablet', manage: 'Manage', appearance: 'APPEARANCE', siteIdentity: 'Site identity', siteTitle: 'Site title', tabTitle: 'Browser title', searchPlaceholder: 'Search messages and file names…', cancel: 'Cancel', searchSpecified: 'Search specific content', imagesVideos: 'Images & videos', files: 'Files', links: 'Links', sourceDevice: 'Source device', demoAction: 'Demo only — no server request was sent.', noResults: 'No fictional result matched your search.', sentLocally: 'Added to this browser-only demo.', titles: { assistant: 'Transfer Assistant', favorites: 'Favorites', transfers: 'Transfer Management', settings: 'Settings' }
  },
  zh: {
    demoNotice: '虚构数据演示 · 文件不会离开浏览器，也不会请求真实服务器接口。', viewSource: '查看源码', assistant: '助手', favorites: '收藏', transfers: '传输', settings: '设置', search: '搜索', privateSpace: '私人空间', assistantTitle: '传输助手', github: 'GitHub', pinned: '置顶', pinnedHint: '部署说明和常用内容', open: '展开', today: '今天', messageDeploy: '上线检查：域名、HTTPS 证书、反向代理和异地备份。', deviceLaptop: '书房电脑', devicePhone: '随身手机', boardingPass: '登机牌.png', ocrPreview: '识别结果：ZJ 2026 航班 · 18 号登机口 · 14:30', composerPlaceholder: '输入或粘贴内容…', organized: '内容整理', favoriteTitle: '稍后使用', favoriteRepo: '源码、版本发布和安装说明', favoritePdf: '来自书房电脑 · 今天', backupTitle: '备份清单', backupText: '数据库 + 原始文件 + 生产配置', outbound: '对外传递', transferTitle: '分享与接收', newTransfer: '+ 新建', temporaryShares: '临时分享', externalDrops: '外部投递', shareMeta: '23 小时后到期 · 已下载 1 / 5 次', shareHint: '可再次显示链接或打开二维码。', dropName: '给我投递文件', dropMeta: '已投递 0 / 10 次 · 单文件 500 MB', dropHint: '可从任意浏览器投递文件或纯文本。', ocrSearch: 'OCR 图片搜索', ocrHint: '图片上传后异步建立搜索索引。', completed: '已完成', queued: '排队中', processing: '识别中', failed: '失败', storage: '存储空间', retention: '图片、文件和回收站默认永久保留。', trustedDevices: '长期设备', trustedHint: '书房电脑 · 随身手机 · 家庭平板', manage: '管理', appearance: '外观', siteIdentity: '站点信息', siteTitle: '站点标题', tabTitle: '标签页标题', searchPlaceholder: '搜索消息、文件名…', cancel: '取消', searchSpecified: '搜索指定内容', imagesVideos: '图片与视频', files: '文件', links: '链接', sourceDevice: '来源设备', demoAction: '当前为演示站，没有向服务器发送请求。', noResults: '没有匹配的虚构演示内容。', sentLocally: '已添加到当前浏览器的演示界面。', titles: { assistant: '传输助手', favorites: '收藏', transfers: '传输管理', settings: '设置' }
  }
}

let language = 'en'
let currentView = 'assistant'
const toast = document.querySelector('#toast')

function t(key) { return translations[language][key] ?? translations.en[key] ?? key }

function applyLanguage(nextLanguage) {
  language = nextLanguage
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'
  document.title = language === 'zh' ? '渡口 · 在线演示' : 'Dukou · Live Demo'
  document.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = t(node.dataset.i18n) })
  document.querySelectorAll('[data-i18n-placeholder]').forEach(node => { node.placeholder = t(node.dataset.i18nPlaceholder) })
  document.querySelectorAll('[data-language-toggle]').forEach(node => { node.textContent = language === 'en' ? '中文' : 'English' })
  document.querySelector('#viewTitle').textContent = translations[language].titles[currentView]
}

function showToast(message) {
  toast.textContent = message
  toast.classList.add('show')
  clearTimeout(showToast.timer)
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2200)
}

function activateView(view) {
  currentView = view
  document.querySelectorAll('[data-view-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.viewPanel === view))
  document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === view))
  document.querySelector('#viewTitle').textContent = translations[language].titles[view]
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => activateView(button.dataset.view)))
document.querySelectorAll('[data-language-toggle]').forEach(button => button.addEventListener('click', () => applyLanguage(language === 'en' ? 'zh' : 'en')))
document.querySelectorAll('[data-demo-action]').forEach(button => button.addEventListener('click', () => showToast(t('demoAction'))))

const searchOverlay = document.querySelector('#searchOverlay')
const searchInput = document.querySelector('#searchInput')
const searchResults = document.querySelector('#searchResults')

function openSearch() {
  searchOverlay.hidden = false
  setTimeout(() => searchInput.focus(), 0)
}

function closeSearch() {
  searchOverlay.hidden = true
  searchInput.value = ''
  searchResults.replaceChildren()
}

function runSearch(value) {
  const query = value.trim().toLowerCase()
  searchResults.replaceChildren()
  if (!query) return
  const matches = [...document.querySelectorAll('[data-search]')].filter(node => `${node.dataset.search} ${node.textContent}`.toLowerCase().includes(query))
  if (!matches.length) {
    const empty = document.createElement('div')
    empty.className = 'search-result'
    empty.textContent = t('noResults')
    searchResults.append(empty)
    return
  }
  matches.forEach(node => {
    const result = document.createElement('button')
    result.className = 'search-result'
    result.textContent = node.querySelector('strong, p, a')?.textContent?.trim() || node.textContent.trim()
    result.addEventListener('click', () => { closeSearch(); activateView('assistant'); node.scrollIntoView({ behavior: 'smooth', block: 'center' }) })
    searchResults.append(result)
  })
}

document.querySelector('#searchButton').addEventListener('click', openSearch)
document.querySelector('#mobileSearchButton').addEventListener('click', openSearch)
document.querySelector('#closeSearch').addEventListener('click', closeSearch)
searchOverlay.addEventListener('click', event => { if (event.target === searchOverlay) closeSearch() })
searchInput.addEventListener('input', event => runSearch(event.target.value))
document.querySelectorAll('[data-search-term]').forEach(button => button.addEventListener('click', () => { searchInput.value = button.dataset.searchTerm; runSearch(button.dataset.searchTerm) }))
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !searchOverlay.hidden) closeSearch() })

document.querySelector('#demoComposer').addEventListener('submit', event => {
  event.preventDefault()
  const input = document.querySelector('#composerInput')
  const value = input.value.trim()
  if (!value) return
  const article = document.createElement('article')
  article.className = 'message text-message'
  article.dataset.search = value
  const text = document.createElement('p')
  text.textContent = value
  const meta = document.createElement('div')
  meta.className = 'message-meta'
  meta.innerHTML = `<span>${language === 'zh' ? '当前浏览器' : 'This browser'}</span><span>${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>`
  article.append(text, meta)
  document.querySelector('#timeline').append(article)
  input.value = ''
  showToast(t('sentLocally'))
  article.scrollIntoView({ behavior: 'smooth', block: 'center' })
})

applyLanguage('en')
