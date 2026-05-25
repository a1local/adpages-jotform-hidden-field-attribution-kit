import { readFile } from "node:fs/promises";

const VALID_TYPES = new Set(["identity", "utm", "page", "click_id", "touch", "consent", "context", "review"]);

export async function readJsonFile(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export function createAttributionReport({ submission, fieldMap }) {
  assertObject(submission, "submission must be an object");
  const normalized = normalizeFieldMap(fieldMap);
  const answerIndex = indexJotformAnswers(submission.answers ?? {});
  const derived = createDerivedValues(submission, answerIndex);
  const source = {
    submission,
    answers: answerIndex,
    derived
  };

  const mappedFields = normalized.fields.map((field) => {
    const value = clean(firstPresent([
      getByPath(source, field.sourcePath),
      answerIndex[field.jotformQuestionName],
      answerIndex[normalizeKey(field.jotformQuestionLabel)]
    ]));

    return {
      sourceKey: field.sourceKey,
      jotformQuestionName: field.jotformQuestionName,
      jotformQuestionLabel: field.jotformQuestionLabel,
      outputKey: field.outputKey,
      type: field.type,
      value,
      required: field.required,
      purpose: field.purpose
    };
  });

  const fieldValues = Object.fromEntries(mappedFields.map((field) => [field.outputKey, field.value]));
  const missingRequired = mappedFields
    .filter((field) => field.required && !field.value)
    .map((field) => field.outputKey);

  return {
    kit: normalized.kit,
    version: normalized.kitVersion,
    platform: normalized.platform,
    manualUseOnly: true,
    disclaimer: "Local normalization preview only. This kit does not call Jotform APIs, create webhooks, or write form data.",
    form: {
      id: clean(submission.form?.id),
      title: clean(derived.form_title),
      url: clean(submission.form?.url)
    },
    submission: {
      id: clean(derived.submission_id),
      createdAt: clean(submission.createdAt),
      ip: clean(submission.ip)
    },
    contact: {
      name: clean(derived.lead_name),
      email: clean(derived.email),
      phone: clean(derived.phone)
    },
    attribution: {
      utm: {
        source: clean(derived.utm_source),
        medium: clean(derived.utm_medium),
        campaign: clean(derived.utm_campaign),
        term: clean(derived.utm_term),
        content: clean(derived.utm_content)
      },
      clickIds: {
        gclid: clean(derived.gclid),
        msclkid: clean(derived.msclkid),
        fbclid: clean(derived.fbclid)
      },
      landingPageUrl: clean(derived.landing_page_url),
      referrerUrl: clean(derived.referrer_url),
      firstTouch: {
        summary: clean(derived.first_touch_summary),
        url: clean(derived.first_touch_url)
      },
      lastTouch: {
        summary: clean(derived.last_touch_summary),
        url: clean(derived.last_touch_url)
      },
      consent: {
        status: clean(derived.consent_status),
        source: clean(derived.consent_source)
      },
      sourceContext: clean(derived.source_context),
      humanSummary: clean(derived.human_summary)
    },
    mappedFields,
    fieldValues,
    missingRequired,
    qaChecklist: buildQaChecklist(derived),
    reviewSteps: [
      "Confirm Jotform hidden fields exist with the names in config/field-map.json.",
      "Submit a test lead from the final embedded landing page, not only the Jotform builder preview.",
      "Compare exported Jotform answers against this normalized output before using the data in CRM reports."
    ]
  };
}

export function normalizeFieldMap(fieldMap) {
  assertObject(fieldMap, "fieldMap must be an object");
  assert(fieldMap.kit === "adpages-jotform-hidden-field-attribution-kit", "fieldMap.kit mismatch");
  assert(fieldMap.platform === "jotform", "fieldMap.platform must be jotform");
  assert(fieldMap.manualSetupOnly === true, "fieldMap.manualSetupOnly must be true");
  assert(fieldMap.requiresJotformApi === false, "fieldMap must avoid Jotform API requirements");
  assert(fieldMap.requiresOAuth === false, "fieldMap must avoid OAuth requirements");
  assert(fieldMap.requiresWebhooks === false, "fieldMap must avoid webhook requirements");
  assert(fieldMap.requiresSecrets === false, "fieldMap must avoid secret requirements");
  assert(fieldMap.writesDataAutomatically === false, "fieldMap must disclose no automatic writes");
  assert(Array.isArray(fieldMap.fields) && fieldMap.fields.length > 0, "fieldMap.fields must be a non-empty array");

  const seenOutputKeys = new Set();
  const fields = fieldMap.fields.map((field, index) => {
    const sourceKey = clean(field.sourceKey);
    const jotformQuestionName = clean(field.jotformQuestionName);
    const jotformQuestionLabel = clean(field.jotformQuestionLabel);
    const outputKey = clean(field.outputKey);
    const type = clean(field.type);
    const sourcePath = clean(field.sourcePath);

    assert(sourceKey, `fields[${index}].sourceKey is required`);
    assert(/^[a-z][a-z0-9_]*$/.test(jotformQuestionName), `fields[${index}].jotformQuestionName must be snake_case`);
    assert(jotformQuestionLabel, `fields[${index}].jotformQuestionLabel is required`);
    assert(/^[a-z][a-z0-9_]*$/.test(outputKey), `fields[${index}].outputKey must be snake_case`);
    assert(VALID_TYPES.has(type), `fields[${index}].type is invalid`);
    assert(sourcePath.startsWith("derived."), `fields[${index}].sourcePath must use derived.*`);
    assert(!seenOutputKeys.has(outputKey), `duplicate outputKey ${outputKey}`);
    seenOutputKeys.add(outputKey);

    return {
      sourceKey,
      jotformQuestionName,
      jotformQuestionLabel,
      outputKey,
      type,
      sourcePath,
      required: Boolean(field.required),
      purpose: clean(field.purpose)
    };
  });

  return {
    kit: clean(fieldMap.kit),
    kitVersion: clean(fieldMap.kitVersion || "0.1.0"),
    platform: clean(fieldMap.platform),
    fields
  };
}

export function createDerivedValues(submission, answerIndex = indexJotformAnswers(submission.answers ?? {})) {
  const raw = normalizeRecord(submission.rawRequest ?? {});
  const pageUrl = firstPresent([
    pick(answerIndex, "landing_page_url", "landing_page", "page_url"),
    pick(raw, "landing_page_url", "q15_landing_page_url", "landing_page", "page_url"),
    submission.source?.embedPage,
    submission.page?.url
  ]);
  const referrer = firstPresent([
    pick(answerIndex, "referrer_url", "referrer", "document_referrer"),
    pick(raw, "referrer_url", "referrer"),
    submission.source?.referrer,
    submission.page?.referrer
  ]);
  const utmSource = firstPresent([pick(answerIndex, "utm_source"), raw.utm_source, queryParam(pageUrl, "utm_source"), "direct"]);
  const utmMedium = firstPresent([pick(answerIndex, "utm_medium"), raw.utm_medium, queryParam(pageUrl, "utm_medium"), "none"]);
  const utmCampaign = firstPresent([pick(answerIndex, "utm_campaign"), raw.utm_campaign, queryParam(pageUrl, "utm_campaign")]);
  const sourceSummary = buildSourceSummary({
    source: utmSource,
    medium: utmMedium,
    campaign: utmCampaign
  });
  const firstTouchSummary = firstPresent([
    pick(answerIndex, "first_touch_summary"),
    submission.firstTouch?.summary,
    sourceSummary
  ]);
  const firstTouchUrl = firstPresent([
    pick(answerIndex, "first_touch_url"),
    submission.firstTouch?.url,
    pageUrl
  ]);
  const lastTouchSummary = firstPresent([
    pick(answerIndex, "last_touch_summary"),
    submission.lastTouch?.summary,
    sourceSummary
  ]);
  const lastTouchUrl = firstPresent([
    pick(answerIndex, "last_touch_url"),
    submission.lastTouch?.url,
    pageUrl
  ]);
  const consentStatus = firstPresent([
    pick(answerIndex, "consent_status"),
    submission.consent?.status,
    inferConsentStatus(answerIndex),
    "not_recorded"
  ]);
  const consentSource = firstPresent([
    pick(answerIndex, "consent_source"),
    submission.consent?.source,
    inferConsentSource(answerIndex)
  ]);
  const leadName = firstPresent([
    pick(answerIndex, "lead_name"),
    pick(answerIndex, "full_name"),
    pick(answerIndex, "fullname"),
    pick(answerIndex, "name"),
    buildNameFromAnswers(answerIndex)
  ]);

  const derived = {
    form_title: firstPresent([submission.form?.title, pick(answerIndex, "form_title"), "Untitled Jotform form"]),
    submission_id: firstPresent([submission.submissionId, submission.id, pick(answerIndex, "submission_id")]),
    lead_name: leadName,
    email: firstPresent([pick(answerIndex, "email"), pick(answerIndex, "email_address"), submission.contact?.email]),
    phone: firstPresent([pick(answerIndex, "phone"), pick(answerIndex, "phone_number"), submission.contact?.phone]),
    utm_source: utmSource,
    utm_medium: utmMedium,
    utm_campaign: utmCampaign,
    utm_term: firstPresent([pick(answerIndex, "utm_term"), raw.utm_term, queryParam(pageUrl, "utm_term")]),
    utm_content: firstPresent([pick(answerIndex, "utm_content"), raw.utm_content, queryParam(pageUrl, "utm_content")]),
    landing_page_url: clean(pageUrl),
    referrer_url: clean(referrer),
    gclid: firstPresent([pick(answerIndex, "gclid"), raw.gclid, queryParam(pageUrl, "gclid")]),
    msclkid: firstPresent([pick(answerIndex, "msclkid"), raw.msclkid, queryParam(pageUrl, "msclkid")]),
    fbclid: firstPresent([pick(answerIndex, "fbclid"), raw.fbclid, queryParam(pageUrl, "fbclid")]),
    first_touch_summary: firstTouchSummary,
    first_touch_url: firstTouchUrl,
    last_touch_summary: lastTouchSummary,
    last_touch_url: lastTouchUrl,
    consent_status: consentStatus,
    consent_source: consentSource,
    qa_status: "manual_review_required"
  };

  derived.source_context = buildSourceContext(submission, derived);
  derived.human_summary = buildHumanSummary(derived);

  return derived;
}

export function indexJotformAnswers(answers) {
  const index = {};

  if (Array.isArray(answers)) {
    answers.forEach((answer, position) => addAnswer(index, String(position), answer));
    return index;
  }

  if (answers && typeof answers === "object") {
    Object.entries(answers).forEach(([id, answer]) => addAnswer(index, id, answer));
  }

  return index;
}

export function buildQaChecklist(derived) {
  const hasUtm = Boolean(clean(derived.utm_source) && clean(derived.utm_medium) && clean(derived.utm_campaign));
  const hasClickId = Boolean(clean(derived.gclid) || clean(derived.msclkid) || clean(derived.fbclid));
  const hasPage = Boolean(clean(derived.landing_page_url));
  const hasTouches = Boolean(clean(derived.first_touch_summary) && clean(derived.last_touch_summary));
  const hasConsent = clean(derived.consent_status) !== "not_recorded";

  return [
    {
      check: "Jotform hidden-field UTMs",
      status: hasUtm ? "pass" : "missing",
      detail: hasUtm ? `${derived.utm_source} / ${derived.utm_medium} / ${derived.utm_campaign}` : "Missing source, medium, or campaign."
    },
    {
      check: "Click IDs",
      status: hasClickId ? "pass" : "review",
      detail: hasClickId ? "At least one paid-click ID was captured." : "No gclid, msclkid, or fbclid was captured."
    },
    {
      check: "Landing page",
      status: hasPage ? "pass" : "missing",
      detail: hasPage ? derived.landing_page_url : "No landing page URL was captured."
    },
    {
      check: "First and last touch",
      status: hasTouches ? "pass" : "review",
      detail: hasTouches ? `${derived.first_touch_summary} -> ${derived.last_touch_summary}` : "Touch summaries need review."
    },
    {
      check: "Consent context",
      status: hasConsent ? "pass" : "review",
      detail: hasConsent ? `${derived.consent_status}: ${derived.consent_source}` : "Consent was not recorded in the sample."
    },
    {
      check: "Human QA",
      status: "review",
      detail: "Manual review is required before relying on this in reports or CRM workflows."
    }
  ];
}

function addAnswer(index, id, answer) {
  if (answer && typeof answer === "object" && !Array.isArray(answer)) {
    const value = stringifyAnswer(firstPresent([answer.answer, answer.prettyFormat, answer.value]));
    const keys = [
      id,
      answer.name,
      answer.text,
      answer.label
    ].map((key) => normalizeKey(key)).filter(Boolean);

    keys.forEach((key) => {
      index[key] = value;
    });

    if (answer.answer && typeof answer.answer === "object" && !Array.isArray(answer.answer)) {
      Object.entries(answer.answer).forEach(([childKey, childValue]) => {
        index[normalizeKey(childKey)] = stringifyAnswer(childValue);
        keys.forEach((baseKey) => {
          index[normalizeKey(`${baseKey}_${childKey}`)] = stringifyAnswer(childValue);
        });
      });
    }
    return;
  }

  index[normalizeKey(id)] = stringifyAnswer(answer);
}

function normalizeRecord(record) {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [normalizeKey(key), stringifyAnswer(value)])
  );
}

function buildNameFromAnswers(index) {
  const first = firstPresent([pick(index, "first"), pick(index, "full_name_first"), pick(index, "name_first")]);
  const last = firstPresent([pick(index, "last"), pick(index, "full_name_last"), pick(index, "name_last")]);
  return [first, last].filter(Boolean).join(" ");
}

function inferConsentStatus(index) {
  const consentValue = clean(firstPresent([
    pick(index, "marketing_consent"),
    pick(index, "consent"),
    pick(index, "privacy_consent")
  ])).toLowerCase();

  if (!consentValue) {
    return "";
  }

  return ["yes", "agree", "accepted", "true", "granted"].some((word) => consentValue.includes(word))
    ? "granted"
    : "not_granted";
}

function inferConsentSource(index) {
  if (pick(index, "marketing_consent")) {
    return "Jotform marketing consent answer";
  }

  if (pick(index, "consent")) {
    return "Jotform consent answer";
  }

  return "";
}

function buildSourceContext(submission, derived) {
  const formTitle = clean(derived.form_title);
  const formId = clean(submission.form?.id);
  const sourceHost = hostFromUrl(derived.landing_page_url);
  const sourceSummary = buildSourceSummary({
    source: derived.utm_source,
    medium: derived.utm_medium,
    campaign: derived.utm_campaign
  });

  return `Jotform "${formTitle}"${formId ? ` (${formId})` : ""} submitted from ${sourceHost || "unknown page"} with ${sourceSummary}`;
}

function buildHumanSummary(derived) {
  const clickIds = [
    derived.gclid ? "gclid" : "",
    derived.msclkid ? "msclkid" : "",
    derived.fbclid ? "fbclid" : ""
  ].filter(Boolean).join(", ") || "no click IDs";

  return `${derived.lead_name || "Unknown lead"} submitted ${derived.form_title} via ${derived.utm_source} / ${derived.utm_medium} / ${derived.utm_campaign || "no campaign"}; ${clickIds}; consent ${derived.consent_status}.`;
}

function buildSourceSummary({ source, medium, campaign }) {
  return [source || "direct", medium || "none", campaign].filter(Boolean).join(" / ");
}

function hostFromUrl(value) {
  try {
    return new URL(value).hostname;
  } catch (error) {
    return "";
  }
}

function queryParam(url, key) {
  try {
    return new URL(url).searchParams.get(key) || "";
  } catch (error) {
    return "";
  }
}

function pick(source, ...keys) {
  for (const key of keys) {
    const value = source?.[normalizeKey(key)];
    if (isPresent(value)) {
      return value;
    }
  }

  return "";
}

function getByPath(source, path) {
  return path.split(".").reduce((value, part) => value?.[part], source);
}

function normalizeKey(value) {
  return clean(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function stringifyAnswer(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (Array.isArray(value)) {
    return value.map((item) => stringifyAnswer(item)).filter(Boolean).join(", ");
  }

  if (typeof value === "object") {
    return Object.values(value).map((item) => stringifyAnswer(item)).filter(Boolean).join(" ");
  }

  return clean(value);
}

function firstPresent(values) {
  return values.find(isPresent) ?? "";
}

function isPresent(value) {
  return value !== undefined && value !== null && clean(value) !== "";
}

function clean(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function assertObject(value, message) {
  assert(value && typeof value === "object" && !Array.isArray(value), message);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
