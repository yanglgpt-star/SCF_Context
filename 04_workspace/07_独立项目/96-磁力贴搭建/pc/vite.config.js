import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fsApi } from './server/fs-api.js'
import { aiApi } from './server/ai-api.js'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  // 第三个参数是前缀白名单，空串表示「全都要」—— 这里确实全都要：
  // ARK_API_KEY 不带 VITE_ 前缀，正是为了它不会被 Vite 注入到浏览器 bundle 里。
  const env = loadEnv(mode, dirname, '')

  return {
    plugins: [react(), fsApi(), aiApi(env)],
    resolve: {
      alias: { '@': path.resolve(dirname, './src') },
    },
    server: {
      port: 5273,
      // 不自动开浏览器：这个工程会被反复重启，抢焦点比省一次点击更烦
      open: false,
    },
  }
})
