(function fillJotformAttributionHiddenFields() {
  var storageKey = "adpages_jotform_first_touch";
  var currentUrl = window.location.href;
  var params = new URLSearchParams(window.location.search);
  var source = params.get("utm_source") || "direct";
  var medium = params.get("utm_medium") || "none";
  var campaign = params.get("utm_campaign") || "";
  var summary = [source, medium, campaign].filter(Boolean).join(" / ");

  function readFirstTouch() {
    try {
      var existing = window.localStorage.getItem(storageKey);
      if (existing) {
        return JSON.parse(existing);
      }
    } catch (error) {
      return null;
    }

    return null;
  }

  function writeFirstTouch(value) {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(value));
    } catch (error) {
      // Storage can fail in private browsing or locked-down embeds. The form still gets last-touch values.
    }
  }

  function setField(name, value) {
    if (!value) {
      return;
    }

    var selector = [
      'input[name="' + name + '"]',
      'textarea[name="' + name + '"]',
      'input[data-component="' + name + '"]',
      'textarea[data-component="' + name + '"]'
    ].join(",");
    var fields = document.querySelectorAll(selector);

    fields.forEach(function updateField(field) {
      field.value = value;
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  var firstTouch = readFirstTouch();
  if (!firstTouch) {
    firstTouch = {
      summary: summary,
      url: currentUrl
    };
    writeFirstTouch(firstTouch);
  }

  var values = {
    utm_source: source,
    utm_medium: medium,
    utm_campaign: campaign,
    utm_term: params.get("utm_term") || "",
    utm_content: params.get("utm_content") || "",
    landing_page_url: currentUrl,
    referrer_url: document.referrer || "",
    gclid: params.get("gclid") || "",
    msclkid: params.get("msclkid") || "",
    fbclid: params.get("fbclid") || "",
    first_touch_summary: firstTouch.summary || summary,
    first_touch_url: firstTouch.url || currentUrl,
    last_touch_summary: summary,
    last_touch_url: currentUrl,
    source_context: "Jotform embedded on " + window.location.hostname + " with " + summary
  };

  Object.keys(values).forEach(function applyValue(name) {
    setField(name, values[name]);
  });
})();
