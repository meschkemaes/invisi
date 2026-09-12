(() => {
const PATHS = [
  {
    key: "buscadores",
    icon: "N",
    title: "Buscadores",
    scanning: "Cruzando o nome nos buscadores",
    hint: "Onde o nome vira porta de entrada",
    query: (name) => `"${name}"`,
  },
  {
    key: "telefone",
    icon: "T",
    title: "Telefone associado",
    scanning: "Procurando caminho até o telefone",
    hint: "Nome + telefone, o atalho mais comum",
    query: (name) => `"${name}" telefone`,
  },
  {
    key: "endereco",
    icon: "E",
    title: "Endereço vinculado",
    scanning: "Procurando endereço colado ao nome",
    hint: "O residencial que vaza com o CNPJ",
    query: (name) => `"${name}" endereço`,
  },
  {
    key: "vinculo",
    icon: "S",
    title: "Vínculo empresarial",
    scanning: "Cruzando sócio, MEI e empresa",
    hint: "A pessoa colada no negócio",
    query: (name) => `"${name}" (sócio OR MEI OR empresário)`,
  },
  {
    key: "consultas",
    icon: "B",
    title: "Bases de consulta",
    scanning: "Varrendo bases que republicam cadastro",
    hint: "Onde agregadores repetem o que era cadastro",
    query: (name) => `"${name}" ("consulta cnpj" OR "dados cadastrais")`,
  },
];

const IDLE_LEAD =
  "Digite o seu nome como o Google já conhece você. Em segundos, você mesmo vê os caminhos públicos até a vida pessoal — e decide se quer que a Invisi trate o que for cabível.";

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
  let opened = [];
  let sawAPath = false;

  const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

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
      return "Escreva nome e sobrenome, como no Google.";
    }
    if (parts.length > 6 || name.length > 80) {
      return "Use o nome civil, sem texto extra.";
    }
    if (parts.some((part) => !/^[\p{L}'’-]+$/u.test(part) || part.length < 2)) {
      return "Confira a grafia do nome.";
    }
    return "";
  };

  const searchUrl = (query) =>
    `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=pt-BR`;

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

  const fillLeadForm = (name) => {
    if (leadName && !leadName.value.trim()) leadName.value = name;
    if (leadNote && !leadNote.value.trim()) {
      leadNote.value =
        "Fiz a prévia de exposição no site. Quero o diagnóstico completo e saber o que dá para tratar.";
    }
    if (previewField) previewField.value = "Sim";
    if (consultedName) consultedName.value = name;
    if (openedPaths) openedPaths.value = opened.join(", ");
    if (contactTitle) {
      contactTitle.textContent =
        "Você já viu as portas. Agora a Invisi trata o que for cabível.";
    }
    if (contactText) {
      contactText.textContent =
        "A prévia mostrou os caminhos públicos a partir do seu nome. Envie o contato para receber o diagnóstico, o escopo e o acompanhamento de 1 ano. O envio não gera cobrança.";
    }
  };

  const markOpened = (key) => {
    if (!opened.includes(key)) opened.push(key);
    if (openedPaths) openedPaths.value = opened.join(", ");
    const row = results?.querySelector(`[data-path="${key}"]`);
    if (row) {
      row.classList.add("is-opened");
      const badge = row.querySelector("b");
      if (badge) badge.textContent = "Aberto";
    }
    sawAPath = true;
  };

  const revealConclusion = (name, returned = false) => {
    if (verdict) {
      verdict.textContent = returned
        ? `${firstName(name)}, se você se reconheceu do outro lado, a vida pessoal já está pública demais para quem só queria ter um CNPJ.`
        : `${firstName(name)}, se o seu nome abre essas portas, telefone e endereço costumam estar do outro lado. A Invisi trata o que for cabível e acompanha por 1 ano.`;
    }
    if (insight) {
      insight.hidden = false;
      insight.innerHTML = returned
        ? "<strong>Você acabou de ver o problema.</strong> A prévia não inventa vazamento: ela só aponta a porta. O diagnóstico completo mapeia as ocorrências, avalia o que dá para tratar e acompanha o que reaparecer."
        : "<strong>Não mostramos o dado nesta tela.</strong> Se telefone, e-mail ou endereço estiverem públicos, eles aparecem do outro lado do caminho. A Invisi não republica a sua vida para provar o serviço.";
    }
    if (conclusion) conclusion.hidden = false;
    if (cardCta) cardCta.hidden = false;
    hero?.classList.add("is-mirror-report");
    fillLeadForm(name);
  };

  const renderPaths = (name, mode) => {
    if (!results) return;
    results.replaceChildren();

    PATHS.forEach((path, index) => {
      const checking = mode === "scanning" && index === Number(card.dataset.activeIndex);
      const ready = mode === "report" || (mode === "scanning" && index < Number(card.dataset.activeIndex || -1));
      const row = document.createElement(ready ? "a" : "div");
      row.className = "result-item";
      if (checking) row.classList.add("is-checking");
      if (ready) row.classList.add("is-ready");
      if (opened.includes(path.key)) row.classList.add("is-opened");
      row.dataset.path = path.key;

      if (ready) {
        row.href = searchUrl(path.query(name));
        row.target = "_blank";
        row.rel = "noopener noreferrer";
        row.addEventListener("click", () => markOpened(path.key));
      }

      row.innerHTML = `
        <span class="result-icon">${path.icon}</span>
        <div>
          <strong></strong>
          <small></small>
        </div>
        <b></b>
      `;
      row.querySelector("strong").textContent = path.title;
      row.querySelector("small").textContent = ready ? path.hint : path.scanning;
      row.querySelector("b").textContent = ready
        ? opened.includes(path.key)
          ? "Aberto"
          : "Abrir caminho"
        : checking
          ? "Varrendo"
          : "Na fila";
      results.append(row);
    });
  };

  const runScan = async (name) => {
    queriedName = name;
    opened = [];
    sawAPath = false;
    form.dataset.busy = "true";
    nameInput.disabled = true;
    if (submitLabel) submitLabel.textContent = "Varrendo...";
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

    const stepMs = reduceMotion ? 0 : 620;

    for (let index = 0; index < PATHS.length; index += 1) {
      card.dataset.activeIndex = String(index);
      if (status) status.textContent = PATHS[index].scanning;
      if (live) live.textContent = `${PATHS[index].scanning}…`;
      renderPaths(name, "scanning");
      setProgress((index + 1) / (PATHS.length + 0.35));
      if (window.matchMedia("(max-width: 980px)").matches && index === 0) {
        card?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
      }
      if (stepMs) await sleep(stepMs);
    }

    card.dataset.activeIndex = String(PATHS.length);
    card?.classList.remove("is-scanning");
    card?.classList.add("is-report");
    pulse?.classList.remove("is-live");
    pulse?.classList.add("is-ready");
    setProgress(1);
    if (status) status.textContent = "Prévia pronta. Abra um caminho.";
    if (live) {
      live.textContent =
        "Cinco caminhos públicos a partir do seu nome. A Invisi não coloca o dado aqui.";
    }
    if (label) label.textContent = "Relatório de exposição · prévia";
    renderPaths(name, "report");
    revealConclusion(name);
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

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !queriedName || !sawAPath) {
      return;
    }
    revealConclusion(queriedName, true);
    if (status) {
      status.textContent = "Você voltou. O próximo passo é tratar.";
    }
  });

  const onCta = () => {
    if (queriedName) fillLeadForm(queriedName);
  };
  cta?.addEventListener("click", onCta);
  cardCta?.addEventListener("click", onCta);

  resetButton?.addEventListener("click", () => {
    hero?.classList.remove("is-mirror-report", "is-mirror-scanning");
    if (conclusion) conclusion.hidden = true;
    if (cardCta) cardCta.hidden = true;
    nameInput.disabled = false;
    nameInput.focus();
    if (submitLabel) submitLabel.textContent = "Ver exposição";
  });
}
})();
