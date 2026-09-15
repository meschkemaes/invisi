const surveyForm = document.querySelector("[data-survey-form]");
const surveyRemainder = document.querySelector("[data-survey-remainder]");
const ineligibleInput = document.querySelector("[data-ineligible]");
const ineligibleMessage = document.querySelector("[data-ineligible-message]");
const selectionLimitRefreshers = [];

const isSurveyIneligible = () => Boolean(ineligibleInput?.checked);

const configureReturnUrl = () => {
  const nextInput = surveyForm?.querySelector('input[name="_next"]');
  if (!nextInput || !window.location.protocol.startsWith("http")) return;

  nextInput.value = new URL(
    "pesquisa-obrigado.html",
    window.location.href,
  ).href;
};

const clearCheckboxGroupError = (group) => {
  const checkboxes = group.querySelectorAll('input[type="checkbox"]');
  const hasSelection = [...checkboxes].some((checkbox) => checkbox.checked);

  if (!hasSelection) return;

  group.setAttribute("aria-invalid", "false");
  const error = group.querySelector("[data-group-error]");
  if (error) error.textContent = "";
};

const setupExclusiveOptions = () => {
  document.querySelectorAll("[data-checkbox-group]").forEach((group) => {
    const checkboxes = [...group.querySelectorAll('input[type="checkbox"]')];
    const exclusiveInputs = checkboxes.filter((input) =>
      input.matches("[data-exclusive]"),
    );

    if (exclusiveInputs.length === 0) return;

    checkboxes.forEach((input) => {
      input.addEventListener("change", () => {
        if (!input.checked) return;

        if (input.matches("[data-exclusive]")) {
          checkboxes.forEach((otherInput) => {
            if (otherInput !== input) otherInput.checked = false;
          });
        } else {
          exclusiveInputs.forEach((exclusiveInput) => {
            exclusiveInput.checked = false;
          });
        }

        clearCheckboxGroupError(group);
      });
    });
  });
};

const setupCheckboxGroupFeedback = () => {
  document.querySelectorAll("[data-checkbox-group]").forEach((group) => {
    group.addEventListener("change", () => clearCheckboxGroupError(group));
  });
};

const setupSelectionLimits = () => {
  document.querySelectorAll("[data-max-selections]").forEach((group) => {
    const maximum = Number.parseInt(group.dataset.maxSelections, 10);
    const checkboxes = [...group.querySelectorAll('input[type="checkbox"]')];
    const counter = group.querySelector("[data-selection-count]");

    if (!Number.isFinite(maximum) || maximum < 1) return;

    const refresh = () => {
      const selectedCount = checkboxes.filter(
        (checkbox) => checkbox.checked,
      ).length;
      const limitReached = selectedCount >= maximum;

      checkboxes.forEach((checkbox) => {
        if (!checkbox.checked) {
          checkbox.disabled = limitReached || isSurveyIneligible();
        }
      });

      if (counter) {
        const selectionLabel =
          selectedCount === 1 ? "selecionada" : "selecionadas";
        const limitLabel = limitReached ? " Limite atingido." : "";
        counter.textContent = `${selectedCount} de ${maximum} ${selectionLabel}.${limitLabel}`;
      }
    };

    checkboxes.forEach((checkbox) => {
      checkbox.addEventListener("change", refresh);
    });

    selectionLimitRefreshers.push(refresh);
    refresh();
  });
};

const setEligibilityState = ({ announce = false } = {}) => {
  if (!surveyForm || !surveyRemainder || !ineligibleMessage) return;

  const ineligible = isSurveyIneligible();
  const remainderControls = surveyRemainder.querySelectorAll(
    "input, button, select, textarea",
  );

  surveyForm.dataset.eligibility = ineligible ? "ineligible" : "eligible";
  ineligibleMessage.hidden = !ineligible;
  surveyRemainder.hidden = ineligible;

  remainderControls.forEach((control) => {
    control.disabled = ineligible;
  });

  if (!ineligible) {
    selectionLimitRefreshers.forEach((refresh) => refresh());
  }

  if (ineligible && announce) {
    ineligibleMessage.focus({ preventScroll: true });
    ineligibleMessage.scrollIntoView({ behavior: "smooth", block: "center" });
  }
};

const setupEligibilityGate = () => {
  if (!surveyForm || !ineligibleInput) return;

  surveyForm
    .querySelectorAll('input[name="01_Relacao_com_CNPJ"]')
    .forEach((input) => {
      input.addEventListener("change", () =>
        setEligibilityState({ announce: true }),
      );
    });

  setEligibilityState();
};

const contactName = document.querySelector("#survey-name");
const contactPhone = document.querySelector("#survey-phone");
const contactConsent = document.querySelector("#survey-contact-consent");
const contactError = document.querySelector("[data-contact-error]");

if (contactPhone) {
  contactPhone.addEventListener("input", (event) => {
    const digits = event.target.value.replace(/\D/g, "").slice(0, 11);
    let formatted = digits;

    if (digits.length > 2) {
      formatted = `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    }
    if (digits.length > 7) {
      formatted = `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    }

    event.target.value = formatted;
  });
}

const validateOptionalContact = ({ focusInvalid = true } = {}) => {
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
  contactConsent.setAttribute(
    "aria-invalid",
    String(wantsContact && !contactConsent.checked),
  );

  if (contactError) {
    contactError.textContent = isValid
      ? ""
      : "Para a gente te chamar, preencha nome e WhatsApp e marque a autorização.";
  }

  if (!isValid && focusInvalid) {
    contactName.scrollIntoView({ behavior: "smooth", block: "center" });
    if (!hasName) contactName.focus({ preventScroll: true });
    else if (!hasPhone || !contactPhone.checkValidity()) {
      contactPhone.focus({ preventScroll: true });
    } else {
      contactConsent.focus({ preventScroll: true });
    }
  }

  return isValid;
};

[contactName, contactPhone].forEach((input) => {
  input?.addEventListener("input", () =>
    validateOptionalContact({ focusInvalid: false }),
  );
});
contactConsent?.addEventListener("change", () =>
  validateOptionalContact({ focusInvalid: false }),
);

const validateCheckboxGroups = () => {
  let firstInvalidGroup = null;

  document.querySelectorAll("[data-checkbox-group]").forEach((group) => {
    const checkboxes = [...group.querySelectorAll('input[type="checkbox"]')];
    const error = group.querySelector("[data-group-error]");
    const maximum = Number.parseInt(group.dataset.maxSelections, 10);
    const selectedCount = checkboxes.filter(
      (checkbox) => checkbox.checked,
    ).length;
    const hasSelection = selectedCount > 0;
    const exceedsLimit = Number.isFinite(maximum) && selectedCount > maximum;
    const isValid = hasSelection && !exceedsLimit;

    group.setAttribute("aria-invalid", String(!isValid));
    if (error) {
      if (!hasSelection) {
        error.textContent = "Selecione pelo menos uma opção.";
      } else if (exceedsLimit) {
        error.textContent = `Selecione no máximo ${maximum} opções.`;
      } else {
        error.textContent = "";
      }
    }
    if (!isValid && !firstInvalidGroup) firstInvalidGroup = group;
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
setupCheckboxGroupFeedback();
setupSelectionLimits();
setupEligibilityGate();

if (surveyForm) {
  surveyForm.addEventListener("submit", (event) => {
    if (isSurveyIneligible()) {
      event.preventDefault();
      setEligibilityState({ announce: true });
      return;
    }

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
    if (status) {
      status.textContent =
        "Aguarde. Em seguida você verá a confirmação.";
    }
  });
}
