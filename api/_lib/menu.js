// Renders menu.json into the menu markup of index.html.
// Each category's items live between <!-- ZORI-MENU:<id> --> and <!-- /ZORI-MENU:<id> -->.

const PRICE_RE = /^\d{1,4}([.,]\d{1,2})?$/;
const LIMITS = { name: 120, qty: 40, ingredients: 1000, allergens: 200, small: 20, title: 80 };

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// *text* marks an allergen inside the ingredient list and renders bold.
function richText(s) {
  return esc(s).replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
}

function weight(item) {
  const price = String(item.price).replace('.', ',') + ' lei';
  return item.qty ? `${esc(item.qty)} · ${price}` : price;
}

function row(item) {
  return `<div class="item-row"><span class="item-name">${esc(item.name)}</span><span class="leader" aria-hidden="true"></span><span class="item-weight">${weight(item)}</span></div>`;
}

function facts(item) {
  if (!item.kcal) return [];
  return [
    `<span><b>${esc(item.kcal)}</b> kcal/${esc(item.per || '100g')}</span>`,
    `<span><b>${esc(item.protein)}</b> proteine</span>`,
    `<span><b>${esc(item.fat)}</b> grasimi</span>`,
    `<span><b>${esc(item.carbs)}</b> carbohidrati</span>`,
  ];
}

function renderFull(item) {
  const out = [
    '  <div class="item">',
    '    <div class="item-row">',
    `      <span class="item-name">${esc(item.name)}</span>`,
    '      <span class="leader" aria-hidden="true"></span>',
    `      <span class="item-weight">${weight(item)}</span>`,
    '    </div>',
  ];
  if (item.ingredients) out.push(`    <p class="item-ingredients">${richText(item.ingredients)}</p>`);
  const f = facts(item);
  if (f.length) out.push('    <div class="item-facts">', ...f.map((x) => '      ' + x), '    </div>');
  if (item.allergens) out.push(`    <div class="item-allergens">${esc(item.allergens)}</div>`);
  out.push('  </div>', '');
  return out.join('\n');
}

function renderCompact(item) {
  const f = facts(item);
  if (!item.ingredients && !f.length && !item.allergens) {
    return `  <div class="item-compact">${row(item)}</div>`;
  }
  const out = ['', '  <div class="item-compact">', '    ' + row(item)];
  if (item.ingredients) out.push(`    <p class="item-ingredients">${richText(item.ingredients)}</p>`);
  if (f.length) out.push(`    <div class="item-facts">${f.join('')}</div>`);
  if (item.allergens) out.push(`    <div class="item-allergens">${esc(item.allergens)}</div>`);
  out.push('  </div>');
  return out.join('\n');
}

function renderCategory(cat) {
  const parts = [];
  for (const sec of cat.sections) {
    if (sec.title) parts.push('', `  <p class="sub-title">${esc(sec.title)}</p>`);
    if (sec.promoHtml) parts.push(sec.promoHtml);
    for (const item of sec.items) parts.push(cat.style === 'full' ? renderFull(item) : renderCompact(item));
  }
  return parts.join('\n') + '\n';
}

function applyToIndex(indexHtml, menu) {
  let html = indexHtml;
  for (const cat of menu.categories) {
    const open = `<!-- ZORI-MENU:${cat.id} -->`;
    const close = `<!-- /ZORI-MENU:${cat.id} -->`;
    const a = html.indexOf(open);
    const b = html.indexOf(close);
    if (a < 0 || b < a) throw new Error(`Lipseste zona de meniu pentru ${cat.id} in index.html`);
    html = html.slice(0, a + open.length) + '\n' + renderCategory(cat) + '  ' + html.slice(b);
  }
  return html;
}

// Control characters and bidi overrides (which can visually reverse text) never belong in a menu.
const INVISIBLE = [[0x00, 0x1f], [0x7f, 0x9f], [0x200b, 0x200f], [0x202a, 0x202e], [0x2066, 0x2069], [0xfeff, 0xfeff]];
const stripInvisible = (s) =>
  Array.from(s, (ch) => (INVISIBLE.some(([a, b]) => ch.codePointAt(0) >= a && ch.codePointAt(0) <= b) ? ' ' : ch)).join('');
const MAX_SECTIONS = 40;
const MAX_ITEMS_PER_SECTION = 150;

function str(v, max, field, errors, required) {
  if (v == null) v = '';
  if (typeof v !== 'string') { errors.push(`${field}: valoare invalida`); return ''; }
  v = stripInvisible(v).replace(/ {2,}/g, ' ').trim();
  if (required && !v) errors.push(`${field}: lipseste`);
  if (v.length > max) errors.push(`${field}: prea lung (maxim ${max} caractere)`);
  return v;
}

// Returns a cleaned copy of the menu, or throws with a list of problems.
// Category ids, names, styles and promo blocks come from the current menu, never from the client.
function validate(input, current) {
  const errors = [];
  if (!input || !Array.isArray(input.categories)) throw new Error('Meniu invalid');
  const out = { categories: [] };
  for (const base of current.categories) {
    const cat = input.categories.find((c) => c && c.id === base.id);
    if (!cat || !Array.isArray(cat.sections)) { errors.push(`Lipseste categoria ${base.name}`); continue; }
    const promos = new Map(base.sections.filter((s) => s.promoHtml).map((s) => [s.title, s.promoHtml]));
    if (cat.sections.length > MAX_SECTIONS) { errors.push(`${base.name}: prea multe sectiuni (maxim ${MAX_SECTIONS})`); continue; }
    if (cat.sections.some((s) => !s || (Array.isArray(s.items) && s.items.length > MAX_ITEMS_PER_SECTION))) {
      errors.push(`${base.name}: o sectiune are prea multe produse (maxim ${MAX_ITEMS_PER_SECTION})`);
      continue;
    }
    const sections = cat.sections.map((sec, si) => {
      const title = str(sec.title, LIMITS.title, `${base.name} / sectiunea ${si + 1}`, errors, false) || null;
      const items = (Array.isArray(sec.items) ? sec.items : []).map((raw, ii) => {
        const it = raw && typeof raw === 'object' ? raw : {};
        const where = `${base.name} / ${(typeof it.name === 'string' && it.name.trim()) || 'produsul ' + (ii + 1)}`;
        const price = str(it.price, 10, `${where} / pret`, errors, true);
        if (price && !PRICE_RE.test(price)) errors.push(`${where} / pret: scrie doar cifre, de ex. 9,50`);
        return {
          name: str(it.name, LIMITS.name, `${where} / nume`, errors, true),
          price,
          qty: str(it.qty, LIMITS.qty, `${where} / cantitate`, errors, false),
          ingredients: str(it.ingredients, LIMITS.ingredients, `${where} / ingrediente`, errors, false),
          kcal: str(it.kcal, LIMITS.small, `${where} / kcal`, errors, false),
          per: str(it.per, LIMITS.small, `${where} / kcal per`, errors, false),
          protein: str(it.protein, LIMITS.small, `${where} / proteine`, errors, false),
          fat: str(it.fat, LIMITS.small, `${where} / grasimi`, errors, false),
          carbs: str(it.carbs, LIMITS.small, `${where} / carbohidrati`, errors, false),
          allergens: str(it.allergens, LIMITS.allergens, `${where} / alergeni`, errors, false),
        };
      });
      return { title, promoHtml: (title && promos.get(title)) || null, items };
    });
    out.categories.push({ id: base.id, name: base.name, style: base.style, sections });
  }
  if (errors.length) {
    const e = new Error(errors.slice(0, 10).join('\n'));
    e.status = 400;
    throw e;
  }
  return out;
}

module.exports = { applyToIndex, renderCategory, validate };
