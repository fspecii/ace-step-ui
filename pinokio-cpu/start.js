const path = require('path')
const ACESTEP_DIR = path.join(__dirname, "app", "ACE-Step-1.5");
module.exports = {
  daemon: true,
  run: [
    {
      method: "shell.run",
      params: {
        venv: "env",
        path: "app/ACE-Step-1.5",
        buffer: 10240,
        env: {
          MASTER_ADDR: "127.0.0.1",
          VLLM_HOST_IP: "127.0.0.1",
          CUDA_VISIBLE_DEVICES: "-1",
          HIP_VISIBLE_DEVICES: "-1",
          ACESTEP_LM_BACKEND: "pt",
          ACESTEP_INIT_LLM: "false",
          ACESTEP_VAE_ON_CPU: "1",
          ACESTEP_LM_OFFLOAD_TO_CPU: "true"
        },
        message: [
          "acestep --port 8001 --enable-api --backend pt --server-name 127.0.0.1"
        ],
        on: [{
          event: "/API endpoints enabled/i",
          done: true
        }, {
          event: "/system error/i",
          break: false
        }, {
          event: "/failed to connect/i",
          break: false
        }]
      }
    },
    {
      method: "local.set",
      params: {
        url: "http://127.0.0.1:3000",
        frontend_url: "http://127.0.0.1:3000"
      }
    },
    {
      method: "shell.run",
      params: {
        path: "app/server",
        env: {
          PORT: "3001",
          ACESTEP_API_URL: "http://127.0.0.1:8001",
          NODE_ENV: "development",
          DATABASE_PATH: "./data/acestep.db",
          AUDIO_DIR: "./public/audio",
          FRONTEND_URL: "http://127.0.0.1:3000",
          ACESTEP_PATH: ACESTEP_DIR,
          JWT_SECRET: "ace-step-ui-local-secret"
        },
        message: [
          "npm run dev"
        ],
        on: [{
          event: "/ACE-Step UI Server running/",
          done: true
        }]
      }
    },
    {
      method: "shell.run",
      params: {
        path: "app",
        message: [
          "npm run dev -- --host 127.0.0.1 --port 3000 --strictPort"
        ],
        on: [{
          event: "/Local:/i",
          done: true
        }]
      }
    }
  ]
}
