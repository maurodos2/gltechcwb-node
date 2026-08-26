document.addEventListener('DOMContentLoaded', () => {
  // Atualizar badge do carrinho no header
  updateCartBadge();

  // Botões de quantidade
  document.querySelectorAll('.cart-qty-change').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const index = parseInt(btn.dataset.index, 10);
      const action = btn.dataset.action;

      try {
        const res = await fetch('/api/cart', { credentials: 'same-origin' });
        const cart = await res.json();

        if (!cart.items[index]) return;

        let newQty = cart.items[index].quantity;
        if (action === 'increase') newQty++;
        else if (action === 'decrease') newQty--;

        const updateRes = await fetch('/api/cart/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ index, quantity: newQty }),
        });

        const data = await updateRes.json();
        if (data.success) location.reload();
      } catch (err) {
        console.error(err);
      }
    });
  });

  // Botões de remover
  document.querySelectorAll('.cart-remove').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const index = parseInt(btn.dataset.index, 10);

      try {
        const res = await fetch('/api/cart/remove', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ index }),
        });

        const data = await res.json();
        if (data.success) location.reload();
      } catch (err) {
        console.error(err);
      }
    });
  });

  // Botão "Adicionar ao carrinho" na página de produto
  const addBtn = document.querySelector('.btn-add-cart');
  if (addBtn) {
    addBtn.addEventListener('click', async () => {
      const productId = addBtn.dataset.productId;
      const hasVariants = addBtn.dataset.hasVariants === 'true';

      let variantId = null;
      if (hasVariants) {
        const selectedChip = document.querySelector('.variant-chip.is-selected');
        if (selectedChip) {
          // Buscar o ID da variante selecionada
          const variantData = document.getElementById('variant-data');
          if (variantData) {
            const variants = JSON.parse(variantData.textContent);
            const index = parseInt(selectedChip.dataset.index, 10);
            if (variants[index] && variants[index]._id) {
              variantId = variants[index]._id;
            }
          }
        }
      }

      try {
        addBtn.disabled = true;
        addBtn.textContent = 'Adicionando...';

        const res = await fetch('/api/cart/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ productId, variantId, quantity: 1 }),
        });

        const data = await res.json();

        if (data.success) {
          updateCartBadge(data.totalItems);
          addBtn.textContent = '✓ Adicionado!';
          addBtn.classList.add('btn--success');
          setTimeout(() => {
            addBtn.textContent = 'Adicionar ao carrinho';
            addBtn.classList.remove('btn--success');
            addBtn.disabled = false;
          }, 2000);
        } else {
          addBtn.textContent = data.error || 'Erro ao adicionar';
          addBtn.disabled = false;
          setTimeout(() => {
            addBtn.textContent = 'Adicionar ao carrinho';
          }, 3000);
        }
      } catch (err) {
        console.error(err);
        addBtn.textContent = 'Erro. Tente novamente.';
        addBtn.disabled = false;
      }
    });
  }
});

function updateCartBadge(count) {
  const badge = document.getElementById('cart-count');
  if (!badge) return;

  if (count !== undefined) {
    badge.textContent = count;
    badge.style.display = count > 0 ? 'flex' : 'none';
    return;
  }

  // Buscar contagem do servidor
  fetch('/api/cart', { credentials: 'same-origin' })
    .then((res) => res.json())
    .then((cart) => {
      const total = (cart.items || []).reduce((sum, i) => sum + i.quantity, 0);
      badge.textContent = total;
      badge.style.display = total > 0 ? 'flex' : 'none';
    })
    .catch(() => {});
}
