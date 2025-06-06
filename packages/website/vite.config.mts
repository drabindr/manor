import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react({
      // Enable React optimization features
      babel: {
        // Don't add babel console removal plugin since we're using terser instead
        plugins: []
      }
    })
  ],
  server: {
    port: 3000,
  },
  build: {
    outDir: 'build',
    chunkSizeWarningLimit: 1000,
    // Enable source maps for better debugging but keep them external
    sourcemap: 'hidden',
    // Use default esbuild minifier for better performance
    minify: 'esbuild',
    // Additional build optimizations
    rollupOptions: {
      // Optimize imports
      external: (id) => {
        // Don't bundle large optional dependencies that might not be used
        return false; // Keep all dependencies bundled for now
      },
      output: {
        // Optimize chunk naming for better caching
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        manualChunks: {
          // Split large video library
          vidstack: ['@vidstack/react'],
          // Split AWS SDK into separate chunks
          'aws-sdk-core': ['@aws-sdk/client-dynamodb', '@aws-sdk/lib-dynamodb'],
          'aws-sdk-cognito': ['@aws-sdk/client-cognito-identity', '@aws-sdk/client-cognito-identity-provider'],
          'aws-sdk-s3': ['@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner'],
          'aws-sdk-credentials': ['@aws-sdk/credential-provider-cognito-identity', '@aws-sdk/credential-providers'],
          // Split icon libraries
          'icons': ['@iconscout/react-unicons', '@iconscout/react-unicons-solid'],
          // Split React ecosystem
          'react-vendor': ['react', 'react-dom'],
          'react-router': ['react-router-dom'],
          // Split other heavy dependencies
          'axios': ['axios'],
          'video-libs': ['hls.js'],
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
