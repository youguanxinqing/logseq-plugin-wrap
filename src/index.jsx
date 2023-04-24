import "@logseq/libs"
import { setup, t } from "logseq-l10n"
import { render } from "preact"
import { debounce, throttle } from "rambdax"
import Toolbar from "./Toolbar.jsx"
import zhCN from "./translations/zh-CN.json"

const TOOLBAR_ID = "kef-wrap-toolbar"
let toolbar
let textarea
const useCustMark = true

async function main() {
  // Reset values.
  toolbar = null
  textarea = null

  await setup({ builtinTranslations: { "zh-CN": zhCN } })

  const definitions = await getDefinitions()

  logseq.provideStyle(`
    :root {
      --kef-wrap-tb-bg: #333e;
    }
    :root.dark {
      --kef-wrap-tb-bg: #777e;
    }
    #kef-wrap-toolbar {
      position: absolute;
      top: 0;
      left: -99999px;
      z-index: var(--ls-z-index-level-2);
      opacity: 0;
      will-change: opacity;
      transition: opacity 100ms ease-in-out;
      background: var(--kef-wrap-tb-bg);
      border-radius: 6px;
      color: #fff;
      display: flex;
      align-items: center;
      height: 30px;
      padding: 0 10px;
    }
    .kef-wrap-tb-list {
      position: relative;
    }
    .kef-wrap-tb-list:hover .kef-wrap-tb-itemlist {
      transform: scaleY(1);
    }
    .kef-wrap-tb-itemlist {
      position: absolute;
      top: 100%;
      left: 0;
      background: var(--kef-wrap-tb-bg);
      border-radius: 0 0 6px 6px;
      transform: scaleY(0);
      transform-origin: top center;
      will-change: transform;
      transition: transform 100ms ease-in-out;
    }
    .kef-wrap-tb-item {
      width: 30px;
      line-height: 20px;
      height: 30px;
      overflow: hidden;
      text-align: center;
      padding: 5px;
      margin: 0 2px;
      cursor: pointer;
    }
    .kef-wrap-tb-item:hover {
      filter: drop-shadow(0 0 3px #fff);
    }
    .kef-wrap-tb-item img {
      width: 20px;
      height: 20px;
    }
    .kef-wrap-hidden #kef-wrap-toolbar {
      display: none;
    }

    span[data-ref="#red"],
    span[data-ref="#green"],
    span[data-ref="#blue"],
    span[data-ref="$red"],
    span[data-ref="$green"],
    span[data-ref="$blue"] {
      display: none;
    }
    span[data-ref="#red"] + mark {
      background: #ffc7c7 !important;
      color: #262626 !important;
    }
    span[data-ref="#green"] + mark {
      background: #ccffc1 !important;
      color: #262626 !important;
    }
    span[data-ref="#blue"] + mark {
      background: #abdfff !important;
      color: #262626 !important;
    }
    span[data-ref="$red"] + mark {
      color: #f00 !important;
      background: unset !important;
      padding: 0;
      border-radius: 0;
    }
    span[data-ref="$green"] + mark {
      color: #0f0 !important;
      background: unset !important;
      padding: 0;
      border-radius: 0;
    }
    span[data-ref="$blue"] + mark {
      color: #00f !important;
      background: unset !important;
      padding: 0;
      border-radius: 0;
    }
  `)

  const model = {}
  for (const definition of definitions) {
    if (definition.key.startsWith("group-")) {
      for (const def of definition.items) {
        registerModel(model, def)
      }
    } else {
      registerModel(model, definition)
    }
  }
  logseq.provideModel(model)

  if (logseq.settings?.toolbar ?? true) {
    logseq.provideUI({
      key: TOOLBAR_ID,
      path: "#app-container",
      template: `<div id="${TOOLBAR_ID}"></div>`,
    })

    if (logseq.settings?.toolbarShortcut) {
      logseq.App.registerCommandPalette(
        {
          key: "toggle-toolbar",
          label: t("Toggle toolbar display"),
          keybinding: { binding: logseq.settings?.toolbarShortcut },
        },
        toggleToolbarDisplay,
      )
    } else {
      logseq.App.registerCommandPalette(
        { key: "toggle-toolbar", label: t("Toggle toolbar display") },
        toggleToolbarDisplay,
      )
    }

    // Let div root element get generated first.
    setTimeout(async () => {
      toolbar = parent.document.getElementById(TOOLBAR_ID)
      render(<Toolbar items={definitions} model={model} />, toolbar)

      toolbar.addEventListener("transitionend", onToolbarTransitionEnd)
      parent.document.addEventListener("focusout", onBlur)

      const mainContentContainer = parent.document.getElementById(
        "main-content-container",
      )
      mainContentContainer.addEventListener("scroll", onScroll, {
        passive: true,
      })
    }, 0)
  }

  parent.document.addEventListener("selectionchange", (e) => onSelectionChange(e))

  logseq.beforeunload(async () => {
    if (textarea) {
      textarea.removeEventListener("keydown", deletionWorkaroundHandler)
    }
    const mainContentContainer = parent.document.getElementById(
      "main-content-container",
    )
    mainContentContainer.removeEventListener("scroll", onScroll, {
      passive: true,
    })
    toolbar?.removeEventListener("transitionend", onToolbarTransitionEnd)
    parent.document.removeEventListener("focusout", onBlur)
    parent.document.removeEventListener("selectionchange", onSelectionChange)
  })

  for (const definition of definitions) {
    if (definition.key.startsWith("group-")) {
      for (const def of definition.items) {
        registerCommand(model, def)
      }
    } else {
      registerCommand(model, definition)
    }
  }

  console.log("#wrap loaded")
}

async function getDefinitions() {
  const ret = Object.entries(logseq.settings ?? {})
    .filter(
      ([k, v]) =>
        k.startsWith("wrap-") ||
        k.startsWith("repl-") ||
        k.startsWith("group-"),
    )
    .map(([k, v]) => {
      if (k.startsWith("group-")) {
        return {
          key: k,
          items: Object.entries(v).map(([kk, vv]) => ({ key: kk, ...vv })),
        }
      } else {
        return { key: k, ...v }
      }
    })

  if (ret.length > 0) return ret

  const { preferredFormat } = await logseq.App.getUserConfigs()
  const getColorMark = (color) => useCustMark ? `[:mark {:class "${color}"} "$^"]` : `[[${color}]]==$^==`
  return [
    {
      key: "wrap-page",
      label: t("Wrap as page"),
      binding: "",
      template: "[[$^]]",
      icon: `<svg t="1645787758322" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="2310" width="200" height="200"><path d="M550.88 20.15h262.24v131.12H682v721.16h131.12v131.12H550.88V20.15z" p-id="2311" fill="#eeeeee"></path></svg>`,
    },

    {
      key: "group-cloze",
      items:[
        {
          key: "wrap-cloze",
          label: t("Wrap with cloze"),
          binding: "",
          template: " {{cloze $^}}",
          icon: `<svg t="1643261888324" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5478" xmlns:xlink="http://www.w3.org/1999/xlink" width="200" height="200"><defs><style type="text/css"></style></defs><path d="M341.333333 396.8V320H170.666667v384h170.666666v-76.8H256V396.8zM682.666667 396.8V320h170.666666v384h-170.666666v-76.8h85.333333V396.8zM535.04 533.333333h40.96v-42.666666h-40.96V203.093333l92.16-24.746666-11.093333-40.96-102.4 27.306666-102.4-27.306666-11.093334 40.96 92.16 24.746666v287.573334H448v42.666666h44.373333v287.573334l-92.16 24.746666 11.093334 40.96 102.4-27.306666 102.4 27.306666 11.093333-40.96-92.16-24.746666z" p-id="5479" fill="#eeeeee"></path></svg>`,
        },
        /* 和css一起工作
span[data-ref="#cloze"] {
  display: none;
}
span[data-ref="#cloze"] + mark {
  color: transparent !important;
  text-decoration: underline 1px dashed var(--ls-primary-text-color) !important;
}
span[data-ref="#cloze"] + mark:hover {
  color: var(--ls-primary-text-color) !important;
}
         */
        {
          key: "wrap-cloze-invisible",
          label: t("Wrap with invisible"),
          binding: "",
          template: "[[cloze]]==$^==",
          icon: `<svg t="1682306531661" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1454" width="200" height="200"><path d="M917.333333 573.866667l-87.466666-87.466667c34.133333-32 66.133333-68.266667 91.733333-108.8 8.533333-14.933333 4.266667-34.133333-10.666667-44.8-14.933333-8.533333-34.133333-4.266667-44.8 10.666667-76.8 125.866667-209.066667 200.533333-356.266666 200.533333-145.066667 0-279.466667-74.666667-354.133334-198.4-8.533333-14.933333-29.866667-19.2-44.8-10.666667-14.933333 8.533333-19.2 29.866667-10.666666 44.8 25.6 40.533333 55.466667 76.8 91.733333 108.8l-85.333333 85.333334c-12.8 12.8-12.8 32 0 44.8 6.4 6.4 14.933333 8.533333 23.466666 8.533333s17.066667-2.133333 23.466667-8.533333l91.733333-91.733334c38.4 25.6 81.066667 46.933333 125.866667 59.733334l-34.133333 130.133333c-4.266667 17.066667 6.4 34.133333 23.466666 38.4 2.133333 0 6.4 2.133333 8.533334 2.133333 14.933333 0 27.733333-8.533333 29.866666-23.466666l36.266667-132.266667c25.6 4.266667 51.2 6.4 78.933333 6.4 27.733333 0 55.466667-2.133333 83.2-6.4l36.266667 132.266667c4.266667 14.933333 17.066667 23.466667 29.866667 23.466666 2.133333 0 6.4 0 8.533333-2.133333 17.066667-4.266667 27.733333-21.333333 23.466667-38.4L661.333333 584.533333c44.8-12.8 85.333333-34.133333 123.733334-59.733333l91.733333 91.733333c6.4 6.4 14.933333 8.533333 23.466667 8.533334s17.066667-2.133333 23.466666-8.533334c6.4-10.666667 6.4-29.866667-6.4-42.666666z" fill="#eeeeee" p-id="1455"></path></svg>`
        }
      ]
    },
    {
      key: "group-style",
      items: [
        {
          key: "wrap-bold",
          label: t("Wrap as bold text"),
          binding: "",
          template: "**$^**",
          icon: `<svg t="1645771993393" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="4784" width="200" height="200"><path d="M768.96 575.072c-22.144-34.112-54.816-56.8-97.984-68.032v-2.176c22.88-10.88 42.112-23.04 57.696-36.48 15.616-12.704 27.584-26.144 35.936-40.288 16.32-29.76 24.128-60.96 23.392-93.632 0-63.872-19.776-115.232-59.328-154.08-39.2-38.464-97.824-58.048-175.84-58.784H215.232v793.728H579.52c62.432 0 114.496-20.864 156.256-62.624 42.112-39.936 63.52-94.176 64.224-162.752 0-41.376-10.336-79.68-31.04-114.88zM344.32 228.832h194.912c43.904 0.736 76.224 11.424 96.896 32.128 21.056 22.144 31.584 49.184 31.584 81.12s-10.528 58.432-31.584 79.488c-20.672 22.848-52.992 34.304-96.896 34.304H344.32V228.832z m304.352 536.256c-20.672 23.584-53.344 35.744-97.984 36.48H344.32v-238.432h206.336c44.64 0.704 77.312 12.512 97.984 35.392 20.672 23.232 31.04 51.168 31.04 83.84 0 31.904-10.336 59.488-31.008 82.72z" p-id="4785" fill="#eeeeee"></path></svg>`,
        },
        {
          key: "wrap-underline",
          label: t("Wrap as underline text"),
          binding: "",
          template: "[:u \"$^\"]",
          icon: `<svg t="1645771982354" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="4586" width="200" height="200"><path d="M512 811.296a312 312 0 0 0 312-312V89.6h-112v409.696a200 200 0 1 1-400 0V89.6h-112v409.696a312 312 0 0 0 312 312zM864 885.792H160a32 32 0 0 0 0 64h704a32 32 0 0 0 0-64z" p-id="4587" fill="#eeeeee"></path></svg>`,
        },
        {
          key: "wrap-delline",
          label: t("Wrap as delline text"),
          binding: "",
          template: "~~$^~~",
          icon: `<svg t="1645771956831" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="4340" width="200" height="200"><path d="M893.088 501.792H125.344a32 32 0 0 0 0 64h767.744a32 32 0 0 0 0-64zM448 448h112V208h288V96H160v112h288zM448 640h112v288H448z" p-id="4341" fill="#eeeeee"></path></svg>`,
        },
        {
          key: "wrap-italic",
          label: t("Wrap as italic text"),
          binding: "",
          template: "_$^_",
          icon: `<svg t="1645772015907" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="4982" width="200" height="200"><path d="M768 85.792h-288a32 32 0 0 0 0 64h96.32l-230.336 704H256a32 32 0 0 0 0 64h288a32 32 0 0 0 0-64h-93.728l230.528-704H768a32 32 0 0 0 0-64z" p-id="4983" fill="#eeeeee"></path></svg>`,
        },
        {
          key: "wrap-inlinecode",
          label: t("Wrap as inlinecode"),
          binding: "",
          template: "`$^`",
          icon: `<svg t="1645771863465" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="13069" width="200" height="200"><path d="M300.224 224L32 525.76l268.224 301.76 71.776-63.776-211.552-237.984 211.552-237.984zM711.744 224L640 287.776l211.552 237.984L640 763.744l71.744 63.776 268.256-301.76z" p-id="13070" fill="#eeeeee"></path></svg>`,
        },
      ]
    },
    {
      key: "group-hl",
      items: [
        {
          key: "wrap-red-hl",
          label: t("Wrap with red highlight"),
          binding: "",
          template: preferredFormat === "org" ? "[[#red]]^^$^^^" : getColorMark("#red"),
          icon: `<svg t="1643262039637" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="6950" xmlns:xlink="http://www.w3.org/1999/xlink" width="200" height="200"><defs><style type="text/css"></style></defs><path d="M114.727313 1024l0.305421-0.427589h-0.977347l0.671926 0.427589zM632.721199 809.365446c-156.680934 0-272.466006 41.644143-341.659116 75.927642L290.878831 972.108985C340.402833 942.605324 458.249497 885.720677 632.73647 885.720677H962.804862v-76.355231H632.73647z m-109.432317-72.018253l252.048617-528.378197a38.177615 38.177615 0 0 0-13.621773-48.790993L551.295981 24.464216a38.192886 38.192886 0 0 0-50.089031 7.696607L130.349594 483.908911a38.208157 38.208157 0 0 0-7.024682 35.886958c31.763776 100.315502 36.436716 182.626441 34.695817 234.777064L94.477906 870.449631h132.094549l32.221908-42.606219c49.78361-25.624815 134.15614-60.931474 233.326314-69.177839a38.147073 38.147073 0 0 0 31.152934-21.31838z m-59.343285-52.54767c-71.66702 8.505973-134.950235 28.572127-184.489509 49.157497l-45.339736-29.244053c-2.290657-50.883126-10.613377-114.716099-31.901215-187.849139l336.161539-409.874879 153.474014 98.986922-193.728492 408.653195-176.838714-112.746134-47.935814 60.015211 191.117142 121.847678-0.519215 1.053702z" p-id="6951" fill="#ffc7c7"></path></svg>`,
        },
        {
          key: "wrap-green-hl",
          label: t("Wrap with green highlight"),
          binding: "",
          template:
            preferredFormat === "org" ? "[[#green]]^^$^^^" : getColorMark("#green"),
          icon: `<svg t="1643262039637" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="6950" xmlns:xlink="http://www.w3.org/1999/xlink" width="200" height="200"><defs><style type="text/css"></style></defs><path d="M114.727313 1024l0.305421-0.427589h-0.977347l0.671926 0.427589zM632.721199 809.365446c-156.680934 0-272.466006 41.644143-341.659116 75.927642L290.878831 972.108985C340.402833 942.605324 458.249497 885.720677 632.73647 885.720677H962.804862v-76.355231H632.73647z m-109.432317-72.018253l252.048617-528.378197a38.177615 38.177615 0 0 0-13.621773-48.790993L551.295981 24.464216a38.192886 38.192886 0 0 0-50.089031 7.696607L130.349594 483.908911a38.208157 38.208157 0 0 0-7.024682 35.886958c31.763776 100.315502 36.436716 182.626441 34.695817 234.777064L94.477906 870.449631h132.094549l32.221908-42.606219c49.78361-25.624815 134.15614-60.931474 233.326314-69.177839a38.147073 38.147073 0 0 0 31.152934-21.31838z m-59.343285-52.54767c-71.66702 8.505973-134.950235 28.572127-184.489509 49.157497l-45.339736-29.244053c-2.290657-50.883126-10.613377-114.716099-31.901215-187.849139l336.161539-409.874879 153.474014 98.986922-193.728492 408.653195-176.838714-112.746134-47.935814 60.015211 191.117142 121.847678-0.519215 1.053702z" p-id="6951" fill="#ccffc1"></path></svg>`,
        },
        {
          key: "wrap-blue-hl",
          label: t("Wrap with blue highlight"),
          binding: "",
          template:
            preferredFormat === "org" ? "[[#blue]]^^$^^^" : getColorMark("#blue"),
          icon: `<svg t="1643262039637" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="6950" xmlns:xlink="http://www.w3.org/1999/xlink" width="200" height="200"><defs><style type="text/css"></style></defs><path d="M114.727313 1024l0.305421-0.427589h-0.977347l0.671926 0.427589zM632.721199 809.365446c-156.680934 0-272.466006 41.644143-341.659116 75.927642L290.878831 972.108985C340.402833 942.605324 458.249497 885.720677 632.73647 885.720677H962.804862v-76.355231H632.73647z m-109.432317-72.018253l252.048617-528.378197a38.177615 38.177615 0 0 0-13.621773-48.790993L551.295981 24.464216a38.192886 38.192886 0 0 0-50.089031 7.696607L130.349594 483.908911a38.208157 38.208157 0 0 0-7.024682 35.886958c31.763776 100.315502 36.436716 182.626441 34.695817 234.777064L94.477906 870.449631h132.094549l32.221908-42.606219c49.78361-25.624815 134.15614-60.931474 233.326314-69.177839a38.147073 38.147073 0 0 0 31.152934-21.31838z m-59.343285-52.54767c-71.66702 8.505973-134.950235 28.572127-184.489509 49.157497l-45.339736-29.244053c-2.290657-50.883126-10.613377-114.716099-31.901215-187.849139l336.161539-409.874879 153.474014 98.986922-193.728492 408.653195-176.838714-112.746134-47.935814 60.015211 191.117142 121.847678-0.519215 1.053702z" p-id="6951" fill="#abdfff"></path></svg>`,
        },
      ]
    },
    {
      key: "group-text",
      items: [
        {
          key: "wrap-red-text",
          label: t("Wrap with red text"),
          binding: "",
          template: preferredFormat === "org" ? "[[$red]]^^$^^^" : getColorMark("$red"),
          icon: `<svg t="1643270432116" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="12761" width="200" height="200"><path d="M256 768h512a85.333333 85.333333 0 0 1 85.333333 85.333333v42.666667a85.333333 85.333333 0 0 1-85.333333 85.333333H256a85.333333 85.333333 0 0 1-85.333333-85.333333v-42.666667a85.333333 85.333333 0 0 1 85.333333-85.333333z m0 85.333333v42.666667h512v-42.666667H256z m401.578667-341.333333H366.421333L298.666667 682.666667H213.333333l256.128-640H554.666667l256 640h-85.333334l-67.754666-170.666667z m-33.877334-85.333333L512 145.365333 400.298667 426.666667h223.402666z" p-id="12762" fill="#f00"></path></svg>`,
        },
        {
          key: "wrap-green-text",
          label: t("Wrap with green text"),
          binding: "",
          template:
            preferredFormat === "org" ? "[[$green]]^^$^^^" : getColorMark("$green"),
          icon: `<svg t="1643270432116" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="12761" width="200" height="200"><path d="M256 768h512a85.333333 85.333333 0 0 1 85.333333 85.333333v42.666667a85.333333 85.333333 0 0 1-85.333333 85.333333H256a85.333333 85.333333 0 0 1-85.333333-85.333333v-42.666667a85.333333 85.333333 0 0 1 85.333333-85.333333z m0 85.333333v42.666667h512v-42.666667H256z m401.578667-341.333333H366.421333L298.666667 682.666667H213.333333l256.128-640H554.666667l256 640h-85.333334l-67.754666-170.666667z m-33.877334-85.333333L512 145.365333 400.298667 426.666667h223.402666z" p-id="12762" fill="#0f0"></path></svg>`,
        },
        {
          key: "wrap-blue-text",
          label: t("Wrap with blue text"),
          binding: "",
          template:
            preferredFormat === "org" ? "[[$blue]]^^$^^^" : getColorMark("$blue"),
          icon: `<svg t="1643270432116" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="12761" width="200" height="200"><path d="M256 768h512a85.333333 85.333333 0 0 1 85.333333 85.333333v42.666667a85.333333 85.333333 0 0 1-85.333333 85.333333H256a85.333333 85.333333 0 0 1-85.333333-85.333333v-42.666667a85.333333 85.333333 0 0 1 85.333333-85.333333z m0 85.333333v42.666667h512v-42.666667H256z m401.578667-341.333333H366.421333L298.666667 682.666667H213.333333l256.128-640H554.666667l256 640h-85.333334l-67.754666-170.666667z m-33.877334-85.333333L512 145.365333 400.298667 426.666667h223.402666z" p-id="12762" fill="#00beff"></path></svg>`,
        },
      ]
    },

    {
      key: "wrap-formular",
      label: t("Wrap as formular"),
      binding: "",
      template: "$$$^$$",
      icon: `<svg t="1645767612297" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="3054" width="200" height="200"><path d="M552.0896 565.90336L606.03392 512l-53.94432-53.90336L290.6112 196.83328l551.0144-0.29696v-76.25728l-659.17952 0.3584v76.25728L498.14528 512 182.3744 827.50464v75.85792l659.17952 0.3584v-76.25728l-551.0144-0.29696 261.55008-261.26336" p-id="3055" fill="#eeeeee"></path></svg>`,
    },
    {
      key: "repl-clear",
      label: t("Remove formatting"),
      binding: "mod+shift+x",
      /**
       * \\[\\[(?:#|\\$)(?:red|green|blue)\\]\\]
       * ==([^=]*)==
       * ~~([^~]*)~~
       * \\^\\^([^\\^]*)\\^\\^
       * \\*\\*([^\\*]*)\\*\\*
       * \\*([^\\*]*)\\*
       * _([^_]*)_
       * \\$([^\\$]*)\\$
       * \`([^\`]*)\`
       * \\[:mark\\s+{:class\\s+\"(?:\\$|#)?(?:yellow|pink|blue|green|red|grey|gray|orange|purple)\"}\\s+\"(.*?)\"\\]
       * \\[:u\\s+\"([^\"]*)\"\\]
       * \\[\\[([^\\]]*)\\]\\]
       */

      regex: `\\[\\[(?:#|\\$)(?:red|green|blue)\\]\\]|==([^=]*)==|~~([^~]*)~~|\\^\\^([^\\^]*)\\^\\^|\\*\\*([^\\*]*)\\*\\*|\\*([^\\*]*)\\*|_([^_]*)_|\\$([^\\$]*)\\$|\`([^\`]*)\`|\\[:mark\\s+{:class\\s+\"(?:\\$|#)?(?:yellow|pink|blue|green|red|grey|gray|orange|purple)\"}\\s+\"(.*?)\"\\]|\\[:u\\s+\"([^\"]*)\"\\]|\\[\\[([^\\]]*)\\]\\]`,
      replacement: "$1$2$3$4$5$6$7$8$9$10$11",
      icon: `<svg t="1643381967522" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1377" width="200" height="200"><path d="M824.4 438.8c0-37.6-30-67.6-67.6-67.6l-135.2 0L621.6 104.8c0-37.6-30-67.6-67.6-67.6-37.6 0-67.6 30-67.6 67.6l0 266.4L358.8 371.2c-37.6 0-67.6 30-67.6 67.6l0 67.6L828 506.4l0-67.6L824.4 438.8 824.4 438.8zM824.4 574c-11.2 0-536.8 0-536.8 0S250 972 88.4 972L280 972c75.2 0 108.8-217.6 108.8-217.6s33.6 195.2 3.6 217.6l105.2 0c-3.6 0 0 0 11.2 0 52.4-7.6 60-247.6 60-247.6s52.4 244 45.2 244c-26.4 0-78.8 0-105.2 0l0 0 154 0c-7.6 0 0 0 11.2 0 48.8-11.2 52.4-187.6 52.4-187.6s22.4 187.6 15.2 187.6c-18.8 0-48.8 0-67.6 0l-3.6 0 90 0C895.6 972 903.2 784.4 824.4 574L824.4 574z" p-id="1378" fill="#eeeeee"></path></svg>`,
    },
    {

    }
  ]
}

function registerCommand(model, { key, label, binding }) {
  if (binding) {
    logseq.App.registerCommandPalette(
      { key, label, keybinding: { binding } },
      model[key],
    )
  } else {
    logseq.App.registerCommandPalette({ key, label }, model[key])
  }
}

function registerModel(model, { key, template, regex, replacement }) {
  model[key] = key.startsWith("wrap-")
    ? () => updateBlockText(wrap, template)
    : () => updateBlockText(repl, regex, replacement)
}

async function updateBlockText(producer, ...args) {
  const block = await logseq.Editor.getCurrentBlock()

  if (block == null || textarea == null) {
    logseq.App.showMsg(
      t("This command can only be used when editing text"),
      "error",
    )
    return
  }

  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const before = textarea.value.substring(0, start)
  const selection = textarea.value.substring(start, end)
  const after = textarea.value.substring(end)
  const [text, selStart, selEnd] = await producer(
    before,
    selection,
    after,
    start,
    end,
    ...args,
  )
  await logseq.Editor.updateBlock(block.uuid, text)
  if (textarea?.isConnected) {
    textarea.focus()
    textarea.setSelectionRange(selStart, selEnd)
  } else {
    await logseq.Editor.editBlock(block.uuid)
    parent.document.activeElement.setSelectionRange(selStart, selEnd)
  }
}

function wrap(before, selection, after, start, end, template) {
  const m = selection.match(/\s+$/)
  const [text, whitespaces] =
    m == null ? [selection, ""] : [selection.substring(0, m.index), m[0]]
  const [wrapBefore, wrapAfter] = template.split("$^")
  return [
    `${before}${wrapBefore}${text}${wrapAfter ?? ""}${whitespaces}${after}`,
    start,
    end + wrapBefore.length - whitespaces.length + wrapAfter.length,
  ]
}

function repl(before, selection, after, start, end, regex, replacement) {
  const newText = selection.replace(new RegExp(regex, "g"), replacement)
  return [`${before}${newText}${after}`, start, start + newText.length]
}

async function onSelectionChange(e) {
  const activeElement = parent.document.activeElement
  if (
    activeElement !== textarea &&
    activeElement.nodeName.toLowerCase() === "textarea"
  ) {
    if (toolbar != null && textarea != null) {
      textarea.removeEventListener("keydown", deletionWorkaroundHandler)
    }
    textarea = activeElement
    if (toolbar != null) {
      textarea.addEventListener("keydown", deletionWorkaroundHandler)
    }
  }

  if (toolbar != null && activeElement === textarea) {
    if (
      textarea.selectionStart === textarea.selectionEnd &&
      toolbar.style.opacity !== "0"
    ) {
      toolbar.style.opacity = "0"
    } else if (textarea.selectionStart !== textarea.selectionEnd) {
      await positionToolbar()
    }
  }
}

function deletionWorkaroundHandler(e) {
  if (
    (e.key === "Backspace" || e.key === "Delete") &&
    textarea.selectionStart === 0 &&
    textarea.selectionEnd === textarea.value.length &&
    toolbar.style.opacity !== "0"
  ) {
    toolbar.style.opacity = "0"
  }
}

async function positionToolbar() {
  const curPos = await logseq.Editor.getEditingCursorPosition()
  if (curPos != null) {
    toolbar.style.top = `${curPos.top + curPos.rect.y - 35}px`
    if (
      curPos.left + curPos.rect.x + toolbar.clientWidth <=
      parent.window.innerWidth
    ) {
      toolbar.style.left = `${curPos.left + curPos.rect.x}px`
    } else {
      toolbar.style.left = `${-toolbar.clientWidth + parent.window.innerWidth
        }px`
    }
    toolbar.style.opacity = "1"
  }
}

function onToolbarTransitionEnd(e) {
  if (toolbar.style.opacity === "0") {
    toolbar.style.top = "0"
    toolbar.style.left = "-99999px"
  }
}

function onBlur(e) {
  // Update toolbar visibility upon activeElement change.
  if (document.activeElement !== textarea && toolbar?.style.opacity !== "0") {
    toolbar.style.opacity = "0"
  }
}

// There is a large gap between 2 displays of the toolbar, so a large
// ms number is acceptable.
const hideToolbar = throttle(() => {
  if (toolbar.style.opacity !== "0") {
    toolbar.style.opacity = "0"
  }
}, 1000)

const showToolbar = debounce(async () => {
  if (textarea != null && textarea.selectionStart !== textarea.selectionEnd) {
    await positionToolbar()
  }
}, 100)

function onScroll(e) {
  hideToolbar()
  showToolbar()
}

function toggleToolbarDisplay() {
  const appContainer = parent.document.getElementById("app-container")
  if (appContainer.classList.contains("kef-wrap-hidden")) {
    appContainer.classList.remove("kef-wrap-hidden")
  } else {
    appContainer.classList.add("kef-wrap-hidden")
  }
}

logseq.ready(main).catch(console.error)
