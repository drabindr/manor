import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react({
      // Enable React optimization features
      babel: {
        plugins: []
      }
    })
  ],
  // Configure dependency optimization
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      // Force fast-xml-parser to be pre-bundled as CommonJS
      'fast-xml-parser',
      // Force mnemonist to be pre-bundled to handle CommonJS/ESM compatibility
      'mnemonist/lru-cache'
    ],
    exclude: [
      // Exclude AWS SDK from pre-bundling to avoid circular dependency issues
      '@aws-sdk/client-cognito-identity-provider',
      '@aws-sdk/client-cognito-identity',
      '@aws-sdk/credential-provider-cognito-identity',
      '@aws-sdk/client-s3',
      '@aws-sdk/client-dynamodb',
      '@aws-sdk/lib-dynamodb'
    ]
  },
  server: {
    port: 3000,
  },
  // Configure esbuild to remove console.log in production
  esbuild: {
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
    // Fix AWS SDK initialization issues
    keepNames: true,
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
      // External dependencies that should not be bundled
      external: [],
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
          
          // AWS SDK - Use a single chunk to avoid circular dependency issues
          // The problem was splitting them too granularly caused initialization order issues
          if (id.includes('@aws-sdk/')) {
            return 'aws-sdk';
          }
          
          // Smithy protocols (AWS SDK dependencies) - separate chunk
          if (id.includes('@smithy/')) {
            return 'smithy';
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
    // Explicitly define environment variables for production
    'process.env.REACT_APP_USER_POOL_CLIENT_ID': JSON.stringify(process.env.REACT_APP_USER_POOL_CLIENT_ID || '15o15dldl3tl474cuje5e24k28'),
    'process.env.REACT_APP_USER_POOL_ID': JSON.stringify(process.env.REACT_APP_USER_POOL_ID || 'us-east-1_5V0U65Iev'),
    'process.env.REACT_APP_IDENTITY_POOL_ID': JSON.stringify(process.env.REACT_APP_IDENTITY_POOL_ID || 'us-east-1:91b9826c-15a5-4b44-b89a-dfdc1f2ca102'),
    'process.env.REACT_APP_AUTH_DOMAIN': JSON.stringify(process.env.REACT_APP_AUTH_DOMAIN || 'casa-guard-auth.auth.us-east-1.amazoncognito.com'),
    'process.env.REACT_APP_AWS_REGION': JSON.stringify(process.env.REACT_APP_AWS_REGION || 'us-east-1'),
  },
});
