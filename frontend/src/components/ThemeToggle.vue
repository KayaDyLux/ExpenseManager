<script setup>
import { ref, onMounted } from 'vue'

const isDark = ref(true)

function apply(v) {
  const el = document.documentElement
  el.classList.toggle('dark', v)
  el.classList.toggle('light', !v)   // enable light variables
  localStorage.setItem('theme', v ? 'dark' : 'light')
}

onMounted(() => {
  const saved = localStorage.getItem('theme')
  isDark.value = saved ? saved === 'dark' : true   // default = dark
  apply(isDark.value)
})

function toggleTheme() {
  isDark.value = !isDark.value
  apply(isDark.value)
}
</script>

<template>
  <button
    class="tg"
    :data-dark="isDark"
    role="switch"
    :aria-checked="isDark ? 'true' : 'false'"
    aria-label="Toggle theme"
    @click="toggleTheme"
  >
    <span class="knob">
      <!-- sun -->
      <svg v-if="!isDark" class="ico" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 4a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V5a1 1 0 0 1 1-1Zm0 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm7-6h1a1 1 0 1 1 0 2h-1a1 1 0 1 1 0-2ZM4 11H3a1 1 0 1 0 0 2h1a1 1 0 1 0 0-2Z"/>
      </svg>
      <!-- moon -->
      <svg v-else class="ico" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/>
      </svg>
    </span>
  </button>
</template>

<style scoped>
.tg{position:fixed;top:14px;right:16px;z-index:1000;width:68px;height:36px;border-radius:999px;border:1px solid #232A34;background:linear-gradient(135deg,#1b1f24,#0f141a);box-shadow:0 6px 24px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.06);transition:background .25s,border-color .25s;cursor:pointer}
.tg[data-dark="false"]{background:linear-gradient(135deg,#f7f9fb,#fff);border-color:#E6EAEE;box-shadow:0 8px 24px rgba(16,24,40,.12),inset 0 1px 0 rgba(255,255,255,.9)}
.knob{position:absolute;top:4px;left:4px;width:28px;height:28px;border-radius:50%;background:#0c1117;transform:translateX(0);transition:transform .2s cubic-bezier(.2,.8,.2,1),background .25s;display:grid;place-items:center;box-shadow:0 2px 8px rgba(0,0,0,.4),inset 0 0 0 1px rgba(255,255,255,.06)}
.tg[data-dark="false"] .knob{background:#fff;box-shadow:0 2px 8px rgba(16,24,40,.12),inset 0 0 0 1px rgba(0,0,0,.06);transform:translateX(32px)}
.ico{width:16px;height:16px;fill:#E7E9EE}
.tg[data-dark="false"] .ico{fill:#0C1117}
.tg:focus-visible{outline:2px solid #22D3EE;outline-offset:3px;border-radius:999px}

@media (max-width: 640px) {
  .tg { top: 10px; right: 10px; transform: scale(.9); }
}
</style>

