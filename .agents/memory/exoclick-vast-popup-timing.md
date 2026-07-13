---
    name: ExoClick VAST popup timing
    description: Why a VAST-resolved popup ad silently never opens, and the fix (open blank tab synchronously, fill URL after async resolve).
    ---

    Two ExoClick zones (5972886, 5972892) configured for this project turned out to be VAST <Wrapper> tags whose target is a popup/redirect landing page (one to a smartpop network, one to sexchatters.com), not a real playable <InLine> video. Decision made: treat them as a "direct link" popup opened once per session on first click, same pattern as the old Adsterra direct-link.

    **Bug hit:** first implementation did `await fetch(vastUrl)` (to parse the XML and extract the wrapper target) and only called `window.open(target, "_blank")` after that resolved. Browsers only treat `window.open` as user-gesture-triggered if it runs synchronously inside the click handler; once you `await` anything first, the gesture context is lost and the popup is blocked silently (no console error, no exception) — banners/other ad units on the same page still work fine, making it look like "only some ads work."

    **Fix applied:** call `window.open("", "_blank", "noopener,noreferrer")` synchronously as the very first thing in the click handler (opens a blank tab, which still counts as user-gesture-triggered), then resolve the VAST target asynchronously and set `popup.location.href = target` once known. Close the blank popup if resolution fails or returns no target.

    **Why:** any future ad/redirect flow that needs a network round-trip before knowing the destination URL must follow this same open-blank-then-redirect pattern, or the popup will be invisibly blocked.

    **How to apply:** any `window.open` that depends on an async result (fetch, VAST parse, ad SDK callback) inside a click handler — open the tab synchronously first, redirect it later.
    
    **Second bug (2026-07-12):** taking the first `<Wrapper><VASTAdTagURI>` as the final destination is wrong — a Wrapper can chain to another Wrapper before finally reaching `<InLine>` (VAST 3 allows unlimited hops, VAST 4 caps at 5). Opening the first hop's URL just opens another VAST XML document (looks blank/broken in a browser tab), not a landing page.

    **Fix:** recursively fetch and follow `VASTAdTagURI` server-side until the response has no more wrapper (i.e. it's `<InLine>`), collecting every hop's `<Impression>` pixels along the way, then extract `<ClickThrough>` (fallback `<MediaFile>`) from the final InLine as the real target URL.

    **How to apply:** any VAST/wrapper-style ad integration must chase the full wrapper chain to InLine before treating any URL as a "real" destination — never assume the first VASTAdTagURI is final.
    
    **Third finding (2026-07-13):** the two "VAST" zones (idz/idzone params) turned out to be low-fill popunder/direct-link inventory, not real reliable video ad inventory — chasing the wrapper chain correctly still often returned no-fill. Switched the in-player pre-roll to reuse the same ExoClick "Outstream Video" `<ins data-zoneid>` + `AdProvider.push({serve:{}})` snippet already proven reliable elsewhere on the page (100% "ad request completed successfully" in every test), dynamically inserted into the player container at pre-roll trigger time instead of relying on VAST fetch. Confirmed working end-to-end with the user.

    **How to apply:** for ExoClick (and likely similar ad-provider.js networks), prefer the standard `<ins>+AdProvider.push` display/outstream zones for guaranteed-fill placements; treat raw VAST tag zones as unreliable/secondary unless proven otherwise. Multiple `AdProvider.push` calls per pageview for dynamically-inserted `<ins>` elements are supported (not one-serve-per-zone-per-page).
    