module.exports = {
  apps: [{
    name: 'zhuiai-backend',
    script: './src/index.js',
    cwd: '/data/zhuiai/backend',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    env_production: {
      NODE_ENV: 'production'
    }
  }]
}