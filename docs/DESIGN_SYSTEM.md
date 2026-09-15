# Auth design foundations

Source: Rekann Figma Auth section, inspected through the local figma-cli bridge on September 15, 2026. The follow-up fidelity pass reads individual component variants, not the extractor's suggested defaults. Shared primitives live in `src/components/ui.tsx`; semantic tokens and layout live in `src/styles.css`.

| Foundation                     | Measured value                                                                            |
| ------------------------------ | ----------------------------------------------------------------------------------------- |
| UI font                        | Inter, locally hosted through `@fontsource/inter`                                         |
| Brand type                     | Original outlined Geist SVG; 114 × 24 auth, 77 × 20 onboarding                            |
| Heading                        | 24/30 px, weight 500, tracking −0.2 px                                                    |
| Body                           | 14/22 px, weight 400, tracking −0.1 px                                                    |
| Form label                     | 14/20 px, weight 500                                                                      |
| Upload caption                 | 13/20 px, weight 400                                                                      |
| Brand / action                 | `#1da578`                                                                                 |
| Action hover                   | `#127857`                                                                                 |
| Primary text / secondary text  | `#292929` / `#707070`                                                                     |
| Placeholder                    | `#9e9e9e`                                                                                 |
| Border                         | `#e5e5e5`, 1 px                                                                           |
| Field and button radius        | 10 px                                                                                     |
| Desktop field / primary button | 36 px high                                                                                |
| Secondary small button         | 32 px high                                                                                |
| Focus                          | Existing gray border, white 1 px outer layer, green 2 px outer ring                       |
| Field error                    | Same ring geometry in `#ff5454`                                                           |
| Disabled field                 | `#fafafa` fill and `#9e9e9e` content                                                      |
| Auth frame                     | 1440 × 936 reference; 88 px header, content starts at y=288, 368 px form                  |
| Onboarding frame               | 48 px header; one-third preview, two-thirds form; form x=720/y=128 at reference size      |
| Onboarding form                | 480 px wide; 32 px heading gap; 16 px field gap                                           |
| Upload control                 | 480 × 88 px, 64 px preview, 12 px padding/gap                                             |
| Company card                   | 336 × 338 px at x=72/y=268                                                                |
| Profile card                   | 336 × 414 px at x=72/y=254; 258 px photo                                                  |
| Card shell                     | 16 px outer and 12 px inner radius; 6 px inset                                            |
| OTP                            | Six 40 px cells, 10 px radius, evenly distributed spacing (8 px minimum), 24 px separator |

References: login `196:5126`, company filled `209:5295`, profile empty `209:7394`, profile filled `209:7570`, field variants `199:67115`, primary button `264:9373`, focus `264:9375`, hover `264:9457`.

The brand, lanyard, background, and auth/form glyphs are exported from Figma. They are local assets, not approximate CSS drawings. CSS retains the structural card containers because their content must update with the user's input. Lucide remains available for new screens with no supplied icon reference.

The product decisions still apply: Google sign-in is disabled; English copy is edited for clarity; recovery/help links remain available. Email-only auth therefore omits the Google button and separator rather than leaving a nonfunctional control. Auth labels are visually hidden but remain programmatically associated with their fields. Password guidance and validation stay visible where needed. The owner flow has company, profile, and optional personal-details steps; invited employees have the latter two. Workspace time zone initializes from the browser, with UTC during SSR. Required company description, last name, and job title match the supplied field labels and are validated on both client and server.

`tests/visual.spec.ts` compares browser bounds at 1440 × 936 against the values above with a 1 px tolerance, checks exact focus/color/radius properties, captures empty/focused/filled states, and exercises avatar choice and step-back state retention. Mobile is a responsive adaptation: decorative previews are hidden and controls retain 44 px touch height. Raster text rendering may differ by browser/OS; the measured dimensions and color tokens are the review contract.

Forms and interactive Button components wait for hydration before accepting input. The six-cell code control uses one native input so paste, autofill, and screen-reader labeling continue to work. Avatar choice generates initials locally; uploaded photos remain user-provided and follow the existing private R2 pipeline.

## Interaction standard

Text links and text buttons never add an underline on hover. Use a subtle darker foreground on hover and press instead, with a shared 160 ms ease-out transition for color, background, border, and shadow. Brand actions use `#1da578` → `#127857` → `#0e6348`; muted and destructive controls retain their semantic color family. Buttons, icons, navigation, and clickable cards use the same smooth transition where relevant, without movement or scaling. Disabled controls do not react. Keep keyboard focus visible and respect reduced-motion preferences. Apply this standard to future relevant components.

Use semantic cursors for every interactive state. Links, enabled buttons, selects, file controls, checkboxes, radios, summaries, and elements with `role="button"` use the pointer cursor. Editable text fields and text areas use the text cursor. Disabled controls use the not-allowed cursor, and busy controls use the progress cursor. Plain labels and static content retain the default cursor.

Password requirements are progressive help: show the hint while the password field or its visibility toggle is focused. After leaving, keep it visible only when a visited, nonempty password is below the minimum length. Empty untouched forms stay compact. Valid or cleared passwords hide the hint on blur. Apply the same behavior to account creation and password recovery, retaining the input's accessible description while help is visible.

## Dropdowns

Approved September 15, 2026: [Dropdown / Location](https://www.figma.com/design/jWSy3bCKjtKfyrToW5zyZ5/Rekann---HR-Platform?node-id=295-10750) and [Dropdown / Industry](https://www.figma.com/design/jWSy3bCKjtKfyrToW5zyZ5/Rekann---HR-Platform?node-id=295-10671), on Components 1.0. Location variants cover open, selected, filtered, empty, disabled, error, and mobile. These replace the temporary native menus for company onboarding.

Closed controls retain the existing 36 px height and 10 px radius. Menus use the same white surface, gray border, Inter 14/20 text, 8 px padding, 4 px row gaps, 6 px row radii, and a subtle 0 8 24 shadow at 8% black. Active rows use the light gray surface; selected rows use the existing `brand/muted` color (`#ecfbf3`) and `brand/hover` foreground (`#127857`) with a check icon. Rows and triggers are 44 px high on mobile. Menus scroll within a 300 px maximum height and open above the control when necessary.

Location includes 249 ISO 3166-1 countries and territories with English display names. Indonesia is first; all others follow English alphabetical order. No country is silently selected, and no IP service is used. Search is case- and accent-insensitive, with a clear control and “No countries found” state. Industry uses the same menu without search. Arrow keys navigate, Enter selects, Escape cancels, and Tab exits. Selecting a value restores trigger focus and updates the company preview. Values continue through existing workspace validation and persistence.
