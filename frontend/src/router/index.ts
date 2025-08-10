import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    requiresAuth?: boolean
    requiresAnon?: boolean
    workspaceAware?: boolean
    requiredAccountType?: 'personal' | 'business' | 'both'
  }
}

type AccountType = 'personal' | 'business' | 'both'

const STORAGE_KEYS = {
  jwt: 'jwt',
  workspaceId: 'workspaceId',
} as const

function base64UrlToJson<T = any>(input: string): T | null {
  try {
    const pad = '='.repeat((4 - (input.length % 4)) % 4)
    const b64 = (input + pad).replace(/-/g, '+').replace(/_/g, '/')
    const str = atob(b64)
    const bytes = new Uint8Array([...str].map(c => c.charCodeAt(0)))
    const json = new TextDecoder().decode(bytes)
    return JSON.parse(json) as T
  } catch {
    return null
  }
}

function parseJwt<T = any>(token: string | null): T | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  return base64UrlToJson<T>(parts[1])
}

function getToken(): string | null {
  return localStorage.getItem(STORAGE_KEYS.jwt)
}
function clearToken() { localStorage.removeItem(STORAGE_KEYS.jwt) }

function isAuthenticated(): boolean {
  const token = getToken()
  const payload = parseJwt<{ exp?: number }>(token)
  if (!payload?.exp) return false
  const nowMs = Date.now() + 60_000 // 60s skew
  return nowMs < payload.exp * 1000
}
function getAccountType(): AccountType | null {
  const payload = parseJwt<{ accountType?: AccountType }>(getToken())
  return payload?.accountType ?? null
}

function getPersistedWorkspaceId(): string | null {
  return localStorage.getItem(STORAGE_KEYS.workspaceId)
}
function setPersistedWorkspaceId(id?: string | null) {
  if (id) localStorage.setItem(STORAGE_KEYS.workspaceId, id)
}

function ensureWorkspaceQuery(to: any) {
  const q = new URLSearchParams(to.query as Record<string, string>)
  const incoming = q.get('workspaceId')
  if (incoming) {
    setPersistedWorkspaceId(incoming)
    return true
  }
  const persisted = getPersistedWorkspaceId()
  if (persisted) {
    return {
      name: to.name as string,
      params: to.params,
      query: { ...to.query, workspaceId: persisted },
      hash: to.hash,
      replace: true,
    }
  }
  return { name: 'workspace-picker', query: { redirect: to.fullPath } }
}

function accountTypeAllowed(required: AccountType | undefined, userType: AccountType | null): boolean {
  if (!required) return true
  if (!userType) return false
  if (required === 'both') return userType === 'both'
  if (required === 'business') return userType === 'business' || userType === 'both'
  if (required === 'personal') return userType === 'personal' || userType === 'both'
  return false
}

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'root', redirect: () => (isAuthenticated() ? { name: 'dashboard' } : { name: 'login' }) },

  // --- Auth
  { path: '/login', name: 'login', meta: { requiresAnon: true, title: 'Sign in · ExpenseManager' }, component: () => import('@/views/auth/LoginView.vue') },
  { path: '/onboarding', name: 'onboarding', meta: { requiresAuth: true, title: 'Onboarding · ExpenseManager' }, component: () => import('@/views/onboarding/OnboardingView.vue') },

  // --- App shell
  {
    path: '/app',
    component: () => import('@/layouts/AppShell.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: 'workspaces', name: 'workspace-picker', meta: { title: 'Choose Workspace · ExpenseManager' }, component: () => import('@/views/workspaces/WorkspacePickerView.vue') },
      { path: '', redirect: { name: 'dashboard' } },

      // Dashboards (workspace-aware)
      { path: 'dashboard', name: 'dashboard', meta: { title: 'Dashboard · ExpenseManager', workspaceAware: true }, component: () => import('@/views/dashboard/DashboardView.vue') },

      // Categories
      { path: 'categories', name: 'categories', meta: { title: 'Categories · ExpenseManager', workspaceAware: true }, component: () => import('@/views/categories/CategoriesAdmin.vue') },

      // Budgets
      { path: 'budgets', name: 'budgets', meta: { title: 'Budgets · ExpenseManager', workspaceAware: true }, component: () => import('@/views/budgets/BudgetsListView.vue') },
      { path: 'budgets/:id', name: 'budget-detail', props: true, meta: { title: 'Budget · ExpenseManager', workspaceAware: true }, component: () => import('@/views/budgets/BudgetDetailView.vue') },

      // Expenses
      { path: 'expenses', name: 'expenses', meta: { title: 'Expenses · ExpenseManager', workspaceAware: true }, component: () => import('@/views/expenses/ExpensesListView.vue') },

      // Income (sources, entries, summary) — workspace-aware
      { path: 'income', name: 'income', meta: { title: 'Income · ExpenseManager', workspaceAware: true }, component: () => import('@/views/income/IncomeOverviewView.vue') },
      { path: 'income/sources', name: 'income-sources', meta: { title: 'Income Sources · ExpenseManager', workspaceAware: true }, component: () => import('@/views/income/IncomeSourcesView.vue') },
      { path: 'income/entries', name: 'income-entries', meta: { title: 'Income Entries · ExpenseManager', workspaceAware: true }, component: () => import('@/views/income/IncomeEntriesView.vue') },

      // Business-only
      { path: 'vendors', name: 'vendors', meta: { title: 'Vendors · ExpenseManager', workspaceAware: true, requiredAccountType: 'business' }, component: () => import('@/views/vendors/VendorsView.vue') },
      { path: 'projects', name: 'projects', meta: { title: 'Projects · ExpenseManager', workspaceAware: true, requiredAccountType: 'business' }, component: () => import('@/views/projects/ProjectsView.vue') },

      // Settings
      { path: 'settings', name: 'settings', meta: { title: 'Settings · ExpenseManager' }, component: () => import('@/views/settings/SettingsView.vue') },
    ],
  },

  { path: '/forbidden', name: 'forbidden', meta: { title: 'Forbidden · ExpenseManager' }, component: () => import('@/views/ForbiddenView.vue') },
  { path: '/:pathMatch(.*)*', name: 'not-found', meta: { title: 'Not Found · ExpenseManager' }, component: () => import('@/views/NotFoundView.vue') },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
  linkActiveClass: 'is-active',
  linkExactActiveClass: 'is-exact-active',
})

router.beforeEach((to) => {
  if (getToken() && !isAuthenticated()) clearToken()

  const authed = isAuthenticated()

  if (to.meta?.requiresAnon && authed) return { name: 'dashboard' }
  if (to.meta?.requiresAuth && !authed) return { name: 'login', query: { redirect: to.fullPath } }

  if (authed && to.name !== 'onboarding') {
    const at = getAccountType()
    if (!at) return { name: 'onboarding', query: { redirect: to.fullPath } }
  }

  if (to.meta?.requiredAccountType) {
    const ok = accountTypeAllowed(to.meta.requiredAccountType, getAccountType())
    if (!ok) return { name: 'forbidden', query: { from: to.fullPath } }
  }

  if (to.meta?.workspaceAware) return ensureWorkspaceQuery(to)

  return true
})

router.afterEach((to) => {
  document.title = (to.meta?.title as string) || 'ExpenseManager'
})

export default router
