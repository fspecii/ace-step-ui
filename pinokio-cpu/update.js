module.exports = {
  run: [
    {
      method: "shell.run",
      params: {
        path: "app",
        message: "git pull"
      }
    },
    {
      method: "shell.run",
      params: {
        path: "app/ACE-Step-1.5",
        message: "git pull"
      }
    },
    {
      method: "shell.run",
      params: {
        path: "app",
        message: "npm install"
      }
    },
    {
      method: "shell.run",
      params: {
        path: "app/server",
        message: "npm install"
      }
    }
  ]
}
