(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.InvisiFunil = api;
  }
  if (typeof document !== "undefined") api.start();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const FUNIL_URL = "https://api.invisi.com.br/funil";
  const STORAGE_KEY = "invisi.visita";
  const PREVIA_KEY = "invisi.funil.previa_visivel";
  const UUID_V4 =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const STEPS = new Set([
    "pagina",
    "previa_visivel",
    "previa_pedida",
    "previa_resultado",
    "cadastro_clique",
    "envio_ok",
    "envio_erro",
  ]);
  let previaSent = false;

  const randomUuid = (cryptoObj) => {
    const cryptoRef =
      cryptoObj || (typeof crypto !== "undefined" ? crypto : null);
    if (cryptoRef && typeof cryptoRef.randomUUID === "function") {
      return cryptoRef.randomUUID();
    }
    const bytes = new Uint8Array(16);
    if (cryptoRef && typeof cryptoRef.getRandomValues === "function") {
      cryptoRef.getRandomValues(bytes);
    } else {
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = Math.floor(Math.random() * 256);
      }
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    return (
      hex.slice(0, 8) +
      "-" +
      hex.slice(8, 12) +
      "-" +
      hex.slice(12, 16) +
      "-" +
      hex.slice(16, 20) +
      "-" +
      hex.slice(20)
    );
  };

  const visitaId = (storage, cryptoObj) => {
    const store =
      storage ||
      (typeof sessionStorage !== "undefined" ? sessionStorage : null);
    try {
      const existing = store && store.getItem(STORAGE_KEY);
      if (typeof existing === "string" && UUID_V4.test(existing)) return existing;
    } catch (_) {
      /* storage may be blocked */
    }
    const id = randomUuid(cryptoObj);
    try {
      if (store) store.setItem(STORAGE_KEY, id);
    } catch (_) {
      /* storage may be blocked */
    }
    return id;
  };

  const erroOk = (value) =>
    value === "sem_resultado" ||
    value === "falha" ||
    value === "http_409" ||
    value === "http_400_cnpj" ||
    value === "rede" ||
    /^http_[1-5]\d\d$/.test(value);

  const passo = (step, erro, deps) => {
    try {
      if (!STEPS.has(step)) return;
      const options = deps || {};
      const body = {
        visita: visitaId(options.storage, options.cryptoObj),
        passo: step,
      };
      if (erroOk(erro)) body.erro = erro;
      const json = JSON.stringify(body);
      const url = FUNIL_URL;
      const nav =
        options.navigator ||
        (typeof navigator !== "undefined" ? navigator : null);
      let queued = false;
      try {
        if (nav && typeof nav.sendBeacon === "function") {
          queued =
            nav.sendBeacon(
              url,
              new Blob([json], { type: "text/plain" }),
            ) === true;
        }
      } catch (_) {
        queued = false;
      }
      if (queued) return;
      const fetchImpl =
        options.fetchImpl || (typeof fetch === "function" ? fetch : null);
      if (typeof fetchImpl !== "function") return;
      try {
        const pending = fetchImpl(url, {
          method: "POST",
          body: json,
          keepalive: true,
          headers: { "Content-Type": "text/plain" },
          mode: "no-cors",
        });
        if (pending && typeof pending.catch === "function") pending.catch(() => {});
      } catch (_) {
        /* keep the page moving */
      }
    } catch (_) {
      /* measurement never blocks the page */
    }
  };

  const previaAlready = () => {
    if (previaSent) return true;
    try {
      if (typeof sessionStorage !== "undefined") {
        return sessionStorage.getItem(PREVIA_KEY) === "1";
      }
    } catch (_) {
      /* storage may be blocked */
    }
    return false;
  };

  const markPrevia = () => {
    previaSent = true;
    try {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(PREVIA_KEY, "1");
      }
    } catch (_) {
      /* storage may be blocked */
    }
  };

  const start = () => {
    try {
      passo("pagina");
      if (typeof document === "undefined" || previaAlready()) return;
      const target =
        document.querySelector("[data-mirror-visual]") ||
        document.querySelector("#espelho");
      if (!target || typeof IntersectionObserver !== "function") return;
      const observer = new IntersectionObserver((entries) => {
        try {
          if (previaAlready()) {
            observer.disconnect();
            return;
          }
          if (!entries.some((entry) => entry.isIntersecting)) return;
          markPrevia();
          passo("previa_visivel");
          observer.disconnect();
        } catch (_) {
          /* ignore observer failures */
        }
      }, { threshold: 0 });
      observer.observe(target);
    } catch (_) {
      /* page load must not depend on measurement */
    }
  };

  return {
    FUNIL_URL,
    STORAGE_KEY,
    visitaId,
    passo,
    start,
  };
});
