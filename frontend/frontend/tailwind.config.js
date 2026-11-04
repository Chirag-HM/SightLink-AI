/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          50: '#e8e8ee',
          100: '#b8b8c8',
          200: '#8888a8',
          300: '#585878',
          400: '#383858',
          500: '#1a1a2e',
          600: '#151528',
          700: '#101022',
          800: '#0b0b1a',
          900: '#060612',
          950: '#030308',
        },
        accent: {
          cyan: '#00d4ff',
          blue: '#3b82f6',
          violet: '#8b5cf6',
          purple: '#a855f7',
          indigo: '#6366f1',
        },
        status: {
          safe: '#22c55e',
          warning: '#f59e0b',
          danger: '#ef4444',
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
        'hero-gradient': 'linear-gradient(135deg, #0b0b1a 0%, #1a1a2e 25%, #151528 50%, #0b0b1a 100%)',
        'card-gradient': 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
        'accent-gradient': 'linear-gradient(135deg, #00d4ff 0%, #8b5cf6 50%, #a855f7 100%)',
        'text-gradient': 'linear-gradient(135deg, #00d4ff 0%, #3b82f6 30%, #8b5cf6 60%, #a855f7 100%)',
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'float-delayed': 'float 6s ease-in-out 2s infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
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
          '50%': { transform: 'translateY(-20px)' },
        },
        glow: {
          '0%': { boxShadow: '0 0 20px rgba(0, 212, 255, 0.2)' },
          '100%': { boxShadow: '0 0 40px rgba(0, 212, 255, 0.4), 0 0 80px rgba(139, 92, 246, 0.2)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.7 },
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
          '50%': { transform: 'scaleY(1.5)' },
        },
        fadeUp: {
          '0%': { opacity: 0, transform: 'translateY(30px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        radar: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
      },
      boxShadow: {
        'glow-sm': '0 0 15px rgba(0, 212, 255, 0.15)',
        'glow-md': '0 0 30px rgba(0, 212, 255, 0.2), 0 0 60px rgba(139, 92, 246, 0.1)',
        'glow-lg': '0 0 40px rgba(0, 212, 255, 0.3), 0 0 80px rgba(139, 92, 246, 0.15)',
        'card': '0 4px 24px rgba(0, 0, 0, 0.4), 0 0 1px rgba(255, 255, 255, 0.05)',
        'card-hover': '0 8px 40px rgba(0, 0, 0, 0.6), 0 0 1px rgba(255, 255, 255, 0.1)',
      }
    },
  },
  plugins: [],
}
