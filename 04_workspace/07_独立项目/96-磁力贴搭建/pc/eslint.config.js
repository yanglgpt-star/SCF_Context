import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // 本项目没装 eslint-plugin-react，JSX 里用到的标识符不算「已使用」，
      // 因此大小写开头的变量与参数一律放行（首字母大写 = 组件/类型，是刻意命名）
      'no-unused-vars': [
        'error',
        { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^[A-Z_]|^_' },
      ],
      // 这是给组件库准备的 HMR 规则。本工程是应用不是库，
      // router/index.jsx 同时导出菜单配置与组件是刻意的组织方式。
      'react-refresh/only-export-components': 'off',
    },
  },
])
