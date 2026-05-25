import { createAttributionReport, readJsonFile } from "../src/lead-attribution.mjs";

const root = new URL("../", import.meta.url);

async function main() {
  const fieldMap = await readJsonFile(new URL("config/field-map.json", root));
  const submission = await readJsonFile(new URL("examples/sample-submission.json", root));
  const expected = await readJsonFile(new URL("examples/sample-output.json", root));
  const generated = createAttributionReport({ submission, fieldMap });

  assert(JSON.stringify(generated) === JSON.stringify(expected), "generated output must match the checked sample");
  assert(generated.platform === "jotform", "platform must be jotform");
  assert(generated.manualUseOnly === true, "kit must remain manual-use only");
  assert(generated.attribution.utm.source === "google", "UTM source should normalize from hidden fields");
  assert(generated.attribution.utm.medium === "cpc", "UTM medium should normalize from hidden fields");
  assert(generated.attribution.clickIds.gclid === "test-gclid-123", "gclid should normalize from hidden fields");
  assert(generated.attribution.clickIds.msclkid === "test-msclkid-456", "msclkid should normalize from hidden fields");
  assert(generated.attribution.clickIds.fbclid === "test-fbclid-789", "fbclid should normalize from hidden fields");
  assert(generated.attribution.firstTouch.summary === "google / cpc / local-seo-audit", "first touch should normalize from hidden fields");
  assert(generated.attribution.lastTouch.summary === "google / cpc / local-seo-audit", "last touch should normalize from hidden fields");
  assert(generated.attribution.consent.status === "granted", "consent status should normalize from hidden fields");
  assert(generated.attribution.sourceContext.includes("Jotform"), "source context should be human-readable and Jotform-specific");

  console.log("jotform hidden-field attribution kit smoke ok");
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
