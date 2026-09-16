const menuButton = document.querySelector(".menu-button");
const mainNav = document.querySelector(".main-nav");

if (menuButton && mainNav) {
  const menuLabel = menuButton.querySelector(".sr-only");
  const mobileLayout = window.matchMedia("(max-width: 760px)");

  const closeMenu = (returnFocus = false) => {
    menuButton.setAttribute("aria-expanded", "false");
    mainNav.classList.remove("is-open");
    document.body.classList.remove("menu-open");
    if (menuLabel) menuLabel.textContent = "Abrir menu";
    if (returnFocus) menuButton.focus();
  };

  menuButton.addEventListener("click", () => {
    const isOpen = menuButton.getAttribute("aria-expanded") === "true";
    menuButton.setAttribute("aria-expanded", String(!isOpen));
    mainNav.classList.toggle("is-open", !isOpen);
    document.body.classList.toggle("menu-open", !isOpen);
    if (menuLabel)
      menuLabel.textContent = isOpen ? "Abrir menu" : "Fechar menu";
  });

  mainNav
    .querySelectorAll("a")
    .forEach((link) => link.addEventListener("click", () => closeMenu()));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && mainNav.classList.contains("is-open"))
      closeMenu(true);
  });
  mobileLayout.addEventListener("change", (event) => {
    if (!event.matches) closeMenu();
  });
}

const formatBrMobile = (value) => {
  const digits = String(value || "")
    .replace(/\D/g, "")
    .slice(0, 11);
  if (digits.length > 7) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length > 2) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }
  return digits;
};

document.querySelectorAll("[data-phone-mask]").forEach((input) => {
  input.addEventListener("input", (event) => {
    event.target.value = formatBrMobile(event.target.value);
  });
});

const applyFormContext = (form) => {
  if (!form) return;
  const nextInput = form.querySelector('input[name="_next"]');
  if (nextInput && window.location.protocol.startsWith("http")) {
    nextInput.value = new URL("obrigado.html", window.location.href).href;
  }

  const utmParams = new URLSearchParams(window.location.search);
  ["source", "medium", "campaign", "content"].forEach((key) => {
    const field = form.querySelector(`input[name="UTM_${key}"]`);
    const storageKey = `invisi.utm.${key}`;
    const fromQuery = (utmParams.get(`utm_${key}`) || "").trim().slice(0, 200);

    if (fromQuery) {
      try {
        sessionStorage.setItem(storageKey, fromQuery);
      } catch (_) {
        /* sessionStorage may be unavailable */
      }
    }

    let value = fromQuery;
    if (!value) {
      try {
        value = sessionStorage.getItem(storageKey) || "";
      } catch (_) {
        value = "";
      }
    }

    if (field) field.value = value;
  });
};

const markFormSending = (form) => {
  const button = form.querySelector(".submit-button");
  const buttonText = button?.querySelector("span");
  const status = form.querySelector(".form-status");

  if (button && buttonText) {
    button.disabled = true;
    buttonText.textContent = "Enviando...";
  }
  if (status) status.textContent = "Aguarde a confirmação do envio.";
};

const leadForm = document.querySelector("[data-lead-form]");
if (leadForm) {
  applyFormContext(leadForm);
  leadForm.addEventListener("submit", () => markFormSending(leadForm));
}

const intentDialog = document.querySelector("#avaliacao-inicial");
const intentForm = document.querySelector("[data-intent-form]");
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

if (intentDialog && intentForm) {
  let lastTrigger = null;

  const visibleFocusable = () =>
    [...intentDialog.querySelectorAll(FOCUSABLE)].filter(
      (element) =>
        !element.classList.contains("honeypot") &&
        !element.hasAttribute("hidden") &&
        element.getAttribute("aria-hidden") !== "true",
    );

  const copyMirrorIntoIntent = () => {
    const consultedName =
      document.querySelector("[data-consulted-name]")?.value.trim() || "";
    const typedName =
      document.querySelector("#nome")?.value.trim() ||
      document.querySelector("#mirror-name")?.value.trim() ||
      "";
    const nameField = intentForm.querySelector("[data-intent-name]");
    if (nameField) nameField.value = consultedName || typedName;

    const preview = intentForm.querySelector("[data-intent-preview]");
    const sourcePreview = document.querySelector("[data-preview-field]");
    if (preview && sourcePreview) preview.value = sourcePreview.value;

    const consulted = intentForm.querySelector("[data-intent-consulted]");
    if (consulted) consulted.value = consultedName || typedName;

    const paths = intentForm.querySelector("[data-intent-paths]");
    const sourcePaths = document.querySelector("[data-opened-paths]");
    if (paths && sourcePaths) paths.value = sourcePaths.value;

    const allowedFields = new Set([
      "telefone",
      "email",
      "endereco",
      "documento",
    ]);
    const field = lastTrigger?.getAttribute?.("data-intent-field") || "";
    const safeField = allowedFields.has(field) ? field : "";
    const signal = intentForm.querySelector("[data-intent-signal]");
    const target = intentForm.querySelector("[data-intent-target]");
    if (signal) signal.value = safeField ? "quero_remover" : "";
    if (target) target.value = safeField;
  };

  const isDialogOpen = () =>
    Boolean(intentDialog.open) || intentDialog.hasAttribute("open");

  const closeIntent = () => {
    if (typeof intentDialog.close === "function" && intentDialog.open) {
      intentDialog.close();
      return;
    }
    intentDialog.removeAttribute("open");
    document.body.classList.remove("intent-open");
    lastTrigger?.focus?.();
  };

  const openIntent = (trigger) => {
    lastTrigger = trigger || document.activeElement;
    copyMirrorIntoIntent();
    applyFormContext(intentForm);
    if (typeof intentDialog.showModal === "function") {
      if (!intentDialog.open) intentDialog.showModal();
    } else {
      intentDialog.setAttribute("open", "");
    }
    intentDialog.setAttribute("aria-modal", "true");
    document.body.classList.add("intent-open");
    const email = intentDialog.querySelector("#intent-email");
    window.requestAnimationFrame(() => email?.focus());
  };

  const isIntentCta = (element) => {
    if (!element || element.hasAttribute("data-intent-fallback")) return false;
    if (element.closest("[data-intent-form], [data-lead-form]")) return false;
    if (
      element.hasAttribute("data-intent-open") ||
      element.hasAttribute("data-mirror-cta") ||
      element.hasAttribute("data-mirror-card-cta")
    ) {
      return true;
    }
    const href = element.getAttribute("href") || "";
    return (
      (href === "#diagnostico" || href.endsWith("#diagnostico")) &&
      /avalia[cç][aã]o inicial/i.test(element.textContent || "")
    );
  };

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("a, button");
    if (!isIntentCta(trigger)) return;
    event.preventDefault();
    openIntent(trigger);
  });

  intentDialog.addEventListener("close", () => {
    document.body.classList.remove("intent-open");
    lastTrigger?.focus?.();
  });

  intentDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeIntent();
  });

  intentDialog.addEventListener("click", (event) => {
    if (event.target === intentDialog) closeIntent();
  });

  intentDialog.querySelectorAll("[data-intent-close]").forEach((button) => {
    button.addEventListener("click", () => closeIntent());
  });

  intentDialog
    .querySelector("[data-intent-fallback]")
    ?.addEventListener("click", () => closeIntent());

  intentDialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeIntent();
      return;
    }
    if (event.key !== "Tab" || !isDialogOpen()) return;
    const nodes = visibleFocusable();
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  intentForm.addEventListener("submit", () => {
    copyMirrorIntoIntent();
    applyFormContext(intentForm);
    markFormSending(intentForm);
  });

  applyFormContext(intentForm);

  if (window.location.hash === "#avaliacao-inicial") {
    openIntent();
    if (window.history.replaceState) {
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    }
  }
}

const revealElements = document.querySelectorAll(".reveal");
if (
  "IntersectionObserver" in window &&
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches
) {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.12 },
  );

  revealElements.forEach((element) => revealObserver.observe(element));
} else {
  revealElements.forEach((element) => element.classList.add("is-visible"));
}

document.querySelectorAll("[data-year]").forEach((element) => {
  element.textContent = String(new Date().getFullYear());
});
