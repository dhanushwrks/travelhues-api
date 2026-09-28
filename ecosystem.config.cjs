module.exports = {
  apps: [
    {
      name: 'travelhues-api',
      script: 'dist/main.js',
      node_args: '--enable-source-maps',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: '4000',
      },
    },
  ],
};
