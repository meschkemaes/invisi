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
  const sending = new WeakSet();

  const claimSubmit = (form) => {
    if (!form || sending.has(form)) return false;
    sending.add(form);
    return true;
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
      throw error;
    }

    return response;
  };

  return {
    SITE_LEAD_URL,
    SITE_LEAD_TIMEOUT_MS,
    THANKS_URL,
    claimSubmit,
    buildSiteLead,
    deliverSiteLead,
  };
});
