import { createRouter, createWebHashHistory } from 'vue-router'
import CameraView from './views/CameraView.vue'

export const router = createRouter({
  // Hash URLs work on static hosts like GitHub Pages without a 404 fallback.
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'camera', component: CameraView },
    { path: '/edit', name: 'edit', component: () => import('./views/EditorView.vue') },
    { path: '/gallery', name: 'gallery', component: () => import('./views/GalleryView.vue') },
    {
      path: '/gallery/:id',
      name: 'photo',
      component: () => import('./views/PhotoView.vue'),
      props: true,
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
