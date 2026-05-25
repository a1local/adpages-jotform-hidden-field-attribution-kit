# Jotform Hidden-Field Setup Checklist

Use this checklist before pitching the kit as publish-ready for a client or public resource page.

## Form Setup

- Add Jotform hidden fields for every `jotformQuestionName` in `config/field-map.json`.
- Keep the question names stable. Labels can be client-friendly, but names should stay machine-friendly.
- Put the hidden fields on every relevant form variation, including duplicate campaign forms.
- Confirm that required visible contact fields are present: name, email, and any phone field the agency relies on.

## Embed Setup

- Add `snippets/utm-hidden-fields.js` on the page that embeds the Jotform form.
- Confirm the snippet runs after the form embed has inserted hidden inputs.
- If the Jotform embed is inside an iframe that cannot access the parent page, adapt the setup to prefill fields using the embed URL or a tested Jotform-supported method.
- Test one clean direct visit and one paid-click URL with `utm_source`, `utm_medium`, `utm_campaign`, and at least one click ID.

## QA

- Submit a test lead from the final landing page, not only from the Jotform builder preview.
- Export or copy the submission payload.
- Run the smoke test against `examples/sample-submission.json`, then replace the sample locally with the test payload and compare output.
- Check that `landing_page_url`, `referrer_url`, `gclid`, `msclkid`, `fbclid`, first touch, last touch, and consent context are populated as expected.
- Keep screenshots of the hidden-field setup and the test submission for publishing evidence.

## Do Not Claim Yet

- No Jotform API integration.
- No OAuth integration.
- No webhook automation.
- No automatic CRM sync.
- No legal compliance guarantee.
