const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { API_BASE, API_TIMEOUT_MS, lookupName, lookupOffice } = require("./espelho.js");

const SEARCH_URL = "https://empresas.credithub.com.br/api/buscar";
const SOCIO = {
  nome: "ANA SOUZA",
  cpf_mask: "123456",
  cnpj: "04252011",
};

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

test("lookupName uses the Invisi API when it returns socios", async () => {
  const calls = [];
  const picked = await lookupName("Ana Souza", {
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return jsonResponse(200, { socios: [SOCIO] });
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    `${API_BASE}/espelho/socios?q=${encodeURIComponent("Ana Souza")}`,
  );
  assert.equal(API_BASE, "https://api.invisi.com.br");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers, undefined);
  assert.equal(picked.match.nome, "ANA SOUZA");
  assert.equal(picked.match.cpf_mask, "123456");
  assert.equal(picked.others, 0);
});

test("lookupName falls back to CreditHub when the API returns 503", async () => {
  const calls = [];
  const picked = await lookupName("Ana Souza", {
    fetchImpl: async (url) => {
      calls.push(url);
      if (url.startsWith(`${API_BASE}/espelho/socios`)) {
        return jsonResponse(503, { error: "unavailable" });
      }
      return jsonResponse(200, { enabled: true, socios: [SOCIO] });
    },
  });

  assert.deepEqual(calls, [
    `${API_BASE}/espelho/socios?q=${encodeURIComponent("Ana Souza")}`,
    `${SEARCH_URL}?q=${encodeURIComponent("Ana Souza")}&t=all&limit=8`,
  ]);
  assert.equal(picked.match.cnpj, "04252011");
});

test("lookupName does not fall back when the API returns an empty socios list", async () => {
  const calls = [];
  const picked = await lookupName("Ana Souza", {
    fetchImpl: async (url) => {
      calls.push(url);
      return jsonResponse(200, { socios: [] });
    },
  });

  assert.deepEqual(calls, [
    `${API_BASE}/espelho/socios?q=${encodeURIComponent("Ana Souza")}`,
  ]);
  assert.equal(picked.match, null);
  assert.equal(picked.others, 0);
});

test("lookupName falls back when the API JSON is malformed", async () => {
  const calls = [];
  const picked = await lookupName("Ana Souza", {
    fetchImpl: async (url) => {
      calls.push(url);
      if (url.includes("/espelho/socios")) {
        return {
          ok: true,
          status: 200,
          json: async () => {
            throw new SyntaxError("Unexpected token");
          },
        };
      }
      return jsonResponse(200, { socios: [SOCIO] });
    },
  });

  assert.equal(calls.length, 2);
  assert.match(calls[1], /^https:\/\/empresas\.credithub\.com\.br\/api\/buscar\?/);
  assert.equal(picked.match.nome, "ANA SOUZA");
});

test("lookupName falls back on a network error and still rejects a disabled CreditHub", async () => {
  let step = 0;
  await assert.rejects(
    () =>
      lookupName("Ana Souza", {
        fetchImpl: async (url) => {
          step += 1;
          if (step === 1) {
            assert.match(url, /\/espelho\/socios\?/);
            throw new TypeError("Failed to fetch");
          }
          assert.match(url, /^https:\/\/empresas\.credithub\.com\.br\/api\/buscar\?/);
          return jsonResponse(200, { enabled: false, socios: [SOCIO] });
        },
      }),
    (error) => error.message === "search-disabled",
  );
  assert.equal(step, 2);
});

test("lookupName falls back when the API times out", async () => {
  const calls = [];
  const picked = await lookupName("Ana Souza", {
    timeoutMs: 20,
    fetchImpl: (url, init) => {
      calls.push(url);
      if (String(url).includes("/espelho/socios")) {
        return new Promise((_resolve, reject) => {
          const hold = setTimeout(() => {}, 1000);
          init.signal.addEventListener("abort", () => {
            clearTimeout(hold);
            const error = new Error("timeout");
            error.name = "AbortError";
            reject(error);
          });
        });
      }
      return jsonResponse(200, { socios: [SOCIO] });
    },
  });

  assert.equal(API_TIMEOUT_MS, 6000);
  assert.equal(calls.length, 2);
  assert.match(calls[1], /^https:\/\/empresas\.credithub\.com\.br\/api\/buscar\?/);
  assert.equal(picked.match.nome, "ANA SOUZA");
});

test("lookupOffice uses the API first and sanitizes the normalized payload", async () => {
  const calls = [];
  const office = await lookupOffice("04252011000110", {
    fetchImpl: async (url) => {
      calls.push(url);
      return jsonResponse(200, {
        phones: [{ area: 11, number: 988887777, type: "MOBILE" }],
        emails: ["ana@empresa.com.br", ""],
        address: {
          street: "Rua das Flores",
          number: 100,
          district: "Centro",
          city: "Sao Paulo",
          state: "SP",
          extra: "drop",
        },
        company: "Ana Souza LTDA",
      });
    },
  });

  assert.deepEqual(calls, [
    `${API_BASE}/espelho/office/04252011000110`,
  ]);
  assert.deepEqual(office, {
    phones: [{ area: "11", number: "988887777" }],
    emails: ["ana@empresa.com.br"],
    address: {
      street: "Rua das Flores",
      number: "100",
      district: "Centro",
      city: "Sao Paulo",
      state: "SP",
    },
    company: "Ana Souza LTDA",
  });
});

test("lookupOffice falls through the API, then cnpja, then opencnpj", async () => {
  const calls = [];
  const office = await lookupOffice("04252011000110", {
    fetchImpl: async (url) => {
      calls.push(url);
      if (url.startsWith(`${API_BASE}/espelho/office/`)) {
        return jsonResponse(503, { error: "unavailable" });
      }
      if (url.startsWith("https://open.cnpja.com/office/")) {
        return jsonResponse(502, { error: "bad gateway" });
      }
      if (url.startsWith("https://api.opencnpj.org/")) {
        return jsonResponse(200, {
          telefones: [{ ddd: "21", numero: "33334444", is_fax: false }],
          email: "contato@empresa.com.br",
          tipo_logradouro: "Avenida",
          logradouro: "Brasil",
          numero: "50",
          bairro: "Centro",
          municipio: "Rio de Janeiro",
          uf: "RJ",
          razao_social: "Souza Comercio LTDA",
        });
      }
      throw new Error(`unexpected ${url}`);
    },
  });

  assert.deepEqual(calls, [
    `${API_BASE}/espelho/office/04252011000110`,
    "https://open.cnpja.com/office/04252011000110",
    "https://api.opencnpj.org/04252011000110",
  ]);
  assert.equal(office.phones[0].area, "21");
  assert.equal(office.phones[0].number, "33334444");
  assert.deepEqual(office.emails, ["contato@empresa.com.br"]);
  assert.equal(office.address.city, "Rio de Janeiro");
  assert.equal(office.company, "Souza Comercio LTDA");
});

test("the page keeps a friendly retry when every name source fails", () => {
  const source = fs.readFileSync(path.join(__dirname, "espelho.js"), "utf8");
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");

  assert.match(source, /Tentar de novo/);
  assert.match(
    source,
    /a consulta pública não respondeu\. Sem chute: a Invisi não inventa telefone, e-mail ou endereço\./,
  );
  assert.match(html, /espelho\.js\?v=20261015-4/);
  assert.doesNotMatch(source, /Authorization/);
  assert.doesNotMatch(source, /Bearer /);
});
