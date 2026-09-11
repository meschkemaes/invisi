const surveyForm = document.querySelector("[data-survey-form]");

const configureReturnUrl = () => {
  const nextInput = surveyForm?.querySelector('input[name="_next"]');
  if (!nextInput || !window.location.protocol.startsWith("http")) return;

  nextInput.value = new URL(
    "pesquisa-obrigado.html",
    window.location.href,
  ).href;
};

const setupExclusiveOptions = () => {
  document.querySelectorAll("[data-exclusive]").forEach((exclusiveInput) => {
    const groupName = exclusiveInput.name;
    const groupInputs = document.querySelectorAll(`input[name="${groupName}"]`);

    groupInputs.forEach((input) => {
      input.addEventListener("change", () => {
        if (!input.checked) return;

        if (input === exclusiveInput) {
          groupInputs.forEach((otherInput) => {
            if (otherInput !== exclusiveInput) otherInput.checked = false;
          });
        } else {
          exclusiveInput.checked = false;
        }
      });
    });
  });
};

const contactName = document.querySelector("#survey-name");
const contactPhone = document.querySelector("#survey-phone");
const contactConsent = document.querySelector("#survey-contact-consent");
const contactError = document.querySelector("[data-contact-error]");

if (contactPhone) {
  contactPhone.addEventListener("input", (event) => {
    const digits = event.target.value.replace(/\D/g, "").slice(0, 11);
    let formatted = digits;

    if (digits.length > 2)
      formatted = `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length > 7)
      formatted = `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;

    event.target.value = formatted;
  });
}

const validateOptionalContact = () => {
  if (!contactName || !contactPhone || !contactConsent) return true;

  const hasName = contactName.value.trim().length > 0;
  const hasPhone = contactPhone.value.trim().length > 0;
  const wantsContact = hasName || hasPhone || contactConsent.checked;
  const isValid =
    !wantsContact ||
    (hasName &&
      hasPhone &&
      contactPhone.checkValidity() &&
      contactConsent.checked);

  contactName.setAttribute("aria-invalid", String(wantsContact && !hasName));
  contactPhone.setAttribute(
    "aria-invalid",
    String(wantsContact && (!hasPhone || !contactPhone.checkValidity())),
  );

  if (contactError) {
    contactError.textContent = isValid
      ? ""
      : "Para solicitar contato, informe nome e WhatsApp válidos e aceite a autorização.";
  }

  if (!isValid) {
    contactName.scrollIntoView({ behavior: "smooth", block: "center" });
    if (!hasName) contactName.focus({ preventScroll: true });
    else if (!hasPhone || !contactPhone.checkValidity())
      contactPhone.focus({ preventScroll: true });
    else contactConsent.focus({ preventScroll: true });
  }

  return isValid;
};

const validateCheckboxGroups = () => {
  let firstInvalidGroup = null;

  document.querySelectorAll("[data-checkbox-group]").forEach((group) => {
    const checkboxes = group.querySelectorAll('input[type="checkbox"]');
    const error = group.querySelector("[data-group-error]");
    const hasSelection = [...checkboxes].some((checkbox) => checkbox.checked);

    group.setAttribute("aria-invalid", String(!hasSelection));
    if (error) {
      error.textContent = hasSelection ? "" : "Selecione pelo menos uma opção.";
    }
    if (!hasSelection && !firstInvalidGroup) firstInvalidGroup = group;
  });

  if (firstInvalidGroup) {
    firstInvalidGroup.scrollIntoView({ behavior: "smooth", block: "center" });
    firstInvalidGroup.querySelector("input")?.focus({ preventScroll: true });
    return false;
  }

  return true;
};

configureReturnUrl();
setupExclusiveOptions();

if (surveyForm) {
  surveyForm.addEventListener("submit", (event) => {
    if (!validateCheckboxGroups() || !validateOptionalContact()) {
      event.preventDefault();
      return;
    }

    const button = surveyForm.querySelector(".submit-button");
    const status = surveyForm.querySelector(".form-status");

    if (button) {
      button.disabled = true;
      button.textContent = "Enviando respostas...";
    }
    if (status)
      status.textContent = "Aguarde. Você será redirecionado após o envio.";
  });
}
