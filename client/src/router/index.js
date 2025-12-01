import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: Home
  },
  {
    path: '/setup',
    name: 'Setup',
    component: () => import('../views/Setup.vue')
  },
  {
    path: '/tournament/:id',
    name: 'Tournament',
    component: () => import('../views/Tournament.vue')
  },
  {
    path: '/tournament/:id/scorecard',
    name: 'Scorecard',
    component: () => import('../views/Scorecard.vue')
  },
  {
    path: '/tournament/:id/leaderboard',
    name: 'Leaderboard',
    component: () => import('../views/Leaderboard.vue')
  },
  {
    path: '/tournament/:id/quick',
    name: 'QuickScore',
    component: () => import('../views/QuickScore.vue')
  },
  {
    path: '/tournament/:id/results',
    name: 'Results',
    component: () => import('../views/Results.vue')
  },
  {
    path: '/multiday/setup',
    name: 'MultiDaySetup',
    component: () => import('../views/MultiDaySetup.vue')
  },
  {
    path: '/multiday/:id',
    name: 'MultiDayDashboard',
    component: () => import('../views/MultiDayDashboard.vue')
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
