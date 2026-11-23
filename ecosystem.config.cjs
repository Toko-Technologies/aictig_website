module.exports = {
  apps: [{
    name: 'aictig-website',
    script: 'node',
    args: 'server.cjs',
    // Root-owned checkout. Not /home/aictig: the vhost user owns that and
    // could swap the code PM2 runs as root. See deploy/aictig-deploy.sh.
    cwd: '/opt/aictig-website',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    // Root-owned log dir: PM2 opens these as root, so they must not live in a
    // directory the vhost user could plant a symlink in.
    error_file: '/var/log/aictig-website/err.log',
    out_file: '/var/log/aictig-website/out.log',
    log_file: '/var/log/aictig-website/combined.log',
    time: true
  }]
};
