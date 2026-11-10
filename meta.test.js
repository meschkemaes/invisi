const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const meta = require("./meta.js");
const funil = require("./funil.js");

const memoryStorage = (initial) => {
  const data = new Map(Object.entries(initial || {}));
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
  };
};

const spyFbq = () => {
  const calls = [];
  const fbq = (...args) => {
    calls.push(args);
  };
  return { calls, fbq };
};

const beaconOk = {
  sendBeacon() {
    return true;
  },
};

test("track no-ops when fbq is missing and swallows a throwing fbq", () => {
  assert.equal(meta.track("ViewContent"), false);
  assert.equal(meta.track("Lead", undefined), false);
  assert.equal(
    meta.track("Lead", () => {
      throw new Error("fbq blocked");
    }),
    false,
  );

  const source = meta.track.toString();
  const missing = vm.runInNewContext(`(${source})("Lead")`, { window: {} });
  assert.equal(missing, false);

  const thrown = vm.runInNewContext(`(${source})("ViewContent")`, {
    window: {
      fbq() {
        throw new Error("blocked");
      },
    },
  });
  assert.equal(thrown, false);

  const calls = [];
  const fired = vm.runInNewContext(`(${source})("Lead")`, {
    window: {
      fbq(...args) {
        calls.push(args);
      },
    },
  });
  assert.equal(fired, true);
  assert.deepEqual(calls, [["track", "Lead"]]);
});

test("fbq receives only the standard event name and no personal data", () => {
  const { calls, fbq } = spyFbq();
  const pii = {
    nome: "Maria Silva",
    email: "maria@empresa.com.br",
    cpf: "123.456.789-09",
    cnpj: "04.252.011/0001-10",
    telefone: "(11) 98888-7777",
    query: "Maria Silva",
  };

  assert.equal(meta.track("ViewContent", fbq), true);
  assert.equal(meta.track("Lead", fbq, pii), true);

  const storage = memoryStorage({
    "invisi.visita": pii.nome,
    email: pii.email,
  });
  meta.viewContent(storage, fbq);
  meta.leadFromEnvio(memoryStorage(), fbq);

  const viaWindow = [];
  vm.runInNewContext(`(${meta.track.toString()})("Lead", ${JSON.stringify(pii)})`, {
    window: {
      fbq(...args) {
        viaWindow.push(args);
      },
    },
  });

  const all = calls.concat(viaWindow);
  assert.deepEqual(all, [
    ["track", "ViewContent"],
    ["track", "Lead"],
    ["track", "ViewContent"],
    ["track", "Lead"],
    ["track", "Lead"],
  ]);
  const raw = JSON.stringify(all);
  assert.equal(raw.includes("Maria"), false);
  assert.equal(raw.includes("@"), false);
  assert.equal(raw.includes("98888"), false);
  assert.equal(raw.includes("04252011"), false);
  assert.equal(raw.includes("123456789"), false);
  for (const args of all) {
    assert.equal(args.length, 2);
    assert.equal(args[0], "track");
  }
});

test("Lead from envio_ok sets a session flag that obrigado consumes without a second Lead", () => {
  const storage = memoryStorage();
  const { calls, fbq } = spyFbq();

  assert.equal(meta.leadFromEnvio(storage, fbq), true);
  assert.equal(storage.getItem(meta.LEAD_KEY), "1");
  assert.equal(meta.leadOnThanks(storage, fbq), false);
  assert.equal(storage.getItem(meta.LEAD_KEY), null);
  assert.deepEqual(calls, [["track", "Lead"]]);
});

test("obrigado fires Lead when the dedupe flag is absent", () => {
  const storage = memoryStorage();
  const { calls, fbq } = spyFbq();

  assert.equal(meta.leadOnThanks(storage, fbq), true);
  assert.equal(storage.getItem(meta.LEAD_KEY), null);
  assert.deepEqual(calls, [["track", "Lead"]]);
});

test("Lead flag stays unset when fbq is missing so a later thanks page can still count", () => {
  const storage = memoryStorage();

  const { calls, fbq } = spyFbq();

  assert.equal(meta.leadFromEnvio(storage), false);
  assert.equal(storage.getItem(meta.LEAD_KEY), null);
  assert.equal(meta.leadOnThanks(storage, fbq), true);
  assert.deepEqual(calls, [["track", "Lead"]]);
});

test("ViewContent fires once per visit for a finished preview, including zero hits, and not on lookup failure", () => {
  const storage = memoryStorage();
  const { calls, fbq } = spyFbq();
  const deps = {
    storage,
    fbq,
    meta,
    navigator: beaconOk,
  };

  funil.passo("previa_resultado", "falha", deps);
  assert.deepEqual(calls, []);
  assert.equal(storage.getItem(meta.VIEW_KEY), null);

  funil.passo("previa_resultado", "sem_resultado", deps);
  funil.passo("previa_resultado", undefined, deps);
  funil.passo("previa_resultado", "sem_resultado", deps);

  assert.deepEqual(calls, [["track", "ViewContent"]]);
  assert.equal(storage.getItem(meta.VIEW_KEY), "1");
});

test("envio_ok tracks Lead before any other work and does not forward the passo payload", () => {
  const storage = memoryStorage();
  const { calls, fbq } = spyFbq();

  funil.passo(
    "envio_ok",
    "Maria Silva maria@empresa.com.br 123.456.789-09",
    {
      storage,
      fbq,
      meta,
      navigator: beaconOk,
    },
  );

  assert.equal(storage.getItem(meta.LEAD_KEY), "1");
  assert.deepEqual(calls, [["track", "Lead"]]);
  assert.equal(JSON.stringify(calls).includes("Maria"), false);
  assert.equal(JSON.stringify(calls).includes("@"), false);
});

test("a broken pixel helper never interrupts the funnel", () => {
  assert.doesNotThrow(() => {
    funil.passo("envio_ok", undefined, {
      storage: memoryStorage(),
      meta: {
        leadFromEnvio() {
          throw new Error("pixel down");
        },
      },
      navigator: beaconOk,
    });
    funil.passo("previa_resultado", "sem_resultado", {
      storage: memoryStorage(),
      meta: {
        viewContent() {
          throw new Error("pixel down");
        },
      },
      navigator: beaconOk,
    });
  });
});

test("landing and thanks page wire the helper and do not invent InitiateCheckout", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const thanks = fs.readFileSync(path.join(__dirname, "obrigado.html"), "utf8");
  const source = fs.readFileSync(path.join(__dirname, "meta.js"), "utf8");
  const funilSource = fs.readFileSync(path.join(__dirname, "funil.js"), "utf8");
  const pages = [
    "index.html",
    "pesquisa.html",
    "privacidade.html",
    "obrigado.html",
    "pesquisa-obrigado.html",
  ];

  assert.match(html, /meta\.js\?v=20261110-2/);
  assert.match(html, /funil\.js\?v=20261110-2/);
  assert.match(thanks, /meta\.js\?v=20261110-2/);
  assert.match(thanks, /leadOnThanks/);
  assert.doesNotMatch(thanks, /fbq\('track',\s*'Lead'\)/);
  assert.match(source, /typeof window\.fbq === "function"/);
  assert.match(source, /catch\s*\(\s*e\s*\)/);
  assert.match(funilSource, /viewContent/);
  assert.match(funilSource, /leadFromEnvio/);
  assert.match(funilSource, /sem_resultado/);
  assert.doesNotMatch(source, /fbq\(\s*"track"\s*,[^)]+,/);
  assert.doesNotMatch(source, /trackCustom|init\(/);

  const paymentHrefs = [];
  for (const page of pages) {
    const pageHtml = fs.readFileSync(path.join(__dirname, page), "utf8");
    assert.doesNotMatch(pageHtml, /Content-Security-Policy/i);
    const hrefs = pageHtml.match(/href\s*=\s*["'][^"']+["']/gi) || [];
    for (const href of hrefs) {
      if (/checkout|pagamento|contratar|\/pagar|stripe|pix/i.test(href)) {
        paymentHrefs.push(`${page} ${href}`);
      }
    }
  }
  assert.deepEqual(paymentHrefs, []);

  for (const page of pages) {
    const pageHtml = fs.readFileSync(path.join(__dirname, page), "utf8");
    const setAt = pageHtml.indexOf(
      "fbq('set', 'autoConfig', false, '1470624634449778')",
    );
    const initAt = pageHtml.indexOf("fbq('init', '1470624634449778')");
    assert.ok(setAt !== -1, page);
    assert.ok(initAt > setAt, page);
    assert.doesNotMatch(
      pageHtml,
      /fbq\(\s*'init'\s*,\s*'1470624634449778'\s*,/,
    );
  }
});
