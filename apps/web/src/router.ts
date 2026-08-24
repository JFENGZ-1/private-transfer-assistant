import { createRouter, createWebHistory } from 'vue-router'
import { hydrateAuth, isAuthenticated, isTrusted, state } from './state'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('./views/LoginView.vue'), meta: { public: true } },
    { path: '/s/:token', name: 'public-share', component: () => import('./views/PublicShareView.vue'), meta: { public: true } },
    { path: '/drop/:token', name: 'public-drop', component: () => import('./views/PublicDropView.vue'), meta: { public: true } },
    { path: '/share-target', name: 'share-target', component: () => import('./views/ShareTargetView.vue') },
    {
      path: '/app', component: () => import('./views/AppShell.vue'), children: [
        { path: '', name: 'inbox', component: () => import('./views/InboxView.vue') },
        { path: 'favorites', name: 'favorites', component: () => import('./views/FavoritesView.vue') },
        { path: 'transfers', name: 'transfers', component: () => import('./views/TransfersView.vue') },
        { path: 'trash', name: 'trash', component: () => import('./views/TrashView.vue'), meta: { trusted: true } },
        { path: 'profile', name: 'profile', component: () => import('./views/ProfileView.vue') },
        { path: 'settings', name: 'settings', component: () => import('./views/SettingsView.vue'), meta: { trusted: true } },
      ]
    },
    { path: '/:pathMatch(.*)*', redirect: '/app' }
  ],
  scrollBehavior: () => ({ top: 0 })
})

router.beforeEach(async to => {
  if (!state.ready) await hydrateAuth()
  if (to.meta.public) return true
  if (!isAuthenticated.value) return { name: 'login', query: { next: to.fullPath } }
  if (to.meta.trusted && !isTrusted.value) return { name: 'profile', query: { upgrade: '1' } }
  if (to.name === 'login' && isAuthenticated.value) return { name: 'inbox' }
  return true
})

export default router
