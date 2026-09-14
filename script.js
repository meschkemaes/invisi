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

const phoneInput = document.querySelector("#telefone");
if (phoneInput) {
  phoneInput.addEventListener("input", (event) => {
    const digits = event.target.value.replace(/\D/g, "").slice(0, 11);
    let formatted = digits;

    if (digits.length > 2)
      formatted = `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length > 7)
      formatted = `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;

    event.target.value = formatted;
  });
}

const form = document.querySelector("[data-lead-form]");
if (form) {
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

  form.addEventListener("submit", () => {
    const button = form.querySelector(".submit-button");
    const buttonText = button?.querySelector("span");
    const status = form.querySelector(".form-status");

    if (button && buttonText) {
      button.disabled = true;
      buttonText.textContent = "Enviando...";
    }
    if (status) status.textContent = "Aguarde a confirmação do envio.";
  });
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
