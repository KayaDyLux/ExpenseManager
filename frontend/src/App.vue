/* This headline is for tracking and testing  */

<script setup>
import ThemeToggle from './components/ThemeToggle.vue'
</script>

<template>
  <div id="app-root">
    <router-view />
    <ThemeToggle />
  </div>
</template>

<style>
/* GLOBAL THEME TOKENS (dark default) */
:root {
  --bg:#0B0D10;
  --surface:#12151A;
  --muted:#171B22;
  --text:#E7E9EE;
  --sub:#A8B0BD;
  --border:#232A34;
  --accent:#6EE7B7;
}
.light {
  --bg:#FAFBFC;
  --surface:#FFFFFF;
  --muted:#F3F5F7;
  --text:#0C1117;
  --sub:#5B6776;
  --border:#E6EAEE;
}

/* baseline so whole page swaps colors */
html, body, #app, #app-root { min-height:100%; margin:0; background:var(--bg); color:var(--text); }
</style>

