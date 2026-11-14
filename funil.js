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
  const CAMPAIGN_KEY = "invisi.funil.campanha";
  const UTM_KEYS = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
  ];
  const TEMPO_MAX = 7200000;
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
    "saida",
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

  const clipUtm = (value) => {
    if (value == null) return "";
    return String(value).trim().slice(0, 100);
  };

  const dropClickKeys = (params) => {
    const drop = [];
    for (const key of params.keys()) {
      const name = String(key).toLowerCase();
      if (name === "fbclid" || name === "gclid") drop.push(key);
    }
    drop.forEach((key) => params.delete(key));
  };

  const referrerValue = (value) => {
    const text = String(value == null ? "" : value).trim();
    if (!text || !/fbclid|gclid/i.test(text)) return text;
    try {
      const url = new URL(text);
      dropClickKeys(url.searchParams);
      return url.toString();
    } catch (_) {
      return text
        .replace(/([?&#])fbclid=[^&#]*/gi, "$1")
        .replace(/([?&#])gclid=[^&#]*/gi, "$1")
        .replace(/[?&#](?=[?&#]|$)/g, "")
        .replace(/[?&]$/g, "");
    }
  };

  const attributionFrom = (search, referrer) => {
    let params;
    try {
      params = new URLSearchParams(typeof search === "string" ? search : "");
    } catch (_) {
      params = new URLSearchParams();
    }
    const out = {};
    UTM_KEYS.forEach((key) => {
      if (!params.has(key)) return;
      const clipped = clipUtm(params.get(key));
      if (clipped) out[key] = clipped;
    });
    if (params.has("fbclid")) out.fbclid = true;
    if (params.has("gclid")) out.gclid = true;
    const origin = referrerValue(referrer);
    if (origin) out.referrer = origin;
    return out;
  };

  const storedAttribution = (raw) => {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      return {};
    }
    if (!parsed || typeof parsed !== "object") return {};
    const out = {};
    UTM_KEYS.forEach((key) => {
      const clipped = clipUtm(parsed[key]);
      if (clipped) out[key] = clipped;
    });
    if (parsed.fbclid === true) out.fbclid = true;
    if (parsed.gclid === true) out.gclid = true;
    const origin = referrerValue(parsed.referrer);
    if (origin) out.referrer = origin;
    return out;
  };

  const storeOf = (options) => {
    if (options && options.storage) return options.storage;
    if (typeof sessionStorage !== "undefined") return sessionStorage;
    return null;
  };

  const loadAttribution = (storage) => {
    try {
      if (!storage) return {};
      const raw = storage.getItem(CAMPAIGN_KEY);
      if (!raw) return {};
      return storedAttribution(raw);
    } catch (_) {
      return {};
    }
  };

  const saveAttribution = (storage, data) => {
    try {
      if (!storage || !data || !Object.keys(data).length) return;
      storage.setItem(CAMPAIGN_KEY, JSON.stringify(data));
    } catch (_) {
      /* storage may be blocked */
    }
  };

  const pageSearch = (options) => {
    if (options && options.location && typeof options.location.search === "string") {
      return options.location.search;
    }
    if (options && options.location) return "";
    try {
      if (typeof location !== "undefined" && location && typeof location.search === "string") {
        return location.search;
      }
    } catch (_) {
      /* location may be blocked */
    }
    return "";
  };

  const pageReferrer = (options) => {
    if (options && typeof options.referrer === "string") return options.referrer;
    try {
      if (typeof document !== "undefined" && document && typeof document.referrer === "string") {
        return document.referrer;
      }
    } catch (_) {
      /* referrer may be blocked */
    }
    return "";
  };

  const campaignFor = (options) => {
    const storage = storeOf(options);
    const current = attributionFrom(pageSearch(options), pageReferrer(options));
    const merged = { ...current, ...loadAttribution(storage) };
    saveAttribution(storage, merged);
    return merged;
  };

  const clampTempo = (value) => {
    const rounded = Math.round(Number(value));
    if (!Number.isFinite(rounded) || rounded < 0) return 0;
    if (rounded > TEMPO_MAX) return TEMPO_MAX;
    return rounded;
  };

  const clampScroll = (value) => {
    const rounded = Math.round(Number(value));
    if (!Number.isFinite(rounded) || rounded < 0) return 0;
    if (rounded > 100) return 100;
    return rounded;
  };

  const scrollPctFrom = (metrics) => {
    const source = metrics || {};
    const top = Number(source.scrollTop);
    const view = Number(source.viewport);
    const height = Number(source.scrollHeight);
    if (!Number.isFinite(top) || !Number.isFinite(view) || !Number.isFinite(height)) {
      return null;
    }
    if (height <= 0) return null;
    return clampScroll(((Math.max(0, top) + Math.max(0, view)) / height) * 100);
  };

  const erroOk = (value) =>
    value === "sem_resultado" ||
    value === "falha" ||
    value === "http_409" ||
    value === "http_400_cnpj" ||
    value === "rede" ||
    /^http_[1-5]\d\d$/.test(value);

  const metaOf = (options) => {
    if (options && options.meta) return options.meta;
    try {
      if (typeof globalThis.InvisiMeta === "object" && globalThis.InvisiMeta) {
        return globalThis.InvisiMeta;
      }
    } catch (e) {}
    return null;
  };

  const notifyMeta = (step, erro, options) => {
    try {
      const meta = metaOf(options);
      if (!meta) return;
      const storage = options && options.storage;
      const fbq = options && options.fbq;
      if (
        step === "previa_resultado" &&
        (erro == null || erro === "sem_resultado") &&
        typeof meta.viewContent === "function"
      ) {
        meta.viewContent(storage, fbq);
      }
      if (step === "envio_ok" && typeof meta.leadFromEnvio === "function") {
        meta.leadFromEnvio(storage, fbq);
      }
    } catch (e) {}
  };

  const passo = (step, erro, deps) => {
    try {
      if (!STEPS.has(step)) return;
      const options = deps || {};
      notifyMeta(step, erro, options);
      const body = {
        visita: visitaId(options.storage, options.cryptoObj),
        passo: step,
      };
      if (step === "pagina") Object.assign(body, campaignFor(options));
      if (step === "saida") {
        const tempo =
          options.tempoMs != null
            ? options.tempoMs
            : typeof options.now === "function"
              ? options.now()
              : typeof performance !== "undefined" && performance.now
                ? performance.now()
                : 0;
        body.tempo_ms = clampTempo(tempo);
        if (options.scrollPct != null) body.scroll_pct = clampScroll(options.scrollPct);
      }
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

  const createExitTracker = (deps) => {
    const options = deps || {};
    let sentWhileHidden = false;
    let maxScroll = null;
    const send = () => {
      const tempoMs =
        typeof options.now === "function"
          ? options.now()
          : typeof performance !== "undefined" && performance.now
            ? performance.now()
            : 0;
      passo("saida", undefined, {
        storage: options.storage,
        navigator: options.navigator,
        fetchImpl: options.fetchImpl,
        cryptoObj: options.cryptoObj,
        tempoMs,
        scrollPct: maxScroll,
      });
    };
    return {
      onScroll(metrics) {
        const pct = scrollPctFrom(metrics);
        if (pct == null) return;
        maxScroll = maxScroll == null ? pct : Math.max(maxScroll, pct);
      },
      onVisibility(state) {
        if (state === "hidden") {
          if (sentWhileHidden) return;
          sentWhileHidden = true;
          send();
          return;
        }
        if (state === "visible") sentWhileHidden = false;
      },
      onPageHide() {
        if (sentWhileHidden) return;
        sentWhileHidden = true;
        send();
      },
    };
  };

  const wireExit = () => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const tracker = createExitTracker({});
    const sample = () => {
      try {
        const root = document.documentElement;
        tracker.onScroll({
          scrollTop: window.scrollY || (root && root.scrollTop) || 0,
          viewport: window.innerHeight || (root && root.clientHeight) || 0,
          scrollHeight: (root && root.scrollHeight) || 0,
        });
      } catch (_) {
        /* scroll metrics are optional */
      }
    };
    try {
      sample();
      window.addEventListener("scroll", sample, { passive: true });
      document.addEventListener("visibilitychange", () => {
        try {
          tracker.onVisibility(document.visibilityState);
        } catch (_) {
          /* measurement never blocks the page */
        }
      });
      window.addEventListener("pagehide", () => {
        try {
          tracker.onPageHide();
        } catch (_) {
          /* measurement never blocks the page */
        }
      });
    } catch (_) {
      /* measurement never blocks the page */
    }
  };

  const start = () => {
    try {
      passo("pagina");
      wireExit();
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
    CAMPAIGN_KEY,
    visitaId,
    passo,
    start,
    scrollPctFrom,
    createExitTracker,
  };
});
