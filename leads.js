(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.InvisiLeads = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const SITE_LEAD_URL = "https://api.invisi.com.br/leads/site";
  const SITE_LEAD_TIMEOUT_MS = 8000;
  const THANKS_URL = "https://invisi.com.br/obrigado.html";
  // Fallback when the API omits painel_url or sends a non-https host outside invisi.com.br.
  const PAINEL_URL = "https://painel.invisi.com.br";
  const KNOWN_EMAIL_CODE = "EMAIL_JA_CADASTRADO";
  const KNOWN_EMAIL_TITLE = "Esse e-mail já tem cadastro";
  const KNOWN_EMAIL_DETAIL = "Entre no painel pra ver seu diagnóstico.";
  const KNOWN_EMAIL_MENSAGEM = KNOWN_EMAIL_TITLE + ". " + KNOWN_EMAIL_DETAIL;
  const sending = new WeakSet();

  const claimSubmit = (form) => {
    if (!form || sending.has(form)) return false;
    sending.add(form);
    return true;
  };

  const releaseSubmit = (form) => {
    if (form) sending.delete(form);
  };

  const readControl = (form, name) => {
    if (form.elements && typeof form.elements.namedItem === "function") {
      const named = form.elements.namedItem(name);
      if (named) return named;
    }
    if (typeof form.querySelector === "function") {
      return form.querySelector('[name="' + name + '"]');
    }
    return null;
  };

  const readText = (form, name) => {
    const element = readControl(form, name);
    if (!element || element.type === "checkbox") return "";
    return String(element.value == null ? "" : element.value).trim();
  };

  const buildSiteLead = (form) => {
    const consent = readControl(form, "Consentimento");
    const honeypot = readControl(form, "hp");
    const payload = {
      nome: readText(form, "Nome"),
      consentimento: Boolean(consent && consent.checked),
      hp: honeypot ? String(honeypot.value == null ? "" : honeypot.value) : "",
    };
    const email = readText(form, "Email");
    const whatsapp = readText(form, "WhatsApp");
    const cnpj =
      readText(form, "CNPJ") || readText(form, "cnpj") || readText(form, "Cnpj");

    if (email) payload.email = email;
    if (whatsapp) payload.whatsapp = whatsapp;
    if (cnpj) payload.cnpj = cnpj;
    return payload;
  };

  const readJson = async (response) => {
    if (!response || typeof response.json !== "function") return null;
    try {
      const body = await response.json();
      if (!body || typeof body !== "object") return null;
      return body;
    } catch (_) {
      return null;
    }
  };

  const leadErrorCode = (body) => {
    if (!body || typeof body !== "object") return "";
    if (typeof body.code === "string" && body.code) return body.code;
    const nested = body.error;
    if (
      nested &&
      typeof nested === "object" &&
      typeof nested.code === "string" &&
      nested.code
    ) {
      return nested.code;
    }
    return "";
  };

  const isInvisiHttpsUrl = (value) => {
    if (typeof value !== "string") return false;
    const raw = value.trim();
    if (!raw || /[\u0000-\u0020\\]/.test(raw)) return false;
    let url;
    try {
      url = new URL(raw);
    } catch (_) {
      return false;
    }
    if (url.protocol !== "https:") return false;
    if (url.username || url.password) return false;
    const host = url.hostname;
    if (host !== "invisi.com.br" && !host.endsWith(".invisi.com.br")) {
      return false;
    }
    return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(
      host,
    );
  };

  const safePainelUrl = (value) =>
    isInvisiHttpsUrl(value) ? value.trim() : PAINEL_URL;

  const knownEmailCopy = (mensagem) => {
    const text =
      typeof mensagem === "string" && mensagem.trim()
        ? mensagem.trim()
        : KNOWN_EMAIL_MENSAGEM;
    if (text === KNOWN_EMAIL_TITLE || text.startsWith(KNOWN_EMAIL_TITLE)) {
      const rest = text
        .slice(KNOWN_EMAIL_TITLE.length)
        .replace(/^[\s.:;—–-]+/, "")
        .trim();
      return {
        title: KNOWN_EMAIL_TITLE,
        detail: rest || KNOWN_EMAIL_DETAIL,
      };
    }
    return { title: KNOWN_EMAIL_TITLE, detail: text };
  };

  const deliverSiteLead = async (payload, options) => {
    const opts = options || {};
    const fetchImpl = opts.fetchImpl || fetch;
    const timeoutMs =
      opts.timeoutMs == null ? SITE_LEAD_TIMEOUT_MS : opts.timeoutMs;
    const response = await fetchImpl(SITE_LEAD_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "omit",
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response || response.ok !== true) {
      const error = new Error("Lead API respondeu sem sucesso");
      error.status = response ? response.status : 0;
      if (error.status === 409) {
        const body = await readJson(response);
        if (leadErrorCode(body) === KNOWN_EMAIL_CODE) {
          const copy = knownEmailCopy(body && body.mensagem);
          error.code = KNOWN_EMAIL_CODE;
          error.mensagem =
            body && typeof body.mensagem === "string" && body.mensagem.trim()
              ? body.mensagem.trim()
              : KNOWN_EMAIL_MENSAGEM;
          error.title = copy.title;
          error.detail = copy.detail;
          error.painelUrl = safePainelUrl(body && body.painel_url);
        }
      }
      throw error;
    }

    return response;
  };

  const showKnownEmail = (form, notice) => {
    const doc =
      (form && form.ownerDocument) ||
      (typeof document !== "undefined" ? document : null);
    if (!doc || typeof doc.createElement !== "function") {
      throw new Error("sem documento para o aviso");
    }

    let alert = form.querySelector("[data-lead-known]");
    if (!alert) {
      alert = doc.createElement("div");
      alert.className = "lead-known";
      alert.setAttribute("data-lead-known", "");
      alert.setAttribute("role", "alert");
      alert.setAttribute("aria-live", "assertive");
      alert.tabIndex = -1;
      alert.setAttribute("tabindex", "-1");

      const title = doc.createElement("p");
      title.className = "lead-known-title";
      const detail = doc.createElement("p");
      detail.className = "lead-known-text";
      const link = doc.createElement("a");
      link.className = "button button-full lead-known-link";
      link.textContent = "Entrar no painel";
      alert.append(title, detail, link);

      const status = form.querySelector(".form-status");
      if (status && typeof status.insertAdjacentElement === "function") {
        status.insertAdjacentElement("afterend", alert);
      } else if (typeof form.append === "function") {
        form.append(alert);
      } else {
        form.appendChild(alert);
      }
    }

    const copy = knownEmailCopy(notice && notice.mensagem);
    alert.querySelector(".lead-known-title").textContent = copy.title;
    alert.querySelector(".lead-known-text").textContent = copy.detail;
    alert.querySelector(".lead-known-link").setAttribute(
      "href",
      safePainelUrl(notice && notice.painelUrl),
    );

    const email = readControl(form, "Email");
    if (email && typeof email.setAttribute === "function") {
      email.setAttribute("aria-invalid", "true");
      if (email.id) {
        alert.id = email.id + "-ja-cadastrado";
        email.setAttribute("aria-errormessage", alert.id);
      }
    }

    const status = form.querySelector(".form-status");
    if (status) status.textContent = "";
    if (typeof alert.focus === "function") alert.focus();
    return alert;
  };

  const submitLeadForm = async (form, options) => {
    const opts = options || {};
    const assign =
      typeof opts.assign === "function"
        ? opts.assign
        : (url) => {
            const loc = globalThis.location;
            if (loc && typeof loc.assign === "function") loc.assign(url);
          };

    try {
      await deliverSiteLead(buildSiteLead(form), opts);
    } catch (error) {
      if (error && error.code === KNOWN_EMAIL_CODE && error.status === 409) {
        releaseSubmit(form);
        try {
          showKnownEmail(form, error);
        } catch (_) {
          const status =
            form && typeof form.querySelector === "function"
              ? form.querySelector(".form-status")
              : null;
          if (status) status.textContent = error.mensagem || KNOWN_EMAIL_MENSAGEM;
        }
        return { outcome: "duplicate" };
      }
      if (form && typeof form.submit === "function") form.submit();
      return { outcome: "fallback" };
    }

    assign(THANKS_URL);
    return { outcome: "redirect" };
  };

  return {
    SITE_LEAD_URL,
    SITE_LEAD_TIMEOUT_MS,
    THANKS_URL,
    PAINEL_URL,
    KNOWN_EMAIL_MENSAGEM,
    claimSubmit,
    buildSiteLead,
    deliverSiteLead,
    submitLeadForm,
  };
});
