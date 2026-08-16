module.exports = {
  apps: [
    {
      name: 'tutor',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      env: {
        PORT: 3000,
        NODE_ENV: 'production',
      },
      cwd: __dirname,
      autorestart: true,
      max_restarts: 10,
    },
  ],
};
