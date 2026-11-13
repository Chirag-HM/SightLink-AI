/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ivory: {
          50: '#FFFFFF',
          100: '#FCFBF7',
          200: '#FAF7F0',
          300: '#F4EFE4',
          400: '#EFE8DA',
          500: '#E5DCCB',
        },
        beige: {
          50: '#F8F4EA',
          100: '#F3EDE0',
          200: '#EFE8DA',
          300: '#E5DAC6',
          400: '#D6C8B0',
        },
        emeraldRoyal: {
          50: '#ECF7F2',
          100: '#D5EFE3',
          200: '#AEE0CA',
          300: '#6EC8A3',
          400: '#27A678',
          500: '#058C5F',
          600: '#047857',
          700: '#065F46',
          800: '#074C38',
          900: '#063B2C',
        },
        champagne: {
          50: '#FDF9EF',
          100: '#FBF3DF',
          200: '#F4E3BC',
          300: '#E6CB8F',
          400: '#D1AC60',
          500: '#B88E3D',
          600: '#9A7227',
          700: '#7D5B1C',
        },
        navy: {
          950: '#FAF7F0',
          900: '#F3EDE0',
          800: '#EFE8DA',
          700: '#E5DCCB',
          600: '#D5C9B4',
        },
        dark: {
          50: '#12231B',
          100: '#1D3228',
          200: '#354B40',
          300: '#4F6358',
          400: '#697D72',
          500: '#84958B',
          600: '#CFC5B2',
          700: '#E2D9C8',
          800: '#EFE8DA',
          900: '#F6F1E6',
          950: '#FAF7F0',
        },
        accent: {
          teal: '#065F46',
          amber: '#9A7227',
          cyan: '#047857',
          blue: '#065F46',
          violet: '#0F766E',
          purple: '#0F766E',
          indigo: '#065F46',
          gold: '#C59B42',
        },
        status: {
          safe: '#065F46',
          warning: '#A16207',
          danger: '#DC2626',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'hero-gradient': 'linear-gradient(150deg, #FCFBF7 0%, #FAF7F0 52%, #F2ECE0 100%)',
        'card-gradient': 'linear-gradient(145deg, rgba(255,253,249,0.94) 0%, rgba(246,241,230,0.88) 100%)',
        'accent-gradient': 'linear-gradient(135deg, #065F46 0%, #058C5F 58%, #B88E3D 100%)',
        'text-gradient': 'linear-gradient(135deg, #064E3B 0%, #057A55 58%, #A67E2E 100%)',
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'float-delayed': 'float 6s ease-in-out 2s infinite',
        'glow': 'glow 2.5s ease-in-out infinite alternate',
        'pulse-soft': 'pulseSoft 3s ease-in-out infinite',
        'scan': 'scan 3s ease-in-out infinite',
        'gradient-x': 'gradientX 6s ease infinite',
        'wave': 'wave 2s ease-in-out infinite',
        'fade-up': 'fadeUp 0.8s ease-out forwards',
        'radar': 'radar 2s linear infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-14px)' },
        },
        glow: {
          '0%': { boxShadow: '0 8px 24px rgba(6, 95, 70, 0.14)' },
          '100%': { boxShadow: '0 12px 32px rgba(6, 95, 70, 0.22), 0 0 24px rgba(197, 155, 66, 0.16)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.72 },
        },
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '50%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(-100%)' },
        },
        gradientX: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        wave: {
          '0%, 100%': { transform: 'scaleY(0.5)' },
          '50%': { transform: 'scaleY(1.4)' },
        },
        fadeUp: {
          '0%': { opacity: 0, transform: 'translateY(24px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        radar: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
      },
      boxShadow: {
        'glow-sm': '0 4px 16px rgba(6, 95, 70, 0.14)',
        'glow-md': '0 10px 28px rgba(6, 95, 70, 0.20), 0 2px 10px rgba(197, 155, 66, 0.14)',
        'glow-lg': '0 14px 36px rgba(6, 95, 70, 0.26), 0 4px 16px rgba(197, 155, 66, 0.18)',
        'card': '0 8px 28px rgba(18, 35, 27, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
        'card-hover': '0 16px 38px rgba(18, 35, 27, 0.10), inset 0 1px 0 rgba(255, 255, 255, 0.95)',
      }
    },
  },
  plugins: [],
}
