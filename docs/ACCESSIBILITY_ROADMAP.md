# BranchForge Accessibility & Responsivity Roadmap

> Last updated: April 7, 2026
> Analysis of current UI/UX accessibility and responsive design implementation
> Focus on WCAG 2.1 compliance and cross-device usability

## Summary

- **Accessibility Audit Status**: Not conducted
- **WCAG 2.1 Compliance Level**: Unknown (requires audit)
- **Current Responsivity**: Partially implemented (some components responsive, many fixed)
- **Priority Level**: High

---

## Current State Assessment

### Accessibility Issues

#### Keyboard Navigation

- ❌ Tab order not optimized for complex forms
- ❌ No visible focus indicators on many interactive elements
- ❌ Skip navigation links missing
- ❌ Modal dialogs may not trap focus properly
- ⚠️ Keyboard shortcuts exist but are not documented

#### Screen Reader Support

- ❌ ARIA labels missing on many interactive elements
- ❌ Form error messages not properly announced
- ❌ Dynamic content updates (React Query states) not announced
- ❌ Icon-only buttons lack `aria-label` attributes
- ⚠️ Some components have proper labels (e.g., CharacterDialog.tsx forms)

#### Visual Accessibility

- ❌ Color contrast not validated (WCAG AA requires 4.5:1 for text)
- ❌ Text resizing may break layout (not using relative units consistently)
- ❌ No high contrast mode support
- ⚠️ Dark mode exists but contrast not validated

#### Forms and Input

- ❌ Required field indicators may not be clear to screen readers
- ❌ Form validation error messages not associated with inputs via `aria-describedby`
- ❌ Date/time inputs may not be accessible
- ⚠️ Zod validation schemas exist but accessibility implementation varies

---

### Responsivity Issues

#### Breakpoint Coverage

- ⚠️ Mobile (< 768px): Partially implemented
  - ✅ Navigation collapses to hamburger menu
  - ❌ Many tables don't scroll horizontally
  - ❌ Forms overflow on small screens
  - ❌ Dialogs may not fit on small viewports

- ⚠️ Tablet (768px - 1024px): Poor support
  - ❌ Many layouts use fixed widths
  - ❌ Grid columns don't collapse appropriately
  - ❌ Sidebar navigation may not collapse

- ⚠️ Desktop (> 1024px): Generally good
  - ✅ Layout works well on larger screens
  - ⚠️ Some UI elements spaced too far apart on ultra-wide monitors

#### Component-Specific Issues

- ❌ `CharacterDialog.tsx`: Avatar upload area may overflow on mobile
- ❌ `RouteConfigDialog.tsx`: Multiple route configurations may need scrolling
- ❌ `WritingGoalPill.tsx`: Progress bar sizing not responsive
- ❌ `ScriptMode.tsx` / `WriteMode.tsx`: Code editor may not resize properly
- ❌ `GitLabSyncDialog.tsx`: Repository list may need better mobile layout
- ❌ `ZipImportDialog.tsx`: Drag-and-drop area not mobile-friendly
- ❌ Data tables: No horizontal scroll wrapper on mobile
- ❌ Forms: Input fields may be too small for touch targets (minimum 44x44px recommended)

#### Layout Issues

- ❌ Fixed pixel values instead of responsive units (rem, em, %, vw/vh)
- ❌ No container queries for component-based responsiveness
- ❌ Sidebar navigation may overlap content on small screens
- ❌ Modals may not scale properly on mobile devices

---

## Priority Recommendations

### Critical (WCAG Compliance & Basic Usability)

1. **Keyboard Navigation Overhaul**
   - Implement visible focus indicators (2-3px outline, high contrast)
   - Add skip to main content link
   - Ensure proper tab order in dialogs and forms
   - Implement focus trapping for modals
   - Effort: Medium
   - Impact: Critical (WCAG 2.4.3, 2.1.2)

2. **Screen Reader Labels**
   - Add `aria-label` to all icon-only buttons
   - Add `aria-describedby` for form error messages
   - Implement proper heading hierarchy (h1 → h2 → h3)
   - Add landmarks (main, nav, aside) where missing
   - Effort: High
   - Impact: Critical (WCAG 2.4.1, 3.3.2)

3. **Color Contrast Audit**
   - Run automated contrast check across all UI
   - Ensure text meets WCAG AA (4.5:1 for normal, 3:1 for large)
   - Ensure interactive elements meet WCAG AA (3:1)
   - Fix all contrast violations
   - Effort: Medium
   - Impact: High (WCAG 1.4.3)

### High Priority (User Experience)

4. **Mobile Responsivity**
   - Add horizontal scroll wrappers to all tables
   - Fix dialog sizing for mobile (< 375px width support)
   - Increase touch target sizes (minimum 44x44px)
   - Implement proper mobile layouts for complex forms
   - Effort: High
   - Impact: High (mobile users)

5. **Form Accessibility**
   - Associate all error messages with inputs
   - Ensure required fields are clearly indicated visually and to screen readers
   - Implement proper form validation announcements
   - Add fieldset/legend for related radio/checkbox groups
   - Effort: Medium
   - Impact: High (form usability)

6. **Focus Indicators**
   - Add custom focus styles to all components
   - Ensure focus is visible in both light and dark modes
   - Test keyboard navigation through entire application
   - Effort: Low
   - Impact: High (keyboard users)

### Medium Priority (Enhanced Experience)

7. **Tablet Responsivity**
   - Implement responsive grid layouts (collapse columns)
   - Add container queries for component-level responsiveness
   - Optimize sidebar behavior for tablet viewports
   - Effort: Medium
   - Impact: Medium (tablet users)

8. **Dynamic Content Announcements**
   - Implement ARIA live regions for:
     - Toast notifications
     - Loading states
     - Form validation results
     - Data updates (React Query mutations)
   - Effort: Medium
   - Impact: Medium (screen reader users)

9. **Keyboard Shortcut Documentation**
   - Add keyboard shortcut modal/tooltip
   - Document all existing shortcuts
   - Implement consistent shortcut patterns
   - Add shortcut hints in UI
   - Effort: Low
   - Impact: Medium (power users)

### Lower Priority (Nice-to-Have)

10. **High Contrast Mode**
    - Implement high contrast theme option
    - Ensure all UI elements work in high contrast
    - Support OS-level high contrast preferences
    - Effort: Medium
    - Impact: Low (users with low vision)

11. **Reduced Motion**
    - Support `prefers-reduced-motion` media query
    - Add option to disable animations
    - Ensure content is usable without motion
    - Effort: Low
    - Impact: Low (users with vestibular disorders)

---

## Implementation Order Suggestion

### Phase 1: Critical Accessibility

1. Focus indicators (keyboard navigation)
2. ARIA labels for icon-only buttons
3. Skip navigation link
4. Color contrast audit and fixes

### Phase 2: Mobile Responsivity

5. Table horizontal scrolling
6. Dialog sizing for mobile
7. Touch target sizing
8. Mobile form layouts

### Phase 3: Forms & Screen Readers

9. Form error associations
10. Heading hierarchy
11. Landmark roles
12. Dynamic content announcements

### Phase 4: Enhanced Experience

13. Tablet responsiveness
14. Keyboard shortcuts documentation
15. High contrast mode
16. Reduced motion support

---

## Technical Guidelines

### CSS Custom Properties for Accessibility

Define in global CSS:

```css
:root {
  /* Focus indicators */
  --focus-outline: 2px solid #0056b3;
  --focus-offset: 2px;

  /* Minimum touch targets */
  --touch-target-min: 44px;

  /* Color contrast */
  --text-primary-contrast: 4.5; /* WCAG AA */
  --text-large-contrast: 3; /* WCAG AA large text */
}
```

### Component Checklist

All components must include:

- [ ] Keyboard accessible (tab, enter, escape work)
- [ ] Focus indicators visible
- [ ] ARIA labels for icon-only buttons
- [ ] Form errors associated with inputs
- [ ] Color contrast meets WCAG AA
- [ ] Touch targets minimum 44x44px
- [ ] Responsive layout for mobile/tablet
- [ ] Works with screen reader (NVDA, JAWS, VoiceOver)

### Testing Tools

**Automated Testing:**

- `axe-core` or `@axe-core/react` - Run in CI/CD
- `eslint-plugin-jsx-a11y` - Lint rules for accessibility
- `pa11y` - Headless accessibility testing

**Manual Testing:**

- Keyboard-only navigation
- Screen reader testing (NVDA Windows, VoiceOver Mac, TalkBack Android)
- Color contrast analyzer tools
- Browser zoom levels (100%, 200%, 400%)

**User Testing:**

- Mobile device testing (iOS Safari, Android Chrome)
- Tablet testing (iPad, Android tablets)

---

## Known Component-Specific Issues

### Critical

- `apps/frontend/src/components/CharacterDialog.tsx`
  - Avatar upload area may overflow on mobile
  - Form fields lack error associations

- `apps/frontend/src/components/ZipImportDialog.tsx`
  - Drag-and-drop not mobile-friendly
  - No keyboard alternative for file upload

- `apps/frontend/src/pages/ide/ScriptMode.tsx`
  - Code editor may not resize properly on mobile
  - Table of contents may not be accessible via keyboard

### High Priority

- `apps/frontend/src/components/RouteConfigDialog.tsx`
  - Multiple route configurations need scrolling
  - Form validation errors not announced

- `apps/frontend/src/components/WritingGoalPill.tsx`
  - Progress bar sizing not responsive

- `apps/frontend/src/components/GitLabSyncDialog.tsx`
  - Repository list needs better mobile layout

- All data table components
  - No horizontal scroll wrapper on mobile
  - May overflow viewport

### Medium Priority

- Navigation components
  - Sidebar may overlap content on small screens
  - Hamburger menu keyboard navigation

- Form inputs
  - Inconsistent input sizing
  - Some date/time inputs may not be accessible

---

## Audit Checklist

### Initial Audit (To Complete)

- [ ] Run axe-core automated scan
- [ ] Manual keyboard navigation test
- [ ] Screen reader test with NVDA/JAWS/VoiceOver
- [ ] Color contrast check with Contrast Checker
- [ ] Mobile device testing (iPhone SE, Pixel 5)
- [ ] Tablet testing (iPad, Android tablet)
- [ ] Document all findings

### Ongoing Monitoring

- [ ] Run axe-core in CI/CD pipeline
- [ ] Add accessibility to code review checklist
- [ ] Test new components before merging
- [ ] Regular accessibility audits (quarterly)

---

## Resources

### Standards and Guidelines

- [WCAG 2.1 Quick Reference](https://www.w3.org/WAI/WCAG21/quickref/)
- [WCAG 2.2 Draft](https://www.w3.org/WAI/WCAG22/quickref/)
- [ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/)
- [WebAIM Checklist](https://webaim.org/standards/wcag/checklist)

### Testing Tools

- [axe DevTools Browser Extension](https://www.deque.com/axe/devtools/)
- [WAVE Browser Extension](https://wave.webaim.org/)
- [Lighthouse Accessibility Audit](https://developers.google.com/web/tools/lighthouse)
- [Colour Contrast Analyser (CCA)](https://www.tpgi.com/color-contrast-checker/)

### React-Specific Resources

- [React Accessibility](https://react.dev/reference/react-dom/components/common#accessibility)
- [WAI-ARIA Authoring Practices for React](https://www.w3.org/WAI/ARIA/apg/)
- [Accessible React Components](https://www.deque.com/blog/accessible-react-components/)

### Design Resources

- [Material Design Accessibility](https://material.io/design/usability/accessibility.html)
- [Apple Human Interface Guidelines - Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)
- [Microsoft Fluent UI Accessibility](https://fluent2.microsoft.design/)

---

## Notes

### Accessibility as Technical Debt

Accessibility is not optional - it's a requirement for:

- **Legal Compliance**: WCAG compliance required by law in many jurisdictions
- **User Experience**: Improves usability for all users, not just those with disabilities
- **Market Reach**: Approximately 15% of world population experiences some form of disability
- **Best Practices**: Accessible code is generally better-structured and maintainable

### Performance Impact

Accessibility improvements generally have minimal performance impact:

- ARIA attributes add negligible DOM size
- Focus indicators use CSS (no JS required)
- Proper semantic HTML improves SEO and initial render

### Maintenance Considerations

Once accessibility fixes are implemented:

- Add to code review checklist
- Include in pull request template
- Test in CI/CD with automated tools
- Document accessibility patterns for future development
