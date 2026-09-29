# Leaves interaction review

Target: https://preview-f3d09c858192da81b6d6.rekann.app/w/pavel-hub/leaves

Use the existing Demo employees. These checks are intentionally left for owner manual testing.

- [ ] Week and Month: click a leave or closure chip. Check compact text, employee, date range, status, and View request. Close with Escape and by clicking outside.
- [ ] Year: click each available leave, pending approval, and company closure badge. A compact list opens without changing the calendar view. Open a request from its row.
- [ ] Dropdowns: check calendar mode, employee search, leave type, policy fields, and AI model. Selected items have a fill and thin check, with no green border. Open near the bottom of a dialog and scroll the menu: nothing clips. Click elsewhere and reopen.
- [ ] Keyboard: Tab to a dropdown, open it, move with arrows, select with Enter, then close with Escape. Keyboard focus remains visible. Escape from a popup must not discard its parent form.
- [ ] Calendar picker: choose a week, month, and year; navigate across December/January and February. Week retains its two-week window; Year retains black month headings.
- [ ] Record time off and company closure: select a date range, including across months. The selection has no horizontal gaps. Cancel preserves the previous dates. Apply saves both dates. Try an invalid typed date and an end before the start: Apply stays disabled.
- [ ] Record time off: switch between Demo employees and leave types. The balance names the selected employee and type, shows its period, and updates Available, This time off, and After recording. Pending requests are excluded from available balance.
- [ ] Attachment: upload a PDF, PNG, or JPG, replace it, and remove it. Try an unsupported file or one over 20 MB. Required attachments still block saving when absent. Use a harmless sample file if recording actual demo time off.
- [ ] Assistant: open the drawer, check stacked prompts and the bottom composer, open context/model menus, send a short Team Directory question, and open the full AI page. No horizontal clipping; full-page layout remains usable.
- [ ] Repeat the dropdown, date range, and Assistant checks on a narrow screen. Scroll long content and verify the close and action buttons remain reachable.

Automated verification for this change is limited to dependency integrity, TypeScript, and the staging build, at the owner's request. Browser and end-to-end acceptance remain manual.

## Scrollbar and toolbar follow-up

- [ ] Record time off: scroll from employee selection to balance details. The scrollbar must stay outside inputs, dropdowns, textarea, and balance cards. Header and footer remain reachable without overlap.
- [ ] Check one other long dialog (policy setup, employee edit, or AI settings). Scrollbar separation follows the same shared rule. Resizing should not put the rail over content.
- [ ] Calendar toolbar: date selector, Week/Month/Year dropdown, arrows, and Today have equal height. On mobile, controls wrap without clipping.
- [ ] Navigate to an earlier date, click Today, and check that the current period returns while Week/Month/Year mode stays unchanged. Repeat in all three modes.
- [ ] Review the proposed popovers and light Week grid in Figma separately; these visual proposals are not live yet.
