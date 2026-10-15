/* Reuse Decap's GitHub backend; replace only its OAuth login screen. */
function registerTokenBackend() {
  const github = window.CMS.getBackend("github");
  const h = window.h;
  const TokenLogin = window.createClass({
    getInitialState() {return {busy: false, error: ""};},
    componentDidMount() {
      this.onAuthError = () => this.setState({busy: false, error: "GitHub отклонил вход. Проверьте права и срок действия токена и попробуйте ещё раз."});
      document.addEventListener("receptes-auth-error", this.onAuthError);
    },
    componentWillUnmount() {document.removeEventListener("receptes-auth-error", this.onAuthError);},
    async handleSubmit(event) {
      event.preventDefault();
      const token = this.tokenInput.value.trim();
      this.tokenInput.value = "";
      if (!token) return;
      if (!token.startsWith("github_pat_")) {
        this.setState({error: "Нужен fine-grained токен GitHub (начинается с github_pat_)."});
        return;
      }
      this.setState({busy: true, error: ""});
      try {
        const response = await fetch("https://api.github.com/repos/DeadRaaat/cookbook", {
          headers: {Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json"},
          credentials: "omit",
          cache: "no-store"
        });
        if (!response.ok) throw new Error("Токен недействителен или не имеет доступа к DeadRaaat/cookbook.");
        const repo = await response.json();
        if (!repo.permissions?.push) throw new Error("У владельца токена нет права записи в cookbook.");
        await this.props.onLogin({token});
      } catch {
        this.setState({busy: false, error: "Не удалось войти. Проверьте срок токена, доступ к cookbook и разрешение Contents: Read and write. При необходимости создайте новый токен."});
      }
    },
    render() {
      return h("section", {className: "token-login"},
        h("a", {href: "../"}, "← Вернуться на сайт"),
        h("h1", null, "Receptes · Мои рецепты"),
        h("p", null, "Вход для владельца сайта. Рецепты и фотографии сохраняются прямо в GitHub."),
        h("form", {onSubmit: this.handleSubmit},
          h("label", {htmlFor: "github-token"}, "Токен GitHub"),
          h("input", {id: "github-token", type: "password", required: true, autoComplete: "off", spellCheck: false,
            placeholder: "github_pat_…", ref: input => {this.tokenInput = input;}, disabled: this.state.busy}),
          h("small", null, "Токен остаётся только в памяти этой вкладки. После обновления страницы потребуется войти снова. Не вводите его на чужих сайтах."),
          h("button", {type: "submit", disabled: this.state.busy || this.props.inProgress}, this.state.busy ? "Входим…" : "Войти"),
          h("p", {role: "alert"}, this.state.error)
        ),
        h("details", null,
          h("summary", null, "Как получить токен?"),
          h("ol", null,
            h("li", null, h("a", {href: "https://github.com/settings/personal-access-tokens/new", target: "_blank", rel: "noopener noreferrer"}, "Создайте fine-grained токен в GitHub"), "."),
            h("li", null, "В Resource owner выберите DeadRaaat, затем Only select repositories → cookbook."),
            h("li", null, "В Repository permissions задайте Contents: Read and write. Остальные права не нужны (Metadata: Read-only добавляется автоматически)."),
            h("li", null, "Установите срок действия, скопируйте токен и храните его в менеджере паролей. Не присылайте его в чат.")
          )
        )
      );
    }
  });

  class TokenBackend {
    constructor(...args) {
      const backend = github.init(...args);
      const authenticate = backend.authenticate.bind(backend);
      backend.authComponent = () => TokenLogin;
      backend.authenticate = async credentials => {
        // Decap normally persists its user object, including the token.
        // Keep the API token inside the backend instance, not in that object.
        try {
          backend._currentUserPromise = undefined;
          const user = await authenticate(credentials);
          const {token, ...profile} = user;
          return profile;
        } catch (error) {
          document.dispatchEvent(new Event("receptes-auth-error"));
          throw error;
        }
      };
      return backend;
    }
  }
  // Clear only this backend's non-secret previous-login metadata on reload.
  const stored = localStorage.getItem("decap-cms-user");
  if (stored) {
    try {
      if (JSON.parse(stored).backendName === "github-token") localStorage.removeItem("decap-cms-user");
    } catch {localStorage.removeItem("decap-cms-user");}
  }
  window.CMS.registerBackend("github-token", TokenBackend);
}
