function enableListFormNavigation() {
  document.addEventListener("click", event => {
    const button = event.target instanceof Element ? event.target.closest("button") : null;
    if (!button) return;
    const fields = {
      "Добавить рецепт": "title",
      "Add рецепт": "title",
      "Add Recipe": "title",
      "Добавить категорию": "name"
    };
    const field = fields[button.textContent.trim()];
    if (!field) return;
    const selector = `input[id^="${field}-field-"]`;

    // Decap appends new list items below existing recipes without scrolling.
    // Watch for the new title field rather than relying on generated CSS classes.
    const existing = new Set(document.querySelectorAll(selector));
    let timeout;
    let frame;
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const title = Array.from(document.querySelectorAll(selector))
          .find(input => !existing.has(input) && input.getClientRects().length);
        if (!title) return;
        observer.disconnect();
        clearTimeout(timeout);
        title.scrollIntoView({block: "center", behavior: "instant"});
        title.focus({preventScroll: true});
      });
    });
    observer.observe(document.body, {childList: true, subtree: true, attributes: true});
    timeout = setTimeout(() => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    }, 5000);
  }, true);
}

async function startAdmin() {
  const status = document.getElementById("admin-status");
  const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);

  try {
    if (!isLocal && location.protocol !== "https:") throw new Error("Для безопасного входа откройте сайт по HTTPS.");
    const response = await fetch("settings.json", {cache: "no-store"});
    if (!response.ok) throw new Error("Не удалось загрузить настройки админки.");
    const settings = await response.json();
    let useLocalBackend = false;
    if (isLocal) {
      try {
        const proxy = await fetch("http://127.0.0.1:8081/api/v1", {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({action: "info", params: {}}),
          signal: AbortSignal.timeout(2000)
        });
        if (!proxy.ok) throw new Error("Локальный редактор не отвечает.");
        useLocalBackend = true;
      } catch {
        // Without a local proxy the same online editor is available on localhost.
      }
    }
    if (!useLocalBackend && settings.oauth_url) {
      const oauth = new URL(settings.oauth_url);
      if (oauth.protocol !== "https:") throw new Error("Для OAuth требуется HTTPS.");
    }

    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://unpkg.com/decap-cms@3.16.3/dist/decap-cms.js";
      script.integrity = "sha384-A/Gdn928CNLufmnGWGs9RM4Q9o8bSNLeJERqBFrBjwzL7FRpoLT3MPF8Tl0+Wd2p";
      script.crossOrigin = "anonymous";
      script.onload = resolve;
      script.onerror = () => reject(new Error("Не удалось загрузить Decap CMS. Проверьте интернет и обновите страницу."));
      document.head.append(script);
    });
    // The remaining configuration is loaded from config.yml by Decap.
    let config = useLocalBackend ? {} : {
      local_backend: false,
      backend: {base_url: settings.oauth_url, auth_endpoint: "auth"}
    };
    if (!useLocalBackend && !settings.oauth_url) {
      registerTokenBackend();
      config = {local_backend: false, backend: {name: "github-token"}};
    }
    enableListFormNavigation();
    window.CMS.init({config});
    document.getElementById("admin-setup").hidden = true;
  } catch (error) {
    status.textContent = isLocal
      ? `${error.message}\nДля локального редактирования запустите в папке проекта: npm run cms. Затем обновите страницу.`
      : error.message;
  }
}

startAdmin();
