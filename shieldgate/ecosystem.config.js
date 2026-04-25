module.exports = {
  apps: [
    {
      name: 'shieldgate-gateway',
      script: 'gateway/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 8080,
        REDIS_URL: 'redis://127.0.0.1:6379',
        BACKEND_URL: 'http://127.0.0.1:3000',
      },
    },
    {
      name: 'shieldgate-admin',
      script: 'admin/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
        PORT: 8081,
        REDIS_URL: 'redis://127.0.0.1:6379',
      },
    },
    {
      name: 'shieldgate-backend',
      script: 'backend/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
