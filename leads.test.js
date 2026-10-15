const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  SITE_LEAD_URL,
  SITE_LEAD_TIMEOUT_MS,
  THANKS_URL,
  buildSiteLead,
  deliverSiteLead,
  claimSubmit,
} = require("./leads.js");

const liveHtml = () =>
  fs
    .readFileSync(path.join(__dirname, "index.html"), "utf8")
    .replace(/<!--[\s\S]*?-->/g, "");

const fakeForm = (fields) => {
  const elements = {};
  for (const [name, spec] of Object.entries(fields)) {
    if (spec && typeof spec === "object" && "checked" in spec) {
      elements[name] = {
        type: "checkbox",
        name,
        value: spec.value ?? "Aceito",
        checked: spec.checked,
      };
    } else {
      elements[name] = { type: "text", name, value: spec ?? "" };
    }
  }
  return {
    elements: {
      namedItem(name) {
        return elements[name] || null;
      },
    },
  };
};

const consentedLead = (extra = {}) =>
  fakeForm({
    Nome: "Ana Souza",
    Email: "ana@empresa.com.br",
    WhatsApp: "(11) 98888-7777",
    Consentimento: { checked: true },
    hp: "",
    Perfil: "MEI",
    ...extra,
  });

test("maps the landing fields onto the site lead contract", () => {
  const payload = buildSiteLead(consentedLead());

  assert.deepEqual(payload, {
    nome: "Ana Souza",
    email: "ana@empresa.com.br",
    whatsapp: "(11) 98888-7777",
    consentimento: true,
    hp: "",
  });
});

test("omits empty email, whatsapp and cnpj", () => {
  const payload = buildSiteLead(
    fakeForm({
      Nome: "Ana Souza",
      Email: "   ",
      WhatsApp: "",
      CNPJ: "",
      Consentimento: { checked: true },
      hp: "",
    }),
  );

  assert.deepEqual(payload, {
    nome: "Ana Souza",
    consentimento: true,
    hp: "",
  });
  assert.equal("cnpj" in payload, false);
  assert.equal("email" in payload, false);
  assert.equal("whatsapp" in payload, false);
});

test("includes cnpj only when a CNPJ field has a value", () => {
  const payload = buildSiteLead(
    fakeForm({
      Nome: "Ana Souza",
      Email: "ana@empresa.com.br",
      CNPJ: "04.252.011/0001-10",
      Consentimento: { checked: true },
      hp: "",
    }),
  );

  assert.equal(payload.cnpj, "04.252.011/0001-10");
});

test("sends consentimento false when the checkbox is unchecked", () => {
  const payload = buildSiteLead(
    fakeForm({
      Nome: "Ana Souza",
      Email: "ana@empresa.com.br",
      Consentimento: { checked: false, value: "Aceito" },
      hp: "",
    }),
  );

  assert.equal(payload.consentimento, false);
});

test("keeps a filled honeypot instead of clearing it", () => {
  const payload = buildSiteLead(
    consentedLead({ hp: "company website" }),
  );

  assert.equal(payload.hp, "company website");
});

test("trims nome, email and whatsapp but does not trim hp", () => {
  const payload = buildSiteLead(
    fakeForm({
      Nome: "  Ana Souza  ",
      Email: " ana@empresa.com.br ",
      WhatsApp: " (11) 98888-7777 ",
      Consentimento: { checked: true },
      hp: "  ",
    }),
  );

  assert.equal(payload.nome, "Ana Souza");
  assert.equal(payload.email, "ana@empresa.com.br");
  assert.equal(payload.whatsapp, "(11) 98888-7777");
  assert.equal(payload.hp, "  ");
});

test("posts JSON to the site lead endpoint and resolves on 201", async () => {
  const payload = {
    nome: "Ana Souza",
    email: "ana@empresa.com.br",
    consentimento: true,
    hp: "",
  };
  let seen;

  const response = await deliverSiteLead(payload, {
    fetchImpl: async (url, init) => {
      seen = { url, init };
      return { ok: true, status: 201 };
    },
  });

  assert.equal(response.status, 201);
  assert.equal(seen.url, SITE_LEAD_URL);
  assert.equal(SITE_LEAD_URL, "https://api.invisi.com.br/leads/site");
  assert.equal(seen.init.method, "POST");
  assert.deepEqual(seen.init.headers, {
    "Content-Type": "application/json",
  });
  assert.deepEqual(JSON.parse(seen.init.body), payload);
  assert.equal(typeof seen.init.signal.aborted, "boolean");
});

test("treats any 2xx as success", async () => {
  const response = await deliverSiteLead(
    { nome: "Ana", consentimento: true, hp: "" },
    { fetchImpl: async () => ({ ok: true, status: 204 }) },
  );

  assert.equal(response.status, 204);
});

test("rejects a non-2xx response so the caller can fall back", async () => {
  await assert.rejects(
    () =>
      deliverSiteLead(
        { nome: "Ana", consentimento: true, hp: "" },
        { fetchImpl: async () => ({ ok: false, status: 429 }) },
      ),
    (error) => error.status === 429,
  );
});

test("rejects a network or CORS failure", async () => {
  await assert.rejects(() =>
    deliverSiteLead(
      { nome: "Ana", consentimento: true, hp: "" },
      {
        fetchImpl: async () => {
          throw new TypeError("Failed to fetch");
        },
      },
    ),
  );
});

test("rejects when the request exceeds the timeout", async () => {
  const fetchImpl = (_url, init) =>
    new Promise((_resolve, reject) => {
      const hold = setTimeout(() => {}, 1000);
      init.signal.addEventListener("abort", () => {
        clearTimeout(hold);
        const error = new Error("timeout");
        error.name = "TimeoutError";
        reject(error);
      });
    });

  await assert.rejects(
    () =>
      deliverSiteLead(
        { nome: "Ana", consentimento: true, hp: "" },
        { fetchImpl, timeoutMs: 20 },
      ),
    (error) => error.name === "TimeoutError",
  );
  assert.equal(SITE_LEAD_TIMEOUT_MS, 8000);
  assert.equal(THANKS_URL, "https://invisi.com.br/obrigado.html");
});

test("claimSubmit allows one in-flight send and blocks the next", () => {
  const form = fakeForm({});

  assert.equal(claimSubmit(form), true);
  assert.equal(claimSubmit(form), false);
});

test("live landing forms keep the Web3Forms action and an invisible hp field", () => {
  const html = liveHtml();
  const forms = html.match(/<form\b[\s\S]*?<\/form>/g) || [];
  const leadForms = forms.filter(
    (form) =>
      form.includes("data-lead-form") || form.includes("data-intent-form"),
  );

  assert.equal(leadForms.length, 2);
  for (const form of leadForms) {
    assert.match(form, /action="https:\/\/api\.web3forms\.com\/submit"/);
    assert.match(form, /name="access_key"/);
    assert.match(
      form,
      /name="redirect"\s+value="https:\/\/invisi\.com\.br\/obrigado\.html"/,
    );
    assert.match(form, /name="botcheck"/);
    assert.match(form, /name="hp"/);
    assert.match(form, /name="Consentimento"/);
  }

  const script = fs.readFileSync(path.join(__dirname, "script.js"), "utf8");
  assert.match(script, /deliverSiteLead/);
  assert.match(script, /preventDefault/);
  assert.match(script, /form\.submit\(\)/);
  assert.match(html, /leads\.js\?v=/);
  assert.match(html, /script\.js\?v=20261015-1/);

  const pesquisa = fs.readFileSync(
    path.join(__dirname, "pesquisa.html"),
    "utf8",
  );
  assert.equal(pesquisa.includes("api.invisi.com.br"), false);
});
