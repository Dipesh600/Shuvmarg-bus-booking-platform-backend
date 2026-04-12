module.exports = {
  apps: [
    {
      name: "shuvmarg-backend",
      script: "./index.js",
      instances: "max", // Enables PM2 to spawn an instance per CPU core for maximum performance
      exec_mode: "cluster", 
      watch: false,
      max_memory_restart: "1G", // Auto-restart if a memory leak occurs
      env: {
        NODE_ENV: "development",
        PORT: 7012,
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 7012,
      }
    }
  ]
};
