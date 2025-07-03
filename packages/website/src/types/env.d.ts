/// <reference types="vite/client" />

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      REACT_APP_USER_POOL_ID?: string;
      REACT_APP_USER_POOL_CLIENT_ID?: string;
      REACT_APP_IDENTITY_POOL_ID?: string;
      REACT_APP_AUTH_DOMAIN?: string;
      REACT_APP_AWS_REGION?: string;
    }
  }
}

export {};
