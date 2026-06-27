module.exports = {
  run: [
    {
      method: "shell.run",
      params: {
        message: [
          "git clone https://github.com/Landers125/ace-step-ui_CPU app"
        ]
      }
    },
    {
      method: "shell.run",
      params: {
        message: [
          "git clone https://github.com/ace-step/ACE-Step-1.5 app/ACE-Step-1.5"
        ]
      }
    },
    {
      method: "shell.run",
      params: {
        path: "app",
        message: [
          "npm install"
        ]
      }
    },
    {
      method: "shell.run",
      params: {
        path: "app/server",
        message: [
          "npm install",
          "npm run db:migrate"
        ]
      }
    },
    {
      method: "shell.run",
      params: {
        venv: "env",
        venv_python: "3.11",
        path: "app/ACE-Step-1.5",
        message: [
          "uv pip install -e .",
          'uv pip install --upgrade --force-reinstall "torchao<0.16"',
          "uv pip install --force-reinstall torch torchaudio --index-url https://download.pytorch.org/whl/cpu"
        ]
      }
    }
  ]
}
