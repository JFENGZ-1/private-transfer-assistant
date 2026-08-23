import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './styles.css'
import { loadPwaAppearance } from './appearance'

createApp(App).use(router).mount('#app')
void loadPwaAppearance()
