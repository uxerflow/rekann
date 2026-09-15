# Auth design foundations

Source: Rekann Figma Auth section, inspected September 15, 2026 through figma-cli. Shared primitives live in `src/components/ui.tsx`; layout and semantic tokens live in `src/styles.css`.

| Foundation       | Value                                          |
| ---------------- | ---------------------------------------------- |
| Font             | Inter, self-hosted through `@fontsource/inter` |
| Main heading     | 24/30 px, weight 500                           |
| Body             | 14/22 px, weight 400                           |
| Form label       | 13 px, weight 500                              |
| Secondary copy   | 12/18 px                                       |
| Brand            | `#1da578`                                      |
| Action           | `#14805c`; hover `#116d4f`                     |
| Text             | `#292929`                                      |
| Secondary text   | `#707070`                                      |
| Border           | `#e5e5e5`                                      |
| Surface          | White / `#fafafa`                              |
| Error            | `#b42318`                                      |
| Form radius      | 6 px                                           |
| Desktop controls | Minimum 40 px                                  |
| Mobile controls  | Minimum 44 px                                  |

Use the shared Brand, Button, Field, PasswordField, FormFields, ImagePicker, Avatar, Notice, and Loading components. Forms stay disabled until hydrated, preserving typed input during the SSR-to-client handoff. Labels, visible keyboard focus, status/error announcements, autofill, password visibility controls, and reduced-motion behavior are part of the components.

The exported logo remains isolated at `public/brand/rekann.svg` for later replacement. Decorative images are exported from Figma and kept local. Lucide supplies interface icons for added screens; no external image/font fetches are required at runtime.
