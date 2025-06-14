import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    plugins: [
      react({
        // Enable React optimization features
        babel: {
          plugins: []
        }
      })
    ],
    server: {
      port: 3000,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    },
    // Configure esbuild to remove console.log in production
    esbuild: {
      drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
    },
  build: {
    outDir: 'build',
    // Reduce chunk size warning limit since we're optimizing bundles
    chunkSizeWarningLimit: 800,
    // Keep source maps hidden for debugging
    sourcemap: 'hidden',
    // Use esbuild for faster builds and smaller output
    minify: 'esbuild',
    // Enable CSS code splitting
    cssCodeSplit: true,
    // Additional build optimizations
    rollupOptions: {
      output: {
        // Optimize chunk naming for better caching
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          // Organize assets by type for better caching
          const name = assetInfo.name || 'asset';
          const info = name.split('.');
          const ext = info[info.length - 1];
          if (/\.(css)$/.test(name)) {
            return `assets/css/[name]-[hash].${ext}`;
          }
          if (/\.(png|jpe?g|svg|gif|tiff|bmp|ico)$/.test(name)) {
            return `assets/img/[name]-[hash].${ext}`;
          }
          if (/\.(woff|woff2|eot|ttf|otf)$/.test(name)) {
            return `assets/fonts/[name]-[hash].${ext}`;
          }
          return `assets/[name]-[hash].${ext}`;
        },
        manualChunks: (id) => {
          // Vendor chunk for React and core dependencies
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react-vendor';
          }
          
          // AWS SDK chunks - split further for better caching
          if (id.includes('@aws-sdk/client-cognito') || id.includes('@aws-sdk/credential-provider-cognito')) {
            return 'aws-auth';
          }
          if (id.includes('@aws-sdk/client-s3') || id.includes('@aws-sdk/s3-request-presigner')) {
            return 'aws-storage';
          }
          if (id.includes('@aws-sdk/client-dynamodb') || id.includes('@aws-sdk/lib-dynamodb')) {
            return 'aws-db';
          }
          
          // Icon libraries - frequently used, cache separately
          if (id.includes('@iconscout/react-unicons')) {
            return 'icons';
          }
          
          // Video libraries - large but rarely updated
          if (id.includes('hls.js') || id.includes('@vidstack')) {
            return 'video';
          }
          
          // Routing - small but frequently updated
          if (id.includes('react-router')) {
            return 'router';
          }
          
          // All other node_modules as vendor
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        },
      },
    },
  },
  define: {
    // Load environment variables from .env files with proper fallbacks
    'process.env.REACT_APP_USER_POOL_CLIENT_ID': JSON.stringify(env.REACT_APP_USER_POOL_CLIENT_ID || 'development_client_id_placeholder'),
    'process.env.REACT_APP_USER_POOL_ID': JSON.stringify(env.REACT_APP_USER_POOL_ID || 'us-east-1_DEVDEVDEV'),
    'process.env.REACT_APP_IDENTITY_POOL_ID': JSON.stringify(env.REACT_APP_IDENTITY_POOL_ID || 'us-east-1:dev-dev-dev-dev-development'),
    'process.env.REACT_APP_AUTH_DOMAIN': JSON.stringify(env.REACT_APP_AUTH_DOMAIN || 'dev.auth.mymanor.click'),
    'process.env.REACT_APP_AWS_REGION': JSON.stringify(env.REACT_APP_AWS_REGION || 'us-east-1'),
    'process.env.REACT_APP_DEV_AUTH_BYPASS': JSON.stringify(env.REACT_APP_DEV_AUTH_BYPASS || 'true'),
    'process.env.REACT_APP_DEV_USER_EMAIL': JSON.stringify(env.REACT_APP_DEV_USER_EMAIL || 'dev@manor.test'),
    'process.env.REACT_APP_DEV_USER_NAME': JSON.stringify(env.REACT_APP_DEV_USER_NAME || 'Development User'),
    'process.env.REACT_APP_DEV_HOME_ID': JSON.stringify(env.REACT_APP_DEV_HOME_ID || '720frontrd'),
  },
  };
});
