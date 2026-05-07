# Griseus Copilot Instructions

Griseus is a Turkish HVAC manufacturing intelligence platform. UI work must preserve the existing Claude-style light aesthetic and must be verified in a running browser.

## UI Rules

- Use `CT`, `CT_FONT`, and `CT_MONO` from `client/src/lib/claude-theme.ts` for new UI.
- Do not introduce local dark palettes, glassmorphism backgrounds, gradient orbs, or emoji icons.
- Prefer `lucide-react` icons for buttons, navigation, status, and action controls.
- Keep operational screens dense, calm, and scannable. Avoid landing-page composition for app workflows.
- Do not add floating overlay panels on `/ontology`.
- Do not change existing layout/visual language unless the task explicitly asks for UI cleanup.

## Completion Bar

For any UI change, the work is not done until all of these pass:

- `npm run check`
- `npm run build`
- Browser screenshot review for the touched route at desktop width.
- Mobile screenshot review when the touched route has nav, cards, tables, controls, or forms.

If backend data is unavailable locally, still verify the empty/loading/error states in Vite and state that API-backed data was not verified.

## Implementation Style

- Keep changes tightly scoped to the touched route/component.
- Use existing component and route patterns before adding new abstractions.
- Text must not overflow cards, buttons, tabs, or nav on mobile.
- Critical stock/BOM/production rules need explicit tests or manual API checks before merge.
