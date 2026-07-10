/**
 * Utilitas kecil yang dipakai lintas halaman (home & watch).
 */
export function esc(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function showToast(msg, ms = 3000) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add("hidden"), ms);
}

/** Bikin N placeholder skeleton untuk state loading pada grid/row. */
export function skeletonCards(n) {
  return Array(n).fill("").map(() => `
    <div class="drama-card is-skeleton" tabindex="-1">
      <div class="cover-wrap"></div>
    </div>`).join("");
}
