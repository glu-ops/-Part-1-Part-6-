/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 唯一彩色元素：避難所狀態
        status: {
          safe: '#22c55e',
          caution: '#f4b740',
          danger: '#ef4444',
        },
      },
      fontFamily: {
        sans: ['Noto Sans TC', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
