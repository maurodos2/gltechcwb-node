document.addEventListener('DOMContentLoaded', () => {
  const header = document.querySelector('.site-header');
  const menuToggle = document.querySelector('.menu-toggle');

  if (header && menuToggle) {
    menuToggle.addEventListener('click', () => {
      header.classList.toggle('is-open');
      const open = header.classList.contains('is-open');
      menuToggle.setAttribute('aria-expanded', String(open));
    });
  }

  const sortSelects = document.querySelectorAll('[data-auto-submit]');
  sortSelects.forEach((select) => {
    select.addEventListener('change', () => {
      if (select.form) select.form.submit();
    });
  });

  const galleryMain = document.querySelector('.gallery__main img');
  const thumbs = document.querySelectorAll('.gallery__thumb');

  if (galleryMain && thumbs.length) {
    thumbs.forEach((thumb) => {
      thumb.addEventListener('click', () => {
        const img = thumb.querySelector('img');
        if (!img) return;
        galleryMain.src = img.src;
        thumbs.forEach((t) => t.classList.remove('is-active'));
        thumb.classList.add('is-active');
      });
    });
  }

  setupVariants();
});

function setupVariants() {
  const dataEl = document.getElementById('variant-data');
  const listEl = document.querySelector('.variant-list');

  if (!dataEl || !listEl) return;

  let variants = [];
  try {
    variants = JSON.parse(dataEl.textContent);
  } catch (err) {
    return;
  }
  if (!variants.length) return;

  const priceEl = document.querySelector('[data-variant-price]');
  const oldEl = document.querySelector('[data-variant-old]');
  const stockEl = document.querySelector('[data-variant-stock]');
  const buyBtn = document.querySelector('[data-variant-buy]');
  const formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

  function render(index) {
    const variant = variants[index];
    if (!variant) return;

    listEl.querySelectorAll('.variant-chip').forEach((chip, i) => {
      chip.classList.toggle('is-selected', i === index);
    });

    const promo = variant.promoPrice && variant.promoPrice > 0 ? variant.promoPrice : null;
    const current = promo || variant.price;

    if (priceEl) priceEl.textContent = formatter.format(current);
    if (oldEl) {
      if (promo) {
        oldEl.textContent = formatter.format(variant.price);
        oldEl.hidden = false;
      } else {
        oldEl.hidden = true;
      }
    }
    if (stockEl) {
      stockEl.classList.toggle('stock-status--in', variant.stock > 0);
      stockEl.classList.toggle('stock-status--out', variant.stock <= 0);
      stockEl.innerHTML =
        '<span class="dot"></span>' +
        (variant.stock > 0 ? `Em estoque (${variant.stock} un.)` : 'Esgotado');
    }
    if (buyBtn) buyBtn.disabled = variant.stock <= 0;
  }

  listEl.addEventListener('click', (event) => {
    const chip = event.target.closest('.variant-chip');
    if (!chip || chip.disabled) return;
    render(Number(chip.dataset.index));
  });

  let firstAvailable = variants.findIndex((v) => v.stock > 0);
  if (firstAvailable === -1) firstAvailable = 0;
  render(firstAvailable);
}
