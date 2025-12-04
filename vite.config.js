import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // IMPORTANTE: Cambia 'nombre-del-repo' por el nombre EXACTO de tu repositorio en GitHub.
  // Ejemplo: si tu repo es https://github.com/juan/solar-app, pon base: '/solar-app/'
  base: '/solar-app/', 
})