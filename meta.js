(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.InvisiMeta = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const LEAD_KEY = "invisi.meta.lead";
  const VIEW_KEY = "invisi.meta.viewcontent";

  const sessionStore = (storage) => {
    if (storage) return storage;
    try {
      if (typeof sessionStorage !== "undefined") return sessionStorage;
    } catch (e) {}
    return null;
  };

  const track = (eventName, fbqImpl) => {
    if (typeof fbqImpl === "function") {
      try {
        fbqImpl("track", eventName);
        return true;
      } catch (e) {
        return false;
      }
    }
    if (typeof window !== "undefined" && typeof window.fbq === "function") {
      try {
        window.fbq("track", eventName);
        return true;
      } catch (e) {}
    }
    return false;
  };

  const viewContent = (storage, fbqImpl) => {
    const store = sessionStore(storage);
    try {
      if (store && store.getItem(VIEW_KEY) === "1") return false;
    } catch (e) {}
    if (!track("ViewContent", fbqImpl)) return false;
    try {
      if (store) store.setItem(VIEW_KEY, "1");
    } catch (e) {}
    return true;
  };

  const leadFromEnvio = (storage, fbqImpl) => {
    if (!track("Lead", fbqImpl)) return false;
    const store = sessionStore(storage);
    try {
      if (store) store.setItem(LEAD_KEY, "1");
    } catch (e) {}
    return true;
  };

  const leadOnThanks = (storage, fbqImpl) => {
    const store = sessionStore(storage);
    let already = false;
    try {
      already = Boolean(store && store.getItem(LEAD_KEY) === "1");
    } catch (e) {}
    try {
      if (store && typeof store.removeItem === "function") {
        store.removeItem(LEAD_KEY);
      }
    } catch (e) {}
    if (already) return false;
    return track("Lead", fbqImpl);
  };

  return {
    LEAD_KEY,
    VIEW_KEY,
    track,
    viewContent,
    leadFromEnvio,
    leadOnThanks,
  };
});
