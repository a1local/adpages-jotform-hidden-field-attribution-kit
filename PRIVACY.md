# Privacy Notes

This kit is local documentation and sample code only.

- It does not make network calls.
- It does not call the Jotform API.
- It does not require Jotform API keys, OAuth tokens, webhook secrets, or CRM credentials.
- It does not store submissions on a server.
- It does not send lead data to AdPages or any third party.

The optional browser snippet reads the current page URL, query string, document referrer, and local first-touch values. It writes those values into matching hidden fields in the current page only. If `localStorage` is available, it stores first-touch hints in the visitor browser so later form submissions can retain the original source.

Do not publish this as a consent-management system. If a form collects personal data, the agency or site owner still needs an appropriate privacy notice, lawful basis, consent wording where required, and a retention policy for exported Jotform submissions.
