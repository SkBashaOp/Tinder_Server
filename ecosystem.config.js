module.exports = {
  apps: [
    {
      name: "devfind-api",
      script: "src/app.js",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
