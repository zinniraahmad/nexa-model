# Accessibility audit

Owner: Zinnira Ahmad  
Standard: WCAG 2.1 Level AA  
Audit date: 8 August 2026

## Automated browser audit

Lighthouse accessibility audits were run against a clean local production build in headless Chrome for `/`, `/apply` and `/privacy`. All three routes scored 100/100 with no automated WCAG A or AA failures.

## Manual and source review

- Every public route has a main landmark and the application now has a single programmatic H1.
- A keyboard-visible skip link targets the main content on every route.
- Focus indicators are visible for links, buttons and form controls in both themes.
- The mobile navigation traps focus while open, closes with Escape, returns focus to its trigger and moves focus into the menu when opened.
- The custom select exposes its label, expanded state, listbox/options and selected value; Arrow keys, Home, End and Escape are supported.
- Radio and checkbox groups use fieldset/legend, text controls use explicit labels and form status messages use live status semantics.
- Application progress exposes its current step through `role="progressbar"` and numeric ARIA values.
- Decorative section images are hidden from assistive technology; meaningful editorial content has an accessible name.
- `prefers-reduced-motion: reduce` disables smooth scrolling, animation and transitions.
- The light and dark theme token pairs were reviewed for text/background contrast; Lighthouse reported no contrast failures in its rendered route checks.

## Regression check

Repeat the three-route Lighthouse accessibility audit and keyboard walkthrough after changes to navigation, themes, form controls or typography. A real screen-reader walkthrough with VoiceOver, NVDA or TalkBack remains a useful usability check before a major redesign.
