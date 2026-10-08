import { createRouter, createWebHistory } from "vue-router";
import CostView from "./views/CostView.vue";
import SessionView from "./views/SessionView.vue";
import SessionsView from "./views/SessionsView.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "sessions", component: SessionsView },
    { path: "/p/:pid/s/:sid", name: "session", component: SessionView, props: true },
    { path: "/cost", name: "cost", component: CostView },
    { path: "/cost/:sid", name: "cost-session", component: CostView, props: true },
  ],
});
