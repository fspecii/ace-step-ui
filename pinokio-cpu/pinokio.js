module.exports = {
  version: "5.0",
  title: "ACE-Step UI (CPU)",
  icon: "https://raw.githubusercontent.com/cocktailpeanut/ace-step-ui.pinokio/main/icon.jpeg",
  description: "CPU-only launcher for ACE-Step UI / ACE-Step 1.5. For machines without a dedicated GPU (e.g. AMD Ryzen APU with integrated Radeon).",
  menu: async (kernel, info) => {
    let installed = info.exists("app/node_modules") && info.exists("app/server/node_modules") && info.exists("app/ACE-Step-1.5/env")
    let running = {
      install: info.running("install.js"),
      start: info.running("start.js"),
      update: info.running("update.js"),
      reset: info.running("reset.js")
    }

    if (running.install) {
      return [{
        default: true,
        icon: "fa-solid fa-plug",
        text: "Installing",
        href: "install.js"
      }]
    }

    if (installed) {
      if (running.start) {
        let local = info.local("start.js")
        if (local && local.url) {
          return [{
            default: true,
            icon: "fa-solid fa-rocket",
            text: "Open Web UI",
            href: local.url
          }, {
            icon: "fa-solid fa-terminal",
            text: "Terminal",
            href: "start.js"
          }]
        }

        return [{
          default: true,
          icon: "fa-solid fa-terminal",
          text: "Terminal",
          href: "start.js"
        }]
      }

      if (running.update) {
        return [{
          default: true,
          icon: "fa-solid fa-terminal",
          text: "Updating",
          href: "update.js"
        }]
      }

      if (running.reset) {
        return [{
          default: true,
          icon: "fa-solid fa-terminal",
          text: "Resetting",
          href: "reset.js"
        }]
      }

      return [{
        default: true,
        icon: "fa-solid fa-power-off",
        text: "Start",
        href: "start.js"
      }, {
        icon: "fa-solid fa-plug",
        text: "Update",
        href: "update.js"
      }, {
        icon: "fa-solid fa-plug",
        text: "Install",
        href: "install.js"
      }, {
        icon: "fa-regular fa-circle-xmark",
        text: "Reset",
        href: "reset.js",
        confirm: "Are you sure you wish to reset the app?"
      }]
    }

    return [{
      default: true,
      icon: "fa-solid fa-plug",
      text: "Install",
      href: "install.js"
    }]
  }
}
