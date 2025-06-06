module.exports = {
  content: ['./public/index.html', './index.html', './src/**/*.{js,jsx,ts,tsx}'], // Update this with your paths
  theme: {
    screens: {
      'xs': '375px',     // iPhone 12/13/14 standard
      'sm': '640px',     // Default Tailwind small
      'md': '768px',     // Default Tailwind medium
      'lg': '1024px',    // Default Tailwind large
      'xl': '1280px',    // Default Tailwind extra large
      '2xl': '1536px',   // Default Tailwind 2x extra large
      // iPhone-specific breakpoints
      'iphone-mini': '320px',    // iPhone 5/SE
      'iphone-std': '375px',     // iPhone 12/13/14 standard
      'iphone-15pro': '393px',   // iPhone 15 Pro
      'iphone-plus': '414px',    // iPhone Plus models
      'iphone-max': '430px',     // iPhone Pro Max models
    },
    extend: {
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-in': 'slideIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: 0, transform: 'translateY(10px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        slideIn: {
          '0%': { opacity: 0, transform: 'translateX(-10px)' },
          '100%': { opacity: 1, transform: 'translateX(0)' },
        },
        slideUp: {
          '0%': { opacity: 0, transform: 'translateY(20px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
      },
      colors: {
        'gray': {
          750: '#2f3236',
        },
      },
    },
  },
  plugins: [],
};

