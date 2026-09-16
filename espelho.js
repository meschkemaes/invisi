(() => {
const SEARCH_URL = "https://empresas.credithub.com.br/api/buscar";
const OFFICE_LOOKUPS = [
  {
    url: (cnpj) => `https://open.cnpja.com/office/${cnpj}`,
    parse: (data) => ({
      phones: (data.phones || [])
        .filter((item) => item && item.number && item.type !== "FAX")
        .map((item) => ({ area: String(item.area || ""), number: String(item.number || "") })),
      emails: (data.emails || [])
        .map((item) => item && item.address)
        .filter(Boolean),
      address: data.address
        ? {
            street: data.address.street || "",
            number: data.address.number || "",
            district: data.address.district || "",
            city: data.address.city || "",
            state: data.address.state || "",
          }
        : null,
      company: data.company && data.company.name,
    }),
  },
  {
    url: (cnpj) => `https://api.opencnpj.org/${cnpj}`,
    parse: (data) => ({
      phones: (data.telefones || [])
        .filter((item) => item && item.numero && !item.is_fax)
        .map((item) => ({ area: String(item.ddd || ""), number: String(item.numero || "") })),
      emails: data.email ? [data.email] : [],
      address: {
        street: [data.tipo_logradouro, data.logradouro].filter(Boolean).join(" ").trim(),
        number: data.numero || "",
        district: data.bairro || "",
        city: data.municipio || "",
        state: data.uf || "",
      },
      company: data.razao_social,
    }),
  },
];

const IDLE_LEAD =
  "Digite o nome como no cadastro. A Invisi mostra o que já está público — incompleto. Você decide se quer tratar o que for cabível.";

const PARTICLES = new Set(["DA", "DE", "DO", "DAS", "DOS", "E", "DI", "DU"]);

const form = document.querySelector("[data-mirror-form]");
if (form) {
  const hero = document.querySelector(".hero");
  const card = document.querySelector("[data-mirror-card]");
  const nameInput = document.querySelector("#mirror-name");
  const errorBox = document.querySelector("[data-mirror-error]");
  const submitLabel = document.querySelector("[data-mirror-submit-label]");
  const label = document.querySelector("[data-mirror-label]");
  const who = document.querySelector("[data-mirror-who]");
  const status = document.querySelector("[data-mirror-status]");
  const pulse = document.querySelector("[data-mirror-pulse]");
  const progress = document.querySelector("[data-mirror-progress]");
  const results = document.querySelector("[data-mirror-results]");
  const live = document.querySelector("[data-mirror-live]");
  const insight = document.querySelector("[data-mirror-insight]");
  const conclusion = document.querySelector("[data-mirror-conclusion]");
  const verdict = document.querySelector("[data-mirror-verdict]");
  const lead = document.querySelector("[data-mirror-lead]");
  const cta = document.querySelector("[data-mirror-cta]");
  const cardCta = document.querySelector("[data-mirror-card-cta]");
  const resetButton = document.querySelector("[data-mirror-reset]");
  const leadName = document.querySelector("#nome");
  const leadNote = document.querySelector("#preocupacao");
  const previewField = document.querySelector("[data-preview-field]");
  const consultedName = document.querySelector("[data-consulted-name]");
  const openedPaths = document.querySelector("[data-opened-paths]");
  const contactTitle = document.querySelector("[data-contact-title]");
  const contactText = document.querySelector("[data-contact-text]");
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  let queriedName = "";
  let foundFields = [];

  const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

  const fold = (value) =>
    String(value || "")
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const tokens = (value) =>
    fold(value)
      .split(" ")
      .filter((part) => part && !PARTICLES.has(part));

  const titleCaseName = (value) =>
    value
      .split(/\s+/)
      .map((part) => {
        if (/^(d[aeo]s?|e)$/i.test(part)) return part.toLowerCase();
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      })
      .join(" ");

  const normalizeName = (value) => value.trim().replace(/\s+/g, " ");

  const validateName = (value) => {
    const name = normalizeName(value);
    if (!name) return "Digite o seu nome completo.";
    if (/\d/.test(name) || /@/.test(name) || /https?:/i.test(name)) {
      return "Use só o nome. Sem CPF, e-mail ou link.";
    }
    const parts = name.split(" ");
    if (parts.length < 2) {
      return "Escreva nome e sobrenome, como no cadastro.";
    }
    if (parts.length > 6 || name.length > 80) {
      return "Use o nome civil, sem texto extra.";
    }
    if (parts.some((part) => !/^[\p{L}'’-]+$/u.test(part) || part.length < 2)) {
      return "Confira a grafia do nome.";
    }
    return "";
  };

  const scoreSocio = (query, socioName) => {
    const asked = tokens(query);
    const found = tokens(socioName);
    if (asked.length < 2 || found.length < 2) return 0;
    if (asked[0] !== found[0]) return 0;
    let cursor = 0;
    for (const part of asked) {
      const at = found.indexOf(part, cursor);
      if (at === -1) return 0;
      cursor = at + 1;
    }
    const extra = found.length - asked.length;
    let score = 100 - extra * 5;
    if (found.slice(0, asked.length).join(" ") === asked.join(" ")) score += 20;
    return score;
  };

  const pickSocio = (query, socios) => {
    const ranked = (socios || [])
      .map((socio) => ({ socio, score: scoreSocio(query, socio.nome) }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score);
    if (!ranked.length) return { match: null, others: 0 };
    return { match: ranked[0].socio, others: ranked.length - 1 };
  };

  const cnpjFromRoot = (root) => {
    const base = `${String(root || "").replace(/\D/g, "").padStart(8, "0")}0001`;
    const digit = (value, weights) => {
      const sum = value
        .split("")
        .reduce((total, number, index) => total + Number(number) * weights[index], 0);
      const rest = sum % 11;
      return rest < 2 ? "0" : String(11 - rest);
    };
    const first = digit(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const second = digit(base + first, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    return base + first + second;
  };

  const isPlaceholderPhone = (area, number) => {
    const digits = `${area}${number}`.replace(/\D/g, "");
    return !digits || /^0+$/.test(digits) || digits.length < 10;
  };

  const maskPhone = (area, number) => {
    const local = String(number).replace(/\D/g, "");
    const ddd = String(area).replace(/\D/g, "");
    if (local.length === 9) {
      return `+55 (${ddd}) ${local.slice(0, 5)}-${local.slice(5, 6)}xxx`;
    }
    if (local.length === 8) {
      return `+55 (${ddd}) ${local.slice(0, 4)}-${local.slice(4, 5)}xxx`;
    }
    return `+55 (${ddd}) ${local.slice(0, Math.max(0, local.length - 3))}xxx`;
  };

  const maskEmail = (email) => {
    const [local = "", domain = ""] = String(email).toLowerCase().split("@");
    if (!local || !domain) return "";
    const [host, ...tldParts] = domain.split(".");
    const tld = tldParts.join(".") || "com";
    const keepLocal = local.slice(0, Math.min(3, Math.max(1, local.length - 2)));
    const keepHost = host.slice(0, Math.min(2, host.length));
    return `${keepLocal}${"*".repeat(Math.max(2, local.length - keepLocal.length))}@${keepHost}${"*".repeat(Math.max(2, Math.min(4, host.length - keepHost.length)))}.${tld}`;
  };

  const maskStreet = (street) => {
    const value = String(street || "").trim();
    if (!value) return "";
    if (value.length <= 4) return `${value.charAt(0)}***`;
    const keep = Math.max(4, Math.ceil(value.length * 0.55));
    return `${value.slice(0, keep)}***`;
  };

  const maskAddress = (address) => {
    if (!address || (!address.street && !address.city)) return "";
    const street = maskStreet(address.street);
    const city = titleCaseName((address.city || "").toLowerCase());
    const district = titleCaseName((address.district || "").toLowerCase());
    const state = String(address.state || "").toUpperCase();
    const place = [district, city && state ? `${city}/${state}` : city]
      .filter(Boolean)
      .join(", ");
    if (street && place) return `${street}, nº xxx — ${place}`;
    return street || place;
  };

  const maskCpf = (value) => {
    const core = String(value || "").replace(/\D/g, "");
    if (core.length === 6) return `***.${core.slice(0, 3)}.${core.slice(3)}-**`;
    return "";
  };

  const maskCnpj = (value) => {
    const digits = String(value || "").replace(/\D/g, "");
    if (digits.length !== 14) return "";
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-**`;
  };

  const fetchJson = async (url, timeoutMs = 9000) => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
      });
      if (!response.ok) {
        const error = new Error(`http-${response.status}`);
        error.status = response.status;
        throw error;
      }
      return response.json();
    } finally {
      window.clearTimeout(timer);
    }
  };

  const lookupName = async (name) => {
    const url = `${SEARCH_URL}?q=${encodeURIComponent(name)}&t=all&limit=8`;
    const payload = await fetchJson(url);
    if (!payload || payload.enabled === false) {
      throw new Error("search-disabled");
    }
    return pickSocio(name, payload.socios);
  };

  const lookupOffice = async (cnpj) => {
    let lastError = null;
    for (const source of OFFICE_LOOKUPS) {
      try {
        const data = await fetchJson(source.url(cnpj));
        return source.parse(data);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error("office-missing");
  };

  const buildReport = (name, socio, office, others) => {
    const phone = (office.phones || []).find(
      (item) => !isPlaceholderPhone(item.area, item.number),
    );
    const email = (office.emails || []).find((item) => item && item.includes("@"));
    const address = maskAddress(office.address);
    const document = maskCpf(socio.cpf_mask);
    const company = maskCnpj(cnpjFromRoot(socio.cnpj));
    const city = office.address
      ? [titleCaseName((office.address.city || "").toLowerCase()), office.address.state]
          .filter(Boolean)
          .join("/")
      : "";

    return {
      person: titleCaseName(socio.nome.toLowerCase()),
      others,
      rows: [
        {
          key: "nome",
          icon: "N",
          title: "Nome no cadastro público",
          value: titleCaseName(socio.nome.toLowerCase()),
          badge: "Público",
          tone: "public",
          found: true,
        },
        {
          key: "telefone",
          icon: "T",
          title: "Telefone associado",
          value: phone ? maskPhone(phone.area, phone.number) : "Não veio neste cadastro público",
          badge: phone ? "a venda" : "Não achado",
          tone: phone ? "alert" : undefined,
          found: Boolean(phone),
        },
        {
          key: "email",
          icon: "M",
          title: "E-mail no cadastro",
          value: email ? maskEmail(email) : "Não veio neste cadastro público",
          badge: email ? "a venda" : "Não achado",
          tone: email ? "alert" : undefined,
          found: Boolean(email),
        },
        {
          key: "endereco",
          icon: "E",
          title: "Endereço vinculado",
          value: address || "Não veio neste cadastro público",
          badge: address ? "a venda" : "Não achado",
          tone: address ? "alert" : undefined,
          found: Boolean(address),
        },
        {
          key: "documento",
          icon: "D",
          title: "Documento",
          value: document || "Não veio neste cadastro público",
          badge: document ? "a venda" : "Não achado",
          tone: document ? "alert" : undefined,
          found: Boolean(document),
        },
        {
          key: "vinculo",
          icon: "S",
          title: "Vínculo empresarial",
          value: company
            ? `CNPJ ${company}${city ? ` · ${city}` : ""}`
            : "Sócio em cadastro público",
          badge: "Público",
          tone: "public",
          found: true,
        },
      ],
    };
  };

  const setProgress = (ratio) => {
    if (!progress) return;
    progress.style.setProperty(
      "--mirror-progress",
      `${Math.round(ratio * 100)}%`,
    );
  };

  const showError = (message) => {
    if (!errorBox) return;
    errorBox.hidden = !message;
    errorBox.textContent = message;
    nameInput?.setAttribute("aria-invalid", String(Boolean(message)));
  };

  const firstName = (name) => name.split(" ")[0];

  const fillLeadForm = (name, report) => {
    if (leadName && !leadName.value.trim()) leadName.value = name;
    if (leadNote && !leadNote.value.trim()) {
      leadNote.value = report
        ? "Fiz a prévia de exposição no site e vi dados públicos incompletos. Quero a avaliação inicial e saber o que dá para tratar."
        : "Fiz a prévia de exposição no site. Quero a avaliação inicial e saber o que dá para tratar.";
    }
    if (previewField) previewField.value = "Sim";
    if (consultedName) consultedName.value = name;
    if (openedPaths) {
      openedPaths.value = foundFields.join(", ");
    }
    if (contactTitle) {
      contactTitle.textContent = report
        ? "Você já viu o pedaço público. Agora a Invisi trata o que for cabível."
        : "A prévia não achou esse nome. A avaliação inicial ainda pode ir atrás.";
    }
    if (contactText) {
      contactText.textContent =
        "A prévia consulta cadastros públicos de empresa a partir do seu nome e mostra só um recorte. Envie o contato para receber o diagnóstico, o escopo e o acompanhamento de 1 ano. O envio não gera cobrança.";
    }
  };

  const renderRows = (rows, mode) => {
    if (!results) return;
    results.replaceChildren();
    rows.forEach((row, index) => {
      const checking =
        mode === "scanning" && index === Number(card.dataset.activeIndex);
      const ready =
        mode === "report" ||
        (mode === "scanning" && index < Number(card.dataset.activeIndex || -1));
      const item = document.createElement("div");
      item.className = "result-item";
      if (checking) item.classList.add("is-checking");
      if (ready) item.classList.add("is-ready");
      if (ready && row.found) item.classList.add("is-found");
      if (ready && !row.found) item.classList.add("is-missing");
      item.innerHTML = `
        <span class="result-icon"></span>
        <div>
          <strong></strong>
          <small class="result-value"></small>
        </div>
        <b></b>
      `;
      item.querySelector(".result-icon").textContent = row.icon;
      item.querySelector("strong").textContent = row.title;
      item.querySelector("small").textContent = ready
        ? row.value
        : row.scanning || "Consultando cadastro público";
      const badge = item.querySelector("b");
      badge.textContent = ready
        ? row.badge
        : checking
          ? "Lendo"
          : "Na fila";
      if (ready && row.tone) badge.classList.add(`is-${row.tone}`);
      results.append(item);
    });
  };

  const scanningRows = () => [
    { icon: "N", title: "Nome no cadastro público", scanning: "Cruzando o nome no QSA" },
    { icon: "T", title: "Telefone associado", scanning: "Lendo telefone do cadastro" },
    { icon: "M", title: "E-mail no cadastro", scanning: "Lendo e-mail do cadastro" },
    { icon: "E", title: "Endereço vinculado", scanning: "Lendo endereço do cadastro" },
    { icon: "D", title: "Documento", scanning: "Lendo documento já público" },
    { icon: "S", title: "Vínculo empresarial", scanning: "Ligando o sócio à empresa" },
  ];

  const revealConclusion = (name, report, kind) => {
    if (verdict) {
      if (kind === "error") {
        verdict.textContent =
          `${firstName(name)}, a consulta pública não respondeu. Sem chute: a Invisi não inventa telefone, e-mail ou endereço.`;
      } else if (!report) {
        verdict.textContent =
          `${firstName(name)}, não achamos cadastro público compatível com esse nome. Se o dado existir em outro agregador, o diagnóstico completo vai atrás.`;
      } else if (foundFields.some((field) => field === "telefone" || field === "email" || field === "endereco")) {
        verdict.textContent =
          `${firstName(name)}, esse pedaço já está público no cadastro empresarial. A Invisi mostra incompleto. O diagnóstico trata o que for cabível e acompanha por 1 ano.`;
      } else {
        verdict.textContent =
          `${firstName(name)}, o nome aparece no cadastro público, mas telefone e e-mail não vieram nesta consulta. O diagnóstico completo olha as outras bases.`;
      }
    }
    if (insight) {
      insight.hidden = false;
      if (kind === "error") {
        insight.innerHTML =
          "<strong>A fonte pública falhou.</strong> Sem API no ar, a prévia para. Não voltamos ao teatro de números mascarados.";
      } else if (!report) {
        insight.innerHTML =
          "<strong>Nada para estampar.</strong> A busca pelo nome não achou sócio compatível. Homônimo frouxo não entra. A Invisi não completa a ficha.";
      } else {
        insight.innerHTML = report.others
          ? `<strong>Há outros cadastros públicos com esse nome.</strong> Mostramos o de melhor casamento: ${report.person}. Se não for você, corrija o nome.`
          : `<strong>Seus dados estão à venda.</strong> O que o cadastro empresarial solta, a internet já vende. A Invisi mostra o recorte.`;
      }
    }
    if (conclusion) conclusion.hidden = false;
    if (cardCta) cardCta.hidden = false;
    hero?.classList.add("is-mirror-report");
    fillLeadForm(name, report);
  };

  const runScan = async (name) => {
    queriedName = name;
    foundFields = [];
    form.dataset.busy = "true";
    nameInput.disabled = true;
    if (submitLabel) submitLabel.textContent = "Consultando...";
    showError("");
    hero?.classList.remove("is-mirror-report");
    hero?.classList.add("is-mirror-scanning");
    card?.classList.add("is-scanning");
    card?.classList.remove("is-report");
    pulse?.classList.add("is-live");
    pulse?.classList.remove("is-ready");
    if (label) label.textContent = "Prévia no seu nome";
    if (who) who.textContent = name;
    if (insight) {
      insight.hidden = true;
      insight.replaceChildren();
    }
    if (conclusion) conclusion.hidden = true;
    if (cardCta) cardCta.hidden = true;
    if (lead) lead.textContent = IDLE_LEAD;
    setProgress(0.08);

    const rows = scanningRows();
    const stepMs = reduceMotion ? 0 : 280;
    card.dataset.activeIndex = "0";
    if (status) status.textContent = "Cruzando o nome no cadastro público";
    if (live) live.textContent = "Consultando bases públicas de sócio e CNPJ…";
    renderRows(rows, "scanning");
    if (window.matchMedia("(max-width: 980px)").matches) {
      card?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    }

    let picked;
    try {
      picked = await lookupName(name);
    } catch (error) {
      card?.classList.remove("is-scanning");
      card?.classList.add("is-report");
      pulse?.classList.remove("is-live");
      if (status) status.textContent = "Consulta pública indisponível";
      if (live) live.textContent = "A fonte não respondeu. Nenhum número foi inventado.";
      if (label) label.textContent = "Prévia interrompida";
      renderRows(
        rows.map((row) => ({
          ...row,
          value: "Consulta pública indisponível",
          badge: "Falhou",
          found: false,
        })),
        "report",
      );
      setProgress(1);
      revealConclusion(name, null, "error");
      form.dataset.busy = "false";
      nameInput.disabled = false;
      if (submitLabel) submitLabel.textContent = "Tentar de novo";
      hero?.classList.remove("is-mirror-scanning");
      return;
    }

    card.dataset.activeIndex = "2";
    renderRows(rows, "scanning");
    setProgress(0.45);
    if (stepMs) await sleep(stepMs);

    if (!picked.match) {
      card?.classList.remove("is-scanning");
      card?.classList.add("is-report");
      pulse?.classList.remove("is-live");
      pulse?.classList.add("is-ready");
      setProgress(1);
      if (status) status.textContent = "Nada público compatível com esse nome";
      if (live) live.textContent = "A busca não achou sócio que case com o nome digitado.";
      if (label) label.textContent = "Relatório de exposição";
      if (who) who.textContent = name;
      renderRows(
        [
          {
            key: "nome",
            icon: "N",
            title: "Nome no cadastro público",
            value: "Nenhum sócio compatível com esse nome",
            badge: "Não achado",
            found: false,
          },
          {
            key: "telefone",
            icon: "T",
            title: "Telefone associado",
            value: "Sem cadastro, sem número",
            badge: "Não achado",
            found: false,
          },
          {
            key: "email",
            icon: "M",
            title: "E-mail no cadastro",
            value: "Sem cadastro, sem e-mail",
            badge: "Não achado",
            found: false,
          },
          {
            key: "endereco",
            icon: "E",
            title: "Endereço vinculado",
            value: "Sem cadastro, sem endereço",
            badge: "Não achado",
            found: false,
          },
        ],
        "report",
      );
      revealConclusion(name, null);
      form.dataset.busy = "false";
      nameInput.disabled = false;
      if (submitLabel) submitLabel.textContent = "Ver de novo";
      hero?.classList.remove("is-mirror-scanning");
      return;
    }

    const cnpj = cnpjFromRoot(picked.match.cnpj);
    if (status) status.textContent = "Lendo o cadastro da empresa ligada ao nome";
    if (live) live.textContent = "Buscando telefone, e-mail e endereço no comprovante público…";
    card.dataset.activeIndex = "4";
    renderRows(rows, "scanning");
    setProgress(0.72);

    let office = { phones: [], emails: [], address: null };
    try {
      office = await lookupOffice(cnpj);
    } catch (error) {
      office = { phones: [], emails: [], address: null };
    }

    const report = buildReport(name, picked.match, office, picked.others);
    foundFields = report.rows.filter((row) => row.found).map((row) => row.key);
    if (who) who.textContent = report.person;

    card.dataset.activeIndex = String(rows.length);
    card?.classList.remove("is-scanning");
    card?.classList.add("is-report");
    pulse?.classList.remove("is-live");
    pulse?.classList.add("is-ready");
    setProgress(1);
    if (status) status.textContent = "";
    if (live) {
      live.textContent =
        "O recorte público já circula à venda na internet.";
    }
    if (label) label.textContent = "Relatório de exposição";
    renderRows(report.rows, "report");
    revealConclusion(name, report);
    form.dataset.busy = "false";
    nameInput.disabled = false;
    if (submitLabel) submitLabel.textContent = "Ver de novo";
    hero?.classList.remove("is-mirror-scanning");
    if (window.matchMedia("(max-width: 980px)").matches) {
      (cardCta || card)?.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "nearest",
      });
    }
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (form.dataset.busy === "true") return;
    const name = titleCaseName(normalizeName(nameInput.value));
    const message = validateName(name);
    if (message) {
      showError(message);
      nameInput.focus();
      return;
    }
    nameInput.value = name;
    runScan(name);
  });

  const onCta = () => {
    if (queriedName) fillLeadForm(queriedName, foundFields.length > 0);
  };
  cta?.addEventListener("click", onCta);
  cardCta?.addEventListener("click", onCta);

  resetButton?.addEventListener("click", () => {
    hero?.classList.remove("is-mirror-report", "is-mirror-scanning");
    if (conclusion) conclusion.hidden = true;
    if (cardCta) cardCta.hidden = true;
    nameInput.disabled = false;
    nameInput.focus();
    if (submitLabel) submitLabel.textContent = "Ver minha exposição";
  });
}
})();
