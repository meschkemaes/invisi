const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const funil = require("./funil.js");
const { submitLeadForm } = require("./leads.js");

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const memoryStorage = (initial) => {
  const data = new Map(Object.entries(initial || {}));
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
  };
};

const captureTransport = () => {
  const beacons = [];
  const fetches = [];
  return {
    beacons,
    fetches,
    navigator: {
      sendBeacon(url, body) {
        beacons.push({ url, body });
        return true;
      },
    },
    fetchImpl(url, init) {
      fetches.push({ url, init });
      return Promise.resolve({ ok: true, status: 204 });
    },
  };
};

const readBody = async (body) => {
  if (typeof body === "string") return body;
  if (body && typeof body.text === "function") return body.text();
  return String(body);
};

test("visita uuid is created once and reused from sessionStorage", () => {
  const storage = memoryStorage();
  const first = funil.visitaId(storage);
  const second = funil.visitaId(storage);

  assert.match(first, UUID_V4);
  assert.equal(second, first);
  assert.equal(storage.getItem(funil.STORAGE_KEY), first);
});

test("visita uuid falls back when randomUUID is missing and still persists", () => {
  const storage = memoryStorage();
  const cryptoObj = {
    getRandomValues(bytes) {
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = (index * 17 + 3) % 256;
      }
      return bytes;
    },
  };

  const id = funil.visitaId(storage, cryptoObj);

  assert.match(id, UUID_V4);
  assert.equal(funil.visitaId(storage, cryptoObj), id);
  assert.equal(typeof cryptoObj.randomUUID, "undefined");
});

test("funnel payload is only visita, passo and an allowlisted erro", async () => {
  const storage = memoryStorage();
  const transport = captureTransport();
  const pii =
    "Maria Silva 123.456.789-09 04.252.011/0001-10 maria@empresa.com.br (11) 98888-7777";

  funil.passo("previa_pedida", pii, {
    storage,
    navigator: transport.navigator,
    fetchImpl: transport.fetchImpl,
  });
  funil.passo("previa_resultado", "sem_resultado", {
    storage,
    navigator: transport.navigator,
    fetchImpl: transport.fetchImpl,
  });
  funil.passo(pii, "falha", {
    storage,
    navigator: transport.navigator,
    fetchImpl: transport.fetchImpl,
  });

  assert.equal(transport.fetches.length, 0);
  assert.equal(transport.beacons.length, 2);

  const first = JSON.parse(await readBody(transport.beacons[0].body));
  const second = JSON.parse(await readBody(transport.beacons[1].body));

  assert.deepEqual(Object.keys(first).sort(), ["passo", "visita"]);
  assert.equal(first.passo, "previa_pedida");
  assert.equal(first.visita, storage.getItem(funil.STORAGE_KEY));
  assert.equal("erro" in first, false);

  assert.deepEqual(second, {
    visita: first.visita,
    passo: "previa_resultado",
    erro: "sem_resultado",
  });

  const raw = JSON.stringify([first, second]);
  assert.equal(raw.includes("Maria"), false);
  assert.equal(raw.includes("@"), false);
  assert.equal(raw.includes("04252011"), false);
  assert.equal(raw.includes("98888"), false);
  assert.equal(raw.includes("nome"), false);
  assert.equal(raw.includes("cnpj"), false);
  assert.equal(raw.includes("email"), false);
  assert.equal(raw.includes("telefone"), false);
  assert.equal(transport.beacons[0].body.type, "text/plain");
  assert.equal(transport.beacons[0].url, "https://api.invisi.com.br/funil");
});

test("beacon failure falls back to fetch and never throws", () => {
  const storage = memoryStorage({ [funil.STORAGE_KEY]: "11111111-1111-4111-8111-111111111111" });
  const transport = captureTransport();
  transport.navigator.sendBeacon = () => false;

  assert.doesNotThrow(() => {
    funil.passo("pagina", undefined, {
      storage,
      navigator: transport.navigator,
      fetchImpl: transport.fetchImpl,
    });
  });

  assert.equal(transport.fetches.length, 1);
  assert.equal(transport.fetches[0].url, funil.FUNIL_URL);
  assert.equal(transport.fetches[0].init.method, "POST");
  assert.equal(transport.fetches[0].init.keepalive, true);
  assert.equal(transport.fetches[0].init.mode, "no-cors");
  assert.deepEqual(transport.fetches[0].init.headers, {
    "Content-Type": "text/plain",
  });
  assert.deepEqual(JSON.parse(transport.fetches[0].init.body), {
    visita: "11111111-1111-4111-8111-111111111111",
    passo: "pagina",
  });
});

test("storage, beacon and fetch failures stay silent", () => {
  const brokenStorage = {
    getItem() {
      throw new Error("storage down");
    },
    setItem() {
      throw new Error("storage down");
    },
  };

  assert.doesNotThrow(() => {
    funil.passo("envio_erro", "rede", {
      storage: brokenStorage,
      navigator: {
        sendBeacon() {
          throw new Error("beacon down");
        },
      },
      fetchImpl() {
        throw new Error("network down");
      },
    });
  });

  assert.doesNotThrow(() => {
    funil.passo("cadastro_clique", "rede", {
      storage: memoryStorage(),
      navigator: {
        sendBeacon() {
          return false;
        },
      },
      fetchImpl() {
        return Promise.reject(new TypeError("Failed to fetch"));
      },
    });
  });
});

const bareForm = () => ({
  elements: { namedItem() { return null; } },
  querySelector() { return null; },
  nativeSubmits: 0,
  submit() {
    this.nativeSubmits += 1;
  },
});

test("lead API failures record envio_erro and still do not throw", async () => {
  const seen = [];
  globalThis.InvisiFunil = {
    passo(step, erro) {
      seen.push([step, erro]);
      throw new Error("beacon exploded");
    },
  };

  try {
    const failed = await submitLeadForm(bareForm(), {
      fetchImpl: async () => {
        throw new TypeError("Failed to fetch");
      },
      assign() {
        throw new Error("should not redirect");
      },
    });
    const invalid = await submitLeadForm(bareForm(), {
      fetchImpl: async () => ({
        ok: false,
        status: 400,
        json: async () => ({ code: "CNPJ_INVALIDO", campo: "cnpj" }),
      }),
      assign() {},
    });
    const duplicate = await submitLeadForm(bareForm(), {
      fetchImpl: async () => ({
        ok: false,
        status: 409,
        json: async () => ({ code: "EMAIL_JA_CADASTRADO" }),
      }),
      assign() {},
    });
    const accepted = await submitLeadForm(bareForm(), {
      fetchImpl: async () => ({ ok: true, status: 201 }),
      assign() {},
    });

    assert.equal(failed.outcome, "fallback");
    assert.equal(failed && seen[0][0], "envio_erro");
    assert.equal(seen[0][1], "rede");
    assert.equal(invalid.outcome, "invalid-cnpj");
    assert.deepEqual(seen[1], ["envio_erro", "http_400_cnpj"]);
    assert.equal(duplicate.outcome, "duplicate");
    assert.deepEqual(seen[2], ["envio_erro", "http_409"]);
    assert.equal(accepted.outcome, "redirect");
    assert.deepEqual(seen[3], ["envio_ok", undefined]);
  } finally {
    delete globalThis.InvisiFunil;
  }
});

test("previa visivel watches the lookup before the illustration", () => {
  const formFirst = {
    querySelector(sel) {
      if (sel === "[data-mirror-form]") return { id: "espelho" };
      return { id: "visual" };
    },
  };
  assert.equal(funil.previaTarget(formFirst).id, "espelho");

  const visualOnly = {
    querySelector(sel) {
      return sel === "[data-mirror-visual]" ? { id: "visual" } : null;
    },
  };
  assert.equal(funil.previaTarget(visualOnly).id, "visual");
  assert.equal(funil.previaTarget(null), null);
});

test("landing wires the anonymous funnel without putting personal data in the call", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const source = fs.readFileSync(path.join(__dirname, "funil.js"), "utf8");
  const espelho = fs.readFileSync(path.join(__dirname, "espelho.js"), "utf8");
  const leads = fs.readFileSync(path.join(__dirname, "leads.js"), "utf8");
  const script = fs.readFileSync(path.join(__dirname, "script.js"), "utf8");

  assert.match(html, /funil\.js\?v=20261114-1/);
  assert.match(source, /data-mirror-form/);
  assert.match(source, /sendBeacon/);
  assert.match(source, /text\/plain/);
  assert.match(source, /keepalive:\s*true/);
  assert.match(source, /mode:\s*"no-cors"/);
  assert.match(source, /sessionStorage/);
  assert.match(espelho, /previa_pedida/);
  assert.match(espelho, /previa_resultado/);
  assert.match(espelho, /sem_resultado/);
  assert.match(espelho, /falha/);
  assert.match(leads, /envio_ok/);
  assert.match(leads, /envio_erro/);
  assert.match(leads, /http_400_cnpj/);
  assert.match(leads, /http_409/);
  assert.match(script, /cadastro_clique/);
  const withoutErroCode = source.replace(/http_400_cnpj/g, "");
  assert.doesNotMatch(withoutErroCode, /nome|cnpj|e-mail|email|telefone|whatsapp/i);
});
