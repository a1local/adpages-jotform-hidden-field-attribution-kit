import { readFile } from "node:fs/promises";
import { createAttributionReport, normalizeFieldMap, readJsonFile } from "../src/lead-attribution.mjs";

const root = new URL("../", import.meta.url);
const requiredFiles = [
  "README.md",
  "PRIVACY.md",
  "PUBLISH_BLOCKERS.md",
  "package.json",
  "config/field-map.json",
  "docs/setup-checklist.md",
  "examples/sample-submission.json",
  "examples/sample-output.json",
  "snippets/utm-hidden-fields.js",
  "src/lead-attribution.mjs",
  "scripts/check.mjs",
  "scripts/smoke.mjs"
];
const localSourceFiles = [
  "snippets/utm-hidden-fields.js",
  "src/lead-attribution.mjs",
  "scripts/check.mjs",
  "scripts/smoke.mjs"
];
const networkPattern = new RegExp([
  "f" + "etch\\s*\\(",
  "XML" + "HttpRequest",
  "send" + "Beacon",
  "Web" + "Socket",
  "Event" + "Source",
  "node:" + "https",
  "node:" + "http",
  "api\\.jotform\\.com",
  "jotform\\.com/API"
].join("|"), "i");
const secretPattern = new RegExp([
  "JOTFORM_" + "API_" + "KEY",
  "JOTFORM_" + "SECRET",
  "access_" + "tok" + "en",
  "refresh_" + "tok" + "en",
  "client_" + "secret"
].join("|"), "i");

async function main() {
  const contents = new Map();

  for (const file of requiredFiles) {
    const content = await readText(file);
    contents.set(file, content);
    assert(content.trim().length > 0, `${file} must not be empty`);
  }

  const packageJson = JSON.parse(contents.get("package.json"));
  assert(packageJson.private === true, "package.json must remain private");
  assert(packageJson.type === "module", "package.json must use type=module");
  assert(packageJson.scripts?.check, "package.json must define check script");
  assert(packageJson.scripts?.smoke, "package.json must define smoke script");
  assert(!packageJson.dependencies, "kit must not add runtime dependencies");
  assert(!packageJson.devDependencies, "kit must not add dev dependencies");

  const fieldMap = JSON.parse(contents.get("config/field-map.json"));
  const normalized = normalizeFieldMap(fieldMap);
  assert(normalized.fields.length >= 20, "field map should cover identity, UTM, page, click ID, touch, consent, context, and review fields");
  assert(fieldMap.manualSetupOnly === true, "field map must be manual setup only");
  assert(fieldMap.requiresJotformApi === false, "field map must avoid Jotform API requirements");
  assert(fieldMap.requiresOAuth === false, "field map must avoid OAuth requirements");
  assert(fieldMap.requiresWebhooks === false, "field map must avoid webhook requirements");
  assert(fieldMap.requiresSecrets === false, "field map must avoid secret requirements");
  assert(fieldMap.writesDataAutomatically === false, "field map must disclose no automatic writes");

  const types = new Set(normalized.fields.map((field) => field.type));
  for (const type of ["identity", "utm", "page", "click_id", "touch", "consent", "context", "review"]) {
    assert(types.has(type), `field map must include ${type} fields`);
  }

  const questionNames = new Set(normalized.fields.map((field) => field.jotformQuestionName));
  for (const name of ["utm_source", "landing_page_url", "referrer_url", "gclid", "msclkid", "fbclid", "first_touch_summary", "last_touch_summary", "consent_status"]) {
    assert(questionNames.has(name), `field map must include Jotform hidden field ${name}`);
  }

  const sampleSubmission = await readJsonFile(new URL("examples/sample-submission.json", root));
  const sampleOutput = await readJsonFile(new URL("examples/sample-output.json", root));
  const generated = createAttributionReport({ submission: sampleSubmission, fieldMap });
  assert(JSON.stringify(generated) === JSON.stringify(sampleOutput), "sample output must match generated attribution report");
  assert(generated.missingRequired.length === 0, "sample submission should not miss required fields");
  assert(generated.fieldValues.utm_source === "google", "sample must map UTM source");
  assert(generated.fieldValues.utm_medium === "cpc", "sample must map UTM medium");
  assert(generated.fieldValues.utm_campaign === "local-seo-audit", "sample must map UTM campaign");
  assert(generated.fieldValues.gclid === "test-gclid-123", "sample must map gclid");
  assert(generated.fieldValues.msclkid === "test-msclkid-456", "sample must map msclkid");
  assert(generated.fieldValues.fbclid === "test-fbclid-789", "sample must map fbclid");
  assert(generated.fieldValues.landing_page_url.startsWith("https://"), "sample must map landing page URL");
  assert(generated.fieldValues.referrer_url === "https://www.google.com/", "sample must map referrer URL");
  assert(generated.fieldValues.first_touch_summary.includes("google / cpc"), "sample must map first touch");
  assert(generated.fieldValues.last_touch_summary.includes("google / cpc"), "sample must map last touch");
  assert(generated.fieldValues.consent_status === "granted", "sample must map consent status");
  assert(generated.qaChecklist.some((item) => item.check === "Human QA" && item.status === "review"), "QA checklist must force human review");

  for (const file of localSourceFiles) {
    const content = contents.get(file);
    assert(!networkPattern.test(content), `${file} must not make network calls or reference Jotform APIs`);
    assert(!secretPattern.test(content), `${file} must not contain credential or OAuth handling`);
  }

  const readme = contents.get("README.md");
  assert(readme.includes("Jotform"), "README must mention Jotform");
  assert(readme.includes("Hidden"), "README must describe hidden fields");
  assert(readme.includes("does not call the Jotform API"), "README must disclose no Jotform API calls");
  assert(readme.includes("does not use OAuth"), "README must disclose no OAuth integration");
  assert(readme.includes("does not create webhooks"), "README must disclose no webhook integration");
  assert(readme.includes("Jotform Marketplace app"), "README must avoid marketplace app ambiguity");

  const privacy = contents.get("PRIVACY.md");
  assert(privacy.includes("does not make network calls"), "PRIVACY must disclose network behavior");
  assert(privacy.includes("does not require Jotform API keys"), "PRIVACY must disclose credential behavior");

  const blockers = contents.get("PUBLISH_BLOCKERS.md");
  assert(blockers.includes("Jotform Marketplace app"), "publish blockers must identify app status");
  assert(blockers.includes("Webhook receiver"), "publish blockers must block webhook claims");
  assert(blockers.includes("Automatic CRM sync"), "publish blockers must block CRM sync claims");

  console.log(`jotform hidden-field attribution kit check ok (${requiredFiles.length} files)`);
}

async function readText(file) {
  return readFile(new URL(file, root), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
