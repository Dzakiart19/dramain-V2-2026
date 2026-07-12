---
    name: ExoClick VAST popup timing
    description: Why a VAST-resolved popup ad silently never opens, and the fix (open blank tab synchronously, fill URL after async resolve).
    ---

    Two ExoClick zones (5972886, 5972892) configured for this project turned out to be VAST <Wrapper> tags whose target is a popup/redirect landing page (one to a smartpop network, one to sexchatters.com), not a real playable <InLine> video. Decision made: treat them as a "direct link" popup opened once per session on first click, same pattern as the old Adsterra direct-link.

    **Bug hit:** first implementation did `await fetch(vastUrl)` (to parse the XML and extract the wrapper target) and only called `window.open(target, "_blank")` after that resolved. Browsers only treat `window.open` as user-gesture-triggered if it runs synchronously inside the click handler; once you `await` anything first, the gesture context is lost and the popup is blocked silently (no console error, no exception) — banners/other ad units on the same page still work fine, making it look like "only some ads work."

    **Fix applied:** call `window.open("", "_blank", "noopener,noreferrer")` synchronously as the very first thing in the click handler (opens a blank tab, which still counts as user-gesture-triggered), then resolve the VAST target asynchronously and set `popup.location.href = target` once known. Close the blank popup if resolution fails or returns no target.

    **Why:** any future ad/redirect flow that needs a network round-trip before knowing the destination URL must follow this same open-blank-then-redirect pattern, or the popup will be invisibly blocked.

    **How to apply:** any `window.open` that depends on an async result (fetch, VAST parse, ad SDK callback) inside a click handler — open the tab synchronously first, redirect it later.
    