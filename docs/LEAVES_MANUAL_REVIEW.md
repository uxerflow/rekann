# Leaves interaction review

Target: https://preview-f3d09c858192da81b6d6.rekann.app/w/pavel-hub/leaves

Use the existing Demo employees. These checks are intentionally left for owner manual testing.

- [ ] Week and Month: open an approved leave. Employee and Approved status appear first, followed by leave type, Dates, Duration, and a full-width View request button. The button opens that request.
- [ ] Open a pending leave. The status reads Pending; the primary Review request button opens the correct request.
- [ ] Open a company closure. Check the policy name, dates, and Applies to. View policy opens that closure policy; close it without saving when only reviewing.
- [ ] Check a long employee name, half-day request, and a date range across months. Text wraps without overlapping status or leaving the popover. Escape and clicking outside close it; the popover stays within the viewport.
- [ ] Week: grid lines are faint, continuous, and aligned with employee rows. Scroll down and sideways; the People column stays opaque and its right border continues to the bottom.
- [ ] Week chips: annual, sick, unpaid, maternity, and paternal leave show their Figma icons. Pending leave retains a dashed border. Open a chip and confirm the existing detail popover still works.
- [ ] Navigate to a period without leave. The 48 px calendar icon, No leave this week, and supporting copy are centered over the calendar; people and dates remain visible. When no requests are pending, the sidebar shows the text-only All caught up state.
- [ ] Today returns to the workspace date. Switching Week, Month, and Year preserves the existing navigation behavior.
- [ ] Year: click each available leave, pending approval, and company closure badge. A compact list opens without changing the calendar view. Open a request from its row.
- [ ] Dropdowns: check calendar mode, employee search, leave type, policy fields, and AI model. Selected items have a fill and thin check, with no green border. Open near the bottom of a dialog and scroll the menu: nothing clips. Click elsewhere and reopen.
- [ ] Keyboard: Tab to a dropdown, open it, move with arrows, select with Enter, then close with Escape. Keyboard focus remains visible. Escape from a popup must not discard its parent form.
- [ ] Calendar picker: choose a week, month, and year; navigate across December/January and February. Week shows exactly seven days, Monday through Sunday; Year retains black month headings.
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
- [ ] Compare Week against the updated Figma review: stronger employee separators on the left, faint central grid, compact pending cards, and readable single-day chips. All chips retain their icons, including single-day Sick leave. Labels use Inter Medium 13/20. Hover reveals the full name and dates.

## Year date popovers

- [ ] In Year, click a date with dots. Its dated popover opens and the calendar stays in Year.
- [ ] Check the legend: red is approved leave, yellow is pending approval, blue is company closure. A mixed date uses the matching dot for each row.
- [ ] Click a date without events; it shows a short empty message without switching views.
- [ ] Month badges open compact 320 px lists. Check long names, dates crossing months, Escape, outside click, and scrolling a long list.
