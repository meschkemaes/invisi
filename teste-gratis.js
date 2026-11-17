(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.InvisiTesteGratis = api;
  }
  if (typeof document !== "undefined") api.start();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const ACCESS_KEY = "158390c0-432f-4ec7-aab9-e640e631f481";
  const SUBMIT_URL = "https://api.web3forms.com/submit";
  const SEND_ERROR = "Não conseguimos enviar agora. Tente de novo em instantes.";
  const PHONE_ERROR =
    "Confira o WhatsApp e inclua o DDD. Ex.: (11) 99999-9999.";
  const PHONE_PATTERN = /^[1-9]{2}(?:[2-5]\d{7}|9\d{8})$/;

  const phoneDigits = (value) => {
    let digits = String(value == null ? "" : value).replace(/\D/g, "");
    if (
      digits.startsWith("55") &&
      (digits.length === 12 || digits.length === 13)
    ) {
      digits = digits.slice(2);
    }
    return digits;
  };

  const phoneValid = (digits) => PHONE_PATTERN.test(digits);

  const buildPayload = (fields) => {
    const input = fields || {};
    const name = String(input.name == null ? "" : input.name).trim();
    return {
      access_key: ACCESS_KEY,
      subject: "Invisi — teste grátis (" + name + ")",
      from_name: "Invisi teste-gratis",
      origem: "teste-gratis",
      name: name,
      phone: phoneDigits(input.phone),
      botcheck: input.botcheck == null ? "" : String(input.botcheck),
    };
  };

  const callPasso = (passo, step, erro) => {
    try {
      if (typeof passo === "function") {
        passo(step, erro);
        return;
      }
      const api = globalThis.InvisiFunil;
      if (api && typeof api.passo === "function") api.passo(step, erro);
    } catch (_) {
      /* a medição não pode interromper o envio */
    }
  };

  const trackLead = (fbqImpl) => {
    try {
      const fbq =
        typeof fbqImpl === "function"
          ? fbqImpl
          : typeof globalThis.fbq === "function"
            ? globalThis.fbq
            : null;
      if (typeof fbq === "function") fbq("track", "Lead");
    } catch (_) {
      /* o pixel não pode interromper a confirmação */
    }
  };

  const erroCode = (status) => {
    if (typeof status === "number" && status >= 100 && status <= 599) {
      return "http_" + status;
    }
    return "rede";
  };

  const submitTesteGratis = async (fields, options) => {
    const opts = options || {};
    const input = fields || {};
    callPasso(opts.passo, "cadastro_clique");
    const digits = phoneDigits(input.phone);
    if (!phoneValid(digits)) return { outcome: "invalid-phone" };

    const payload = buildPayload(input);
    const fetchImpl = opts.fetchImpl || globalThis.fetch;
    let response;
    try {
      response = await fetchImpl(SUBMIT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch (_) {
      callPasso(opts.passo, "envio_erro", "rede");
      return { outcome: "error", payload };
    }

    if (!response || response.ok !== true) {
      callPasso(opts.passo, "envio_erro", erroCode(response && response.status));
      return { outcome: "error", payload };
    }

    let body = null;
    if (typeof response.json === "function") {
      try {
        body = await response.json();
      } catch (_) {
        body = null;
      }
    }
    if (body && body.success === false) {
      callPasso(opts.passo, "envio_erro", erroCode(response.status));
      return { outcome: "error", payload };
    }

    callPasso(opts.passo, "envio_ok");
    trackLead(opts.fbq);
    return { outcome: "success", payload };
  };

  const start = () => {
    const form = document.getElementById("lead-form");
    const phone = document.getElementById("phone");
    const error = document.getElementById("form-error");
    const landing = document.getElementById("landing");
    const success = document.getElementById("success");
    const restart = document.getElementById("restart");
    if (!form || !phone || !error || !landing || !success || !restart) return;

    const button = form.querySelector("button[type='submit']");
    phone.addEventListener("input", () => {
      error.hidden = true;
      phone.removeAttribute("aria-invalid");
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const botcheck = form.querySelector('[name="botcheck"]');
      const nameField = form.elements && form.elements.name;
      if (button) button.disabled = true;
      let result;
      try {
        result = await submitTesteGratis({
          name: nameField ? nameField.value : "",
          phone: phone.value,
          botcheck: botcheck && botcheck.checked ? botcheck.value || "on" : "",
        });
      } catch (_) {
        result = { outcome: "error" };
      }
      if (!result || result.outcome !== "success") {
        if (button) button.disabled = false;
      }
      if (result && result.outcome === "invalid-phone") {
        error.textContent = PHONE_ERROR;
        error.hidden = false;
        phone.setAttribute("aria-invalid", "true");
        phone.focus();
        return;
      }
      if (!result || result.outcome !== "success") {
        error.textContent = SEND_ERROR;
        error.hidden = false;
        return;
      }
      if (result.outcome === "success") form.reset();
      landing.hidden = true;
      success.hidden = false;
      document.title = "Invisi — Pedido recebido";
      window.scrollTo(0, 0);
      success.focus({ preventScroll: true });
    });

    restart.addEventListener("click", () => {
      success.hidden = true;
      landing.hidden = false;
      document.title = "Invisi — Diagnóstico gratuito";
      if (button) button.disabled = false;
      window.scrollTo(0, 0);
      document.querySelector(".brand").focus({ preventScroll: true });
    });
  };

  return {
    ACCESS_KEY,
    SUBMIT_URL,
    SEND_ERROR,
    phoneDigits,
    phoneValid,
    buildPayload,
    submitTesteGratis,
    start,
  };
});
