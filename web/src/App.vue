<script setup lang="ts">
import { RouterLink, RouterView, useRoute } from "vue-router";
const route = useRoute();
</script>

<template>
  <header class="top">
    <div class="wrap bar">
      <RouterLink to="/" class="brand">
        <span class="logo">✓</span>
        <span>planlock <b>console</b></span>
      </RouterLink>
      <nav>
        <RouterLink to="/" :class="{ on: route.name === 'sessions' || route.name === 'session' }">计划一致性</RouterLink>
        <RouterLink to="/cost" :class="{ on: String(route.name).startsWith('cost') }">Token 成本</RouterLink>
      </nav>
      <a class="gh" href="https://github.com/Kac291/planlock" target="_blank" rel="noopener">GitHub ↗</a>
    </div>
  </header>
  <main class="wrap main">
    <RouterView />
  </main>
</template>

<style scoped>
.top { background: var(--panel); border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 10; }
.bar { display: flex; align-items: center; gap: 28px; height: 52px; }
.brand { white-space: nowrap; display: flex; align-items: center; gap: 9px; color: var(--text); font-size: 15px; text-decoration: none !important; }
.brand b { font-weight: 600; }
.logo { width: 24px; height: 24px; border-radius: 6px; background: var(--accent); color: #fff; display: grid; place-items: center; font-size: 14px; font-weight: 700; }
nav { display: flex; gap: 4px; }
nav a { white-space: nowrap; color: var(--text-2); padding: 6px 12px; border-radius: 7px; text-decoration: none !important; }
nav a:hover { background: var(--panel-2); }
nav a.on { color: var(--text); background: var(--panel-2); font-weight: 500; }
.gh { margin-left: auto; color: var(--text-2); font-size: 13px; }
.main { padding-top: 22px; padding-bottom: 60px; }
@media (max-width: 640px) { .gh { display: none; } .bar { gap: 14px; } }
@media (max-width: 480px) { .brand > span:last-child { display: none; } nav a { padding: 6px 9px; } }
</style>
