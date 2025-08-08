<script setup>
import { useAuth0 } from '@auth0/auth0-vue'
const { isAuthenticated, loginWithRedirect, user } = useAuth0()

async function signIn() {
  await loginWithRedirect({
    authorizationParams: { connection: 'google-oauth2' } // SSO-only Google
  })
}
async function signUp() {
  await loginWithRedirect({
    authorizationParams: { connection: 'google-oauth2', screen_hint: 'signup' }
  })
}
</script>

<template>
  <section class="hero">
    <div class="wrap">
      <header class="brand">
        <div class="logo">Walrus</div>
      </header>

      <div class="content">
        <h1>All your spending, perfectly organized.</h1>
        <p class="sub">
          Personal, Business, or Both — one calm place for everything.
        </p>

        <div v-if="!isAuthenticated" class="cta">
          <button class="btn primary" @click="signIn">Sign in</button>
          <button class="btn ghost" @click="signUp">Create account</button>
        </div>

        <div v-else class="signed">
          <div class="hello">Welcome, {{ user?.name || user?.email }}</div>
          <a class="btn primary" href="/">Enter app</a>
        </div>

        <div class="legal">Protected by Auth0 • SSO only</div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.hero{ min-height:100vh; background:var(--bg); color:var(--text); display:grid; place-items:center; }
.wrap{ width:min(1100px,92%); margin:auto; }
.brand{ display:flex; justify-content:space-between; align-items:center; padding:28px 0 12px; }
.logo{ font-weight:800; letter-spacing:.4px; font-size:22px; }

.content{ margin:8vh 0 6vh; text-align:center; }
h1{ font-size:42px; line-height:1.1; letter-spacing:-0.5px; margin:0 0 14px; }
.sub{ font-size:18px; color:var(--sub); margin:0 auto 28px; max-width:680px; }

.cta{ display:flex; gap:12px; justify-content:center; }
.btn{ border-radius:14px; padding:14px 22px; font-weight:600; border:1px solid var(--border); transition:all .2s ease; }
.btn.primary{ background:linear-gradient(135deg,#22D3EE,#6EE7B7); color:#0b0d10; border:none; box-shadow:0 10px 30px rgba(34,211,238,.25); }
.btn.primary:hover{ transform:translateY(-1px); box-shadow:0 14px 36px rgba(34,211,238,.32); }
.btn.ghost{ background:var(--surface); color:var(--text); }
.btn.ghost:hover{ background:var(--muted); }

.signed{ display:flex; gap:14px; align-items:center; justify-content:center; }
.hello{ color:var(--sub); }
.legal{ margin-top:28px; opacity:.7; font-size:13px; color:var(--sub); }

/* --- responsive polish --- */
@media (max-width: 900px) {
  h1 { font-size: 34px; }
  .content { margin: 10vh 0 5vh; }
}

@media (max-width: 640px) {
  .wrap { width: min(560px, 92%); }
  h1 { font-size: 28px; }
  .sub { font-size: 16px; }
  .cta { flex-direction: column; gap: 10px; }
  .btn { width: 100%; }
  .brand { padding-top: 16px; }
}

@media (max-width: 380px) {
  h1 { font-size: 24px; }
}
</style>

