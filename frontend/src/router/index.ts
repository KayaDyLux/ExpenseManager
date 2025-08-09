import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/', component: () => import('../views/HomeView.vue') },
  { path: '/callback', component: () => import('../views/Callback.vue') },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router

