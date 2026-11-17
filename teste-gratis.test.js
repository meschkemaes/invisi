const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const funil = require("./funil.js");
const {
  ACCESS_KEY,
  SUBMIT_URL,
  SEND_ERROR,
  phoneDigits,
  phoneValid,
  buildPayload,
  submitTesteGratis,
} = require("./teste-gratis.js");

const memoryStorage = () => {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
  };
};

const capture = () => {
  const beacons = [];
  const fbqCalls = [];
  return {
    beacons,
    fbqCalls,
    storage: memoryStorage(),
    navigator: {
      sendBeacon(url, body) {
        beacons.push({ url, body });
        return true;
      },
    },
    fbq(...args) {
      fbqCalls.push(args);
    },
  };
};

const readBody = async (body) => {
  if (typeof body === "string") return body;
  if (body && typeof body.text === "function") return body.text();
  return String(body);
};

const submitWith = (fields, fetchImpl, sink) => {
  const transport = sink || capture();
  return submitTesteGratis(fields, {
    fetchImpl,
    fbq: transport.fbq,
    passo(step, erro) {
      funil.passo(step, erro, {
        storage: transport.storage,
        navigator: transport.navigator,
        fetchImpl: async () => ({ ok: true }),
        fbq: transport.fbq,
      });
    },
  }).then(async (result) => {
    const bodies = [];
    for (const beacon of transport.beacons) {
      bodies.push(JSON.parse(await readBody(beacon.body)));
    }
    return { result, transport, bodies };
  });
};

const ana = {
  name: "Ana Souza",
  phone: "(11) 99999-9999",
  botcheck: "",
};

test("normalizes a WhatsApp to digits and strips a leading 55 only at 12 or 13 digits", () => {
  assert.equal(phoneDigits("(11) 99999-9999"), "11999999999");
  assert.equal(phoneDigits("+55 (11) 99999-9999"), "11999999999");
  assert.equal(phoneDigits("55 11 3333-4444"), "1133334444");
  assert.equal(phoneDigits("55999998877"), "55999998877");
  assert.equal(phoneDigits("  11 98888-7777  "), "11988887777");
  assert.equal(phoneValid("11999999999"), true);
  assert.equal(phoneValid("1133334444"), true);
  assert.equal(phoneValid("1199999999"), false);
  assert.equal(phoneValid("00999999999"), false);
  assert.equal(phoneValid("1188887777"), false);
});

test("payload uses the landing access key, digits-only phone, and no funnel fields", () => {
  const payload = buildPayload({
    name: "  Ana Souza  ",
    phone: "+55 (11) 98888-7777",
    botcheck: "",
  });

  assert.equal(payload.access_key, ACCESS_KEY);
  assert.equal(ACCESS_KEY, "158390c0-432f-4ec7-aab9-e640e631f481");
  assert.equal(payload.subject, "Invisi — teste grátis (Ana Souza)");
  assert.equal(payload.from_name, "Invisi teste-gratis");
  assert.equal(payload.origem, "teste-gratis");
  assert.equal(payload.name, "Ana Souza");
  assert.equal(payload.phone, "11988887777");
  assert.equal(payload.botcheck, "");
  assert.equal(SUBMIT_URL, "https://api.web3forms.com/submit");
  assert.equal("email" in payload, false);
  assert.equal("visita" in payload, false);
});

test("a non-ok Web3Forms response is not success and keeps name and phone out of the funnel and pixel", async () => {
  const seen = [];
  const { result, transport, bodies } = await submitWith(ana, async (url, init) => {
    seen.push({ url, init });
    return { ok: false, status: 500, json: async () => ({ success: false }) };
  });

  assert.equal(result.outcome, "error");
  assert.equal(seen[0].url, SUBMIT_URL);
  assert.equal(seen[0].init.method, "POST");
  assert.equal(seen[0].init.headers["Content-Type"], "application/json");
  const posted = JSON.parse(seen[0].init.body);
  assert.equal(posted.phone, "11999999999");
  assert.equal(posted.name, "Ana Souza");
  assert.deepEqual(
    bodies.map((body) => body.passo),
    ["cadastro_clique", "envio_erro"],
  );
  assert.equal(bodies[1].erro, "http_500");
  assert.equal(transport.fbqCalls.length, 0);

  const raw = JSON.stringify(bodies);
  assert.equal(raw.includes("Ana"), false);
  assert.equal(raw.includes("99999"), false);
  assert.equal(raw.includes("11999999999"), false);
  assert.equal(raw.includes("name"), false);
  assert.equal(raw.includes("phone"), false);
  assert.equal(JSON.stringify(transport.fbqCalls).includes("Ana"), false);
});

test("a network failure is not success and does not track Lead", async () => {
  const { result, transport, bodies } = await submitWith(ana, async () => {
    throw new TypeError("Failed to fetch");
  });

  assert.equal(result.outcome, "error");
  assert.equal(SEND_ERROR, "Não conseguimos enviar agora. Tente de novo em instantes.");
  assert.deepEqual(
    bodies.map((body) => [body.passo, body.erro]),
    [
      ["cadastro_clique", undefined],
      ["envio_erro", "rede"],
    ],
  );
  assert.equal(transport.fbqCalls.length, 0);
  assert.equal(JSON.stringify(bodies).includes("Ana"), false);
});

test("an accepted response tracks Lead with no personal data and resets nothing itself", async () => {
  const { result, transport, bodies } = await submitWith(ana, async () => ({
    ok: true,
    status: 200,
    json: async () => ({ success: true, message: "ok" }),
  }));

  assert.equal(result.outcome, "success");
  assert.equal(result.payload.phone, "11999999999");
  assert.deepEqual(transport.fbqCalls, [["track", "Lead"]]);
  assert.equal(JSON.stringify(transport.fbqCalls).includes("Ana"), false);
  assert.equal(JSON.stringify(transport.fbqCalls).includes("99999"), false);
  assert.deepEqual(
    bodies.map((body) => body.passo),
    ["cadastro_clique", "envio_ok"],
  );
  assert.equal(JSON.stringify(bodies).includes("Ana"), false);
  assert.equal(JSON.stringify(bodies).includes("11999999999"), false);
});

test("an invalid phone never posts and never shows success", async () => {
  let calls = 0;
  const { result, transport, bodies } = await submitWith(
    { name: "Ana Souza", phone: "123", botcheck: "" },
    async () => {
      calls += 1;
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    },
  );

  assert.equal(result.outcome, "invalid-phone");
  assert.equal(calls, 0);
  assert.equal(transport.fbqCalls.length, 0);
  assert.deepEqual(
    bodies.map((body) => body.passo),
    ["cadastro_clique"],
  );
  assert.equal(JSON.stringify(bodies).includes("Ana"), false);
});

test("a filled honeypot is forwarded and success false is not a success screen", async () => {
  const honeypot = await submitWith(
    { name: "Ana Souza", phone: "11999999999", botcheck: "on" },
    async (_url, init) => {
      assert.equal(JSON.parse(init.body).botcheck, "on");
      return { ok: true, status: 200, json: async () => ({ success: false }) };
    },
  );

  assert.equal(honeypot.result.outcome, "error");
  assert.equal(honeypot.transport.fbqCalls.length, 0);
  assert.equal(honeypot.bodies.at(-1).passo, "envio_erro");
});

test("the page keeps the original form, drops the simulated thanks copy, and wires tracking", () => {
  const html = fs.readFileSync(path.join(__dirname, "teste-gratis.html"), "utf8");
  const source = fs.readFileSync(path.join(__dirname, "teste-gratis.js"), "utf8");
  const privacy = fs.readFileSync(path.join(__dirname, "privacidade.html"), "utf8");
  const sitemap = fs.readFileSync(path.join(__dirname, "sitemap.xml"), "utf8");
  const robots = fs.readFileSync(path.join(__dirname, "robots.txt"), "utf8");

  assert.match(html, /<form id="lead-form">/);
  assert.match(html, /name="name"/);
  assert.match(html, /name="phone"/);
  assert.match(html, /name="botcheck"/);
  assert.match(html, /style="display:\s*none"/);
  assert.match(html, /href="\.\/"/);
  assert.match(
    html,
    /<p class="free">Sem cartão\. Sem assinatura\.<\/p>\s*<p class="free">Ao enviar, você concorda com a <a href="privacidade\.html">Política de Privacidade<\/a>\.<\/p>/,
  );
  assert.match(html, /Recebemos seu pedido\. Nossa equipe vai entrar em contato pelo WhatsApp\./);
  assert.match(html, /id="restart">Voltar à página</);
  assert.doesNotMatch(html, /Prévia da tela de obrigado/);
  assert.doesNotMatch(html, /Este envio foi simulado/);
  assert.doesNotMatch(html, /Na versão final/);
  assert.doesNotMatch(html, /Prévia do pedido/);
  assert.match(html, /funil\.js\?v=20261114-2/);
  assert.match(html, /teste-gratis\.js/);
  assert.match(
    html,
    /fbq\('set', 'autoConfig', false, '1470624634449778'\)/,
  );
  assert.match(html, /fbq\('init', '1470624634449778'\)/);
  assert.match(html, /fbq\('track', 'PageView'\)/);
  assert.match(html, /G-NJHBCVJHD8/);
  assert.match(html, /addEventListener\("load", afterPaint\)/);
  assert.doesNotMatch(html, /fbq\(\s*'track'\s*,\s*'Lead'/);
  assert.match(source, /Invisi — Pedido recebido/);
  assert.match(source, /form\.reset\(\)/);
  assert.match(source, /button\.disabled = true/);
  assert.match(source, /SEND_ERROR/);
  assert.match(source, /cadastro_clique/);
  assert.match(source, /envio_ok/);
  assert.match(source, /envio_erro/);
  assert.doesNotMatch(source, /fbq\(\s*"track"\s*,\s*"Lead"\s*,/);

  const resetAt = source.indexOf("form.reset()");
  const successAt = source.indexOf('outcome === "success"');
  const errorAt = source.indexOf("SEND_ERROR");
  assert.ok(successAt !== -1 && resetAt > successAt);
  assert.ok(errorAt !== -1 && errorAt < resetAt);

  assert.match(privacy, /teste grátis/);
  assert.match(privacy, /WhatsApp/);
  assert.match(privacy, /Web3Forms/);
  assert.match(sitemap, /https:\/\/invisi\.com\.br\/teste-gratis</);
  assert.match(robots, /Allow:\s*\//);
  assert.doesNotMatch(robots, /Disallow:\s*\/teste-gratis/);
});
