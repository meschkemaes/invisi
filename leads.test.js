const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  SITE_LEAD_URL,
  SITE_LEAD_TIMEOUT_MS,
  THANKS_URL,
  PAINEL_URL,
  KNOWN_EMAIL_MENSAGEM,
  buildSiteLead,
  deliverSiteLead,
  claimSubmit,
  submitLeadForm,
} = require("./leads.js");

const DUPLICATE_BODY = {
  erro: "EMAIL_JA_CADASTRADO",
  code: "EMAIL_JA_CADASTRADO",
  mensagem:
    "Esse e-mail já tem cadastro. Entre no painel pra ver seu diagnóstico.",
  painel_url: "https://painel.invisi.com.br",
};

const domNode = (tag) => {
  const node = {
    tagName: String(tag).toUpperCase(),
    children: [],
    parentNode: null,
    attributes: {},
    className: "",
    textContent: "",
    tabIndex: 0,
    id: "",
    focused: false,
    setAttribute(name, value) {
      this.attributes[name] = String(value);
      if (name === "id") this.id = String(value);
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attributes, name)
        ? this.attributes[name]
        : null;
    },
    append(...kids) {
      for (const kid of kids) {
        kid.parentNode = this;
        this.children.push(kid);
      }
    },
    appendChild(kid) {
      this.append(kid);
      return kid;
    },
    insertAdjacentElement(position, inserted) {
      const parent = this.parentNode;
      const index = parent.children.indexOf(this);
      inserted.parentNode = parent;
      const at = position === "afterend" ? index + 1 : index;
      parent.children.splice(at, 0, inserted);
      return inserted;
    },
    querySelector(selector) {
      return findNode(this, selector);
    },
    focus() {
      this.focused = true;
    },
  };
  return node;
};

const nodeMatches = (node, selector) => {
  if (selector.startsWith(".")) {
    return node.className.split(/\s+/).includes(selector.slice(1));
  }
  if (selector.startsWith("[") && selector.endsWith("]")) {
    const name = selector.slice(1, -1).split("=")[0];
    return Object.prototype.hasOwnProperty.call(node.attributes, name);
  }
  return false;
};

const findNode = (node, selector) => {
  for (const child of node.children || []) {
    if (nodeMatches(child, selector)) return child;
    const nested = findNode(child, selector);
    if (nested) return nested;
  }
  return null;
};

const textOf = (node) =>
  `${node.textContent || ""}${(node.children || []).map(textOf).join("")}`;

const instrumentedForm = (fields) => {
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
  elements.Email.id = "email";
  elements.Email.attributes = {};
  elements.Email.setAttribute = function setAttribute(name, value) {
    this.attributes[name] = String(value);
  };
  elements.Email.getAttribute = function getAttribute(name) {
    return this.attributes[name] ?? null;
  };

  const form = domNode("form");
  form.action = "https://api.web3forms.com/submit";
  form.elements = {
    namedItem(name) {
      return elements[name] || null;
    },
  };
  form.ownerDocument = { createElement: domNode };
  form.nativeSubmits = 0;
  form.submit = () => {
    form.nativeSubmits += 1;
  };
  const status = domNode("p");
  status.className = "form-status";
  status.textContent = "";
  form.append(status);
  return form;
};

const runSubmit = (form, fetchImpl) => {
  const assigns = [];
  const calls = [];
  return submitLeadForm(form, {
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return fetchImpl(url, init);
    },
    assign: (url) => assigns.push(url),
  }).then((result) => ({ result, assigns, calls }));
};

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

test("409 EMAIL_JA_CADASTRADO shows the message and skips redirect and Web3Forms", async () => {
  const form = instrumentedForm({
    Nome: "Ana Souza",
    Email: "ana@empresa.com.br",
    WhatsApp: "(11) 98888-7777",
    Consentimento: { checked: true },
    hp: "",
  });

  const { result, assigns, calls } = await runSubmit(form, async () => ({
    ok: false,
    status: 409,
    json: async () => DUPLICATE_BODY,
  }));

  assert.equal(result.outcome, "duplicate");
  assert.deepEqual(assigns, []);
  assert.equal(form.nativeSubmits, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, SITE_LEAD_URL);
  assert.equal(calls[0].url.includes("web3forms"), false);

  const alert = form.querySelector("[data-lead-known]");
  assert.ok(alert);
  assert.equal(alert.getAttribute("role"), "alert");
  assert.equal(alert.getAttribute("aria-live"), "assertive");
  assert.equal(alert.getAttribute("tabindex"), "-1");
  assert.equal(alert.focused, true);
  assert.match(textOf(alert), /Esse e-mail já tem cadastro/);
  assert.match(textOf(alert), /Entre no painel pra ver seu diagnóstico/);
  assert.equal(
    alert.querySelector(".lead-known-link").getAttribute("href"),
    "https://painel.invisi.com.br",
  );
  assert.equal(
    form.elements.namedItem("Email").getAttribute("aria-invalid"),
    "true",
  );
  assert.equal(
    form.elements.namedItem("Email").getAttribute("aria-errormessage"),
    "email-ja-cadastrado",
  );
});

test("409 without mensagem uses the fallback copy and rejects an unsafe painel_url", async () => {
  const form = instrumentedForm({
    Nome: "Ana Souza",
    Email: "ana@empresa.com.br",
    Consentimento: { checked: true },
    hp: "",
  });

  const { result, assigns } = await runSubmit(form, async () => ({
    ok: false,
    status: 409,
    json: async () => ({
      code: "EMAIL_JA_CADASTRADO",
      painel_url: "https://painel.invisi.com.br.evil.com/login",
    }),
  }));

  assert.equal(result.outcome, "duplicate");
  assert.deepEqual(assigns, []);
  assert.equal(form.nativeSubmits, 0);
  const alert = form.querySelector("[data-lead-known]");
  assert.equal(alert.querySelector(".lead-known-title").textContent, "Esse e-mail já tem cadastro");
  assert.equal(
    alert.querySelector(".lead-known-text").textContent,
    "Entre no painel pra ver seu diagnóstico.",
  );
  assert.equal(KNOWN_EMAIL_MENSAGEM, DUPLICATE_BODY.mensagem);
  assert.equal(
    alert.querySelector(".lead-known-link").getAttribute("href"),
    PAINEL_URL,
  );
});

test("409 accepts the duplicate code nested in body.error.code", async () => {
  const form = instrumentedForm({
    Nome: "Ana Souza",
    Email: "ana@empresa.com.br",
    Consentimento: { checked: true },
    hp: "",
  });

  const { result, assigns } = await runSubmit(form, async () => ({
    ok: false,
    status: 409,
    json: async () => ({
      error: { code: "EMAIL_JA_CADASTRADO" },
      mensagem: DUPLICATE_BODY.mensagem,
      painel_url: "https://app.invisi.com.br/entrar",
    }),
  }));

  assert.equal(result.outcome, "duplicate");
  assert.deepEqual(assigns, []);
  assert.equal(form.nativeSubmits, 0);
  assert.equal(
    form.querySelector(".lead-known-link").getAttribute("href"),
    "https://app.invisi.com.br/entrar",
  );
});

test("409 with another code still falls back to Web3Forms", async () => {
  const form = instrumentedForm({
    Nome: "Ana Souza",
    Email: "ana@empresa.com.br",
    Consentimento: { checked: true },
    hp: "",
  });

  const { result, assigns } = await runSubmit(form, async () => ({
    ok: false,
    status: 409,
    json: async () => ({ code: "OUTRO_CONFLITO" }),
  }));

  assert.equal(result.outcome, "fallback");
  assert.deepEqual(assigns, []);
  assert.equal(form.nativeSubmits, 1);
  assert.equal(form.querySelector("[data-lead-known]"), null);
});

test("non-409 failure still falls back to Web3Forms and does not redirect", async () => {
  const form = instrumentedForm({
    Nome: "Ana Souza",
    Email: "ana@empresa.com.br",
    Consentimento: { checked: true },
    hp: "",
  });

  const { result, assigns, calls } = await runSubmit(form, async () => ({
    ok: false,
    status: 500,
  }));

  assert.equal(result.outcome, "fallback");
  assert.deepEqual(assigns, []);
  assert.equal(form.nativeSubmits, 1);
  assert.equal(form.querySelector("[data-lead-known]"), null);
  assert.deepEqual(
    calls.map((call) => call.url),
    [SITE_LEAD_URL],
  );
});

test("201 redirects to the thanks page and does not call Web3Forms", async () => {
  const form = instrumentedForm({
    Nome: "Ana Souza",
    Email: "ana@empresa.com.br",
    Consentimento: { checked: true },
    hp: "",
  });

  const { result, assigns } = await runSubmit(form, async () => ({
    ok: true,
    status: 201,
  }));

  assert.equal(result.outcome, "redirect");
  assert.deepEqual(assigns, [THANKS_URL]);
  assert.equal(form.nativeSubmits, 0);
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
  const leadsSource = fs.readFileSync(path.join(__dirname, "leads.js"), "utf8");
  assert.match(script, /submitLeadForm/);
  assert.match(script, /preventDefault/);
  assert.match(script, /outcome === "duplicate"/);
  assert.doesNotMatch(script, /form\.submit\(\)/);
  assert.match(leadsSource, /deliverSiteLead/);
  assert.match(leadsSource, /form\.submit\(\)/);
  assert.match(leadsSource, /EMAIL_JA_CADASTRADO/);
  assert.equal((html.match(/Quero meu diagnóstico grátis/g) || []).length, 4);
  assert.match(script, /data-open-modal/);
  assert.doesNotMatch(script, /avalia\[cç\]/);
  assert.match(html, /leads\.js\?v=20261015-3/);
  assert.match(html, /script\.js\?v=20261015-3/);
  assert.match(html, /styles\.css\?v=20261015-1/);
  assert.match(html, /espelho\.js\?v=20261015-4/);

  const pesquisa = fs.readFileSync(
    path.join(__dirname, "pesquisa.html"),
    "utf8",
  );
  assert.equal(pesquisa.includes("api.invisi.com.br"), false);
});
