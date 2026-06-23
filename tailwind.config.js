/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 唯一彩色元素：避難所狀態
        status: {
          safe: '#889D73',
          caution: '#F5C776',
          danger: '#B30303',
          darkRed: '#2D0E0E',
        },
      },
      fontFamily: {
        sans: ['Noto Sans TC', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
