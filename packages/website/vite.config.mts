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
  server: {
    port: 3000,
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
          
          // Separate AuthService from AWS SDK to prevent circular dependencies
          if (id.includes('services/AuthService')) {
            return 'auth-service';
          }
          
          // Keep React contexts separate from services to avoid createContext conflicts
          if (id.includes('contexts/AuthContext')) {
            return 'auth-context';
          }
          
          // Force AWS credentials service into its own chunk - must be completely isolated
          if (id.includes('AWSCredentialsService') || id.includes('services/AWSCredentialsService')) {
            return 'aws-credentials-service';
          }
          
          // Further split AWS SDK to prevent circular dependencies
          if (id.includes('@aws-sdk/client-cognito-identity-provider')) {
            return 'aws-cognito-provider';
          }
          // Split these two problematic modules into separate chunks with delay
          if (id.includes('@aws-sdk/client-cognito-identity') && !id.includes('provider')) {
            return 'aws-cognito-identity-client';
          }
          if (id.includes('@aws-sdk/credential-provider-cognito-identity')) {
            return 'aws-cognito-credentials-provider';
          }
          if (id.includes('@aws-sdk/client-s3') || id.includes('@aws-sdk/s3-request-presigner')) {
            return 'aws-storage';
          }
          if (id.includes('@aws-sdk/client-dynamodb') || id.includes('@aws-sdk/lib-dynamodb')) {
            return 'aws-db';
          }
          
          // Separate core AWS SDK modules that might have circular dependencies
          if (id.includes('@aws-sdk/core')) {
            return 'aws-core';
          }
          if (id.includes('@smithy/smithy-client') || id.includes('@smithy/middleware-stack')) {
            return 'smithy-client';
          }
          if (id.includes('@smithy/protocol-http') || id.includes('@smithy/signature-v4')) {
            return 'smithy-protocol';
          }
          if (id.includes('@smithy/')) {
            return 'smithy-core';
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
