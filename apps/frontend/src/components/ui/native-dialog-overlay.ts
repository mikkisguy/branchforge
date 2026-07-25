/**
 * Tailwind classes for a viewport-centered native `<dialog>` overlay.
 *
 * The UA positions `<dialog>` with `width: fit-content` and size caps, so
 * `m-auto` alone leaves modals at the top. A full-viewport flex overlay
 * (`open:fixed`, `open:w-full`, `open:h-full`, `open:items-center`,
 * `open:justify-center`) centers content without transforms (transforms
 * break viewport-fixed portaled children).
 *
 * Use `hidden` + `open:flex` so closed dialogs stay hidden — an unconditional
 * `flex` would override the UA `dialog:not([open]) { display: none }`.
 */
export const nativeDialogOverlayClassName =
  "hidden open:flex open:fixed open:inset-0 open:w-full open:h-full open:max-w-none open:max-h-none open:items-center open:justify-center m-0 border-0 p-0 bg-transparent text-[hsl(var(--foreground))]";
