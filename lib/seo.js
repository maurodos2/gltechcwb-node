const SITE_NAME = 'GLTechCWB';

// ---------------------------------------------------------------------------
// Utilitário: escapa HTML para prevenir XSS
// ---------------------------------------------------------------------------
function escapeHtml(text) {
  if (text == null) return '';
  const s = String(text);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ---------------------------------------------------------------------------
// Utilitário: valida URL segura (apenas http/https)
// ---------------------------------------------------------------------------
function isSafeUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Utilitário: trunca texto sem cortar palavra no meio
// ---------------------------------------------------------------------------
function truncate(text, max) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return (sp > 0 ? cut.slice(0, sp) : cut).trimEnd() + '…';
}

const ENRICHMENT = [
  'Produto original com nota fiscal e garantia.',
  'Envio para todo o Brasil.',
  'Parcele em até 12x ou pague no Pix.',
];

// Meta description do produto (120–150 caracteres)
function productMetaDescription(product, opts = {}) {
  const price = opts.price;
  const formatPrice = opts.formatPrice;
  const nome = escapeHtml(
    (product.seoTitle || product.name || '').replace(/\s+/g, ' ').trim()
  );
  const preco = price != null && formatPrice ? ` por ${formatPrice(price)}` : '';

  const sufixo = `${preco}. Compre em até 12x na GLTechCWB com garantia.`;
  const limiteSufixo = sufixo.length;
  const limiteNome = Math.max(8, 150 - limiteSufixo);

  let base = `${truncate(nome, limiteNome)}${sufixo}`;
  if (base.length < 120) {
    for (const frase of ENRICHMENT) {
      if (base.length >= 120) break;
      const add = ` ${frase}`;
      if (base.length + add.length <= 150) base += add;
    }
  }
  if (base.length > 150) base = base.slice(0, 147).trimEnd() + '…';
  return base;
}

// Meta description do catálogo
function catalogMetaDescription(opts = {}) {
  const { categoryName, total, q } = opts;
  let lead;
  if (categoryName) {
    lead = `${escapeHtml(categoryName)} — ${total} produto${total === 1 ? '' : 's'} com ótimos preços.`;
  } else if (q) {
    const safeQ = escapeHtml(String(q));
    lead = `Resultados da busca por "${safeQ}": ${total} produto${total === 1 ? '' : 's'} encontrado${total === 1 ? '' : 's'}.`;
  } else {
    lead = 'Conheça as melhores marcas de informática com preço justo.';
  }
  const cta = ' Compre em até 12x na GLTechCWB com garantia e envio para todo o Brasil.';
  let base = `${lead}${cta}`;
  if (base.length > 150) base = truncate(base, 150);
  return base;
}

// Detalhes de envio + devolução (Google Merchant Listings)
function shippingReturnLd() {
  return {
    shippingDetails: {
      '@type': 'OfferShippingDetails',
      shippingDestination: {
        '@type': 'DefinedRegion',
        addressCountry: 'BR',
      },
      shippingRate: {
        '@type': 'MonetaryAmount',
        currency: 'BRL',
        value: 17.9,
      },
      deliveryTime: {
        '@type': 'ShippingDeliveryTime',
        handlingTime: {
          '@type': 'QuantitativeValue',
          minValue: 1,
          maxValue: 1,
          unitCode: 'DAY',
        },
        transitTime: {
          '@type': 'QuantitativeValue',
          minValue: 2,
          maxValue: 12,
          unitCode: 'DAY',
        },
      },
    },
    hasMerchantReturnPolicy: {
      '@type': 'MerchantReturnPolicy',
      applicableCountry: 'BR',
      returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
      merchantReturnDays: 7,
      returnMethod: 'https://schema.org/ReturnByMail',
      returnFees: 'https://schema.org/FreeReturn',
    },
  };
}

// JSON-LD do produto (página de produto)
function productJsonLd(product, opts = {}) {
  const { price, pageUrl, inStock } = opts;

  // Sanitiza pageUrl
  const safePageUrl = isSafeUrl(pageUrl) ? pageUrl : '/';

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${safePageUrl}#product`,
    name: escapeHtml(product.seoTitle || product.name || ''),
    description: escapeHtml(
      product.shortDescription ||
        product.seoDescription ||
        `${product.name} — disponível na ${SITE_NAME}.`
    ),
    sku: escapeHtml(product.sku || ''),
    url: safePageUrl,
  };

  if (product.brand) {
    ld.brand = { '@type': 'Brand', name: escapeHtml(product.brand) };
  }

  // Imagens: apenas URLs http/https válidas
  if (product.images && Array.isArray(product.images)) {
    const safeImages = product.images.filter((img) => isSafeUrl(img));
    if (safeImages.length) ld.image = safeImages;
  }

  // GTIN deve ser EAN-13 (13 dígitos)
  if (product.barcode) {
    const gtin = String(product.barcode).trim();
    if (/^\d{13}$/.test(gtin)) {
      ld.gtin13 = gtin;
    } else {
      console.warn(
        `Produto ${product.sku || product.name}: GTIN inválido (${gtin}), esperado 13 dígitos numéricos`
      );
    }
  }

  if (product.specs && product.specs.size) {
    ld.additionalProperty = Array.from(product.specs.entries()).map(([k, v]) => ({
      '@type': 'PropertyValue',
      name: escapeHtml(String(k)),
      value: escapeHtml(String(v)),
    }));
  }

  if (price != null) {
    ld.offers = {
      '@type': 'Offer',
      url: safePageUrl,
      priceCurrency: 'BRL',
      price: Number(price),
      availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: SITE_NAME },
      ...shippingReturnLd(),
    };
  }
  return ld;
}

// JSON-LD de breadcrumbs
function breadcrumbJsonLd(crumbs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: Array.isArray(crumbs) ? crumbs.map((c) => ({
      '@type': 'ListItem',
      position: Number(c.position) || 0,
      name: escapeHtml(c.name || ''),
      item: isSafeUrl(c.item) ? c.item : '/',
    })) : [],
  };
}

// JSON-LD da homepage
function homeJsonLd(opts = {}) {
  const { siteUrl, phone, email, featured, latest, storeLocal } = opts;
  const base = siteUrl.replace(/\/$/, '');
  const local = storeLocal || {};

  const store = {
    '@type': 'ElectronicsStore',
    '@id': `${base}/#store`,
    name: SITE_NAME,
    url: `${base}/`,
    description: 'Loja de informática em Curitiba: hardware, periféricos e acessórios com entrega para todo o Brasil.',
    priceRange: '$$',
    areaServed: 'Brasil',
    telephone: escapeHtml(phone || ''),
    email: escapeHtml(email || ''),
    address: {
      '@type': 'PostalAddress',
      streetAddress: escapeHtml(local.street || ''),
      addressLocality: escapeHtml(local.city || 'Curitiba'),
      addressRegion: escapeHtml(local.state || 'PR'),
      postalCode: escapeHtml(local.postalCode || ''),
      addressCountry: local.country || 'BR',
    },
  };

  if (local.geoLat && local.geoLng) {
    store.geo = {
      '@type': 'GeoCoordinates',
      latitude: Number(local.geoLat),
      longitude: Number(local.geoLng),
    };
  }

  if (local.openingHours) {
    const DAYS = { Mo: 'Monday', Tu: 'Tuesday', We: 'Wednesday', Th: 'Thursday', Fr: 'Friday', Sa: 'Saturday', Su: 'Sunday' };
    const [range, hours] = String(local.openingHours).split(/\s+/);
    const [, open, close] = (hours || '').match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/) || [];
    const dayList = [];
    (range || '').split(',').forEach((part) => {
      const [a, c] = part.split('-');
      if (!c) { if (DAYS[a]) dayList.push(DAYS[a]); return; }
      const keys = Object.keys(DAYS);
      const i1 = keys.indexOf(a); const i2 = keys.indexOf(c);
      for (let i = i1; i1 >= 0 && i2 >= i1 && i <= i2; i++) dayList.push(DAYS[keys[i]]);
    });
    if (dayList.length && open && close) {
      const spec = {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: dayList,
        opens: open,
        closes: close,
        validFrom: '2024-01-01',
      };
      if (local.openingHoursNote) spec.description = escapeHtml(local.openingHoursNote);
      store.openingHoursSpecification = spec;
    }
  }
  if (email) store.email = escapeHtml(email);

  const website = {
    '@type': 'WebSite',
    '@id': `${base}/#website`,
    url: `${base}/`,
    name: SITE_NAME,
    inLanguage: 'pt-BR',
    publisher: { '@id': `${base}/#store` },
  };

  const graph = [store, website];

  const items = (featured && featured.length ? featured : latest) || [];
  if (items.length) {
    graph.push({
      '@type': 'ItemList',
      itemListElement: items.map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        item: {
          '@type': 'Product',
          name: escapeHtml(p.name || ''),
          description: escapeHtml(
            p.seoDescription ||
            p.shortDescription ||
            `${p.name} — ${(p.brand ? `marca ${escapeHtml(p.brand)}, ` : '')}disponível na GLTechCWB com garantia e envio para todo o Brasil.`
          ),
          url: `${base}/produto/${escapeHtml(p.slug || '')}`,
          image: p.images && p.images.length ? p.images[0] : undefined,
          brand: p.brand ? { '@type': 'Brand', name: escapeHtml(p.brand) } : undefined,
          offers: p.__price != null
            ? {
                '@type': 'Offer',
                url: `${base}/produto/${escapeHtml(p.slug || '')}`,
                priceCurrency: 'BRL',
                price: Number(p.__price),
                availability: p.__inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
                itemCondition: 'https://schema.org/NewCondition',
                seller: { '@type': 'Organization', name: SITE_NAME },
                ...shippingReturnLd(),
              }
            : undefined,
        },
      })),
    });
  }

  return { '@context': 'https://schema.org', '@graph': graph };
}

// Template padrão de descrição (produtos com pouco texto) — TODA saída é escapada
function standardDescriptionHtml(product) {
  const nome = escapeHtml(product.name || 'produto');
  const categoria = product.category && product.category.name ? escapeHtml(product.category.name) : '';
  const marca = escapeHtml(product.brand || 'fabricante');
  const specs = product.specs && product.specs.size
    ? Array.from(product.specs.entries())
    : [];

  const intro = `O <strong>${nome}</strong>${categoria ? `, da categoria ${categoria},` : ''} é uma escolha confiável para quem busca desempenho, durabilidade e bom custo-benefício. Desenvolvido pela <strong>${marca}</strong>, atende desde o uso doméstico até o ambiente profissional, sempre com a garantia de um produto original e acompanhado de nota fiscal.`;

  const paraQuem = [];
  paraQuem.push('Gamer e home office: desempenho estável em jogos, videoconferências e multitarefas do dia a dia.');
  if (categoria) {
    paraQuem.push(`Usuários que precisam de um item da linha "${categoria}" com qualidade e durabilidade.`);
  } else {
    paraQuem.push('Quem busca um componente de qualidade para montar, atualizar ou fazer manutenção do seu computador.');
  }
  paraQuem.push('Profissionais de TI que precisam de confiabilidade para equipamentos em produção.');

  const beneficios = [
    'Produto original, com nota fiscal e garantia do fabricante.',
    'Ótima relação custo-benefício e durabilidade comprovada.',
    'Atendimento técnico especializado antes e depois da compra.',
    'Entrega para todo o Brasil com opção de retirada em Curitiba.',
  ];

  const h = (t) => `<h3>${escapeHtml(t)}</h3>`;
  const ul = (items) => `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`;

  let html = `<p>${intro}</p>`;

  html += `${h('Ficha técnica básica')}<ul>`;
  html += `<li><strong>Marca:</strong> ${marca}</li>`;
  html += `<li><strong>SKU:</strong> ${escapeHtml(product.sku || '—')}</li>`;
  if (specs.length) {
    specs.slice(0, 6).forEach(([k, v]) => {
      html += `<li><strong>${escapeHtml(String(k))}:</strong> ${escapeHtml(String(v))}</li>`;
    });
  }
  html += `</ul>`;

  html += `${h('Para quem é indicado')}${ul(paraQuem)}`;
  html += `${h('Benefícios do produto')}${ul(beneficios)}`;
  html += `${h('Garantia')}<p>Este produto é um item original, comercializado com nota fiscal e coberto pela garantia contra defeitos de fabricação. Sujeito às condições da política de troca e devolução da ${escapeHtml(SITE_NAME)}.</p>`;

  return html;
}

// Meta description da página de contato
function contactMetaDescription(opts = {}) {
  const { phone, email, whatsapp } = opts;
  const parts = [];
  if (phone) parts.push(`telefone ${escapeHtml(phone)}`);
  if (whatsapp) parts.push(`WhatsApp ${escapeHtml(whatsapp)}`);
  if (email) parts.push(`e-mail ${escapeHtml(email)}`);

  let base = 'Contato GLTechCWB — loja de informática em Curitiba, Água Verde.';
  const add = parts.length ? ` ${parts.join(', ')}.` : ' Atendimento de segunda a sexta, das 08:00 às 18:00.';
  if (base.length + add.length <= 150) base += add;

  return base;
}

// JSON-LD da página de contato
function contactJsonLd(opts = {}) {
  const { siteUrl, phone, email, storeLocal, whatsapp } = opts;
  const base = siteUrl.replace(/\/$/, '');
  const local = storeLocal || {};

  const store = {
    '@context': 'https://schema.org',
    '@type': 'ElectronicsStore',
    '@id': `${base}/#store`,
    name: SITE_NAME,
    url: `${base}/`,
    description: 'Loja de informática em Curitiba: hardware, periféricos e acessórios com entrega para todo o Brasil.',
    priceRange: '$$',
    areaServed: 'Brasil',
    telephone: escapeHtml(phone || ''),
    email: escapeHtml(email || ''),
    address: {
      '@type': 'PostalAddress',
      streetAddress: escapeHtml(local.street || ''),
      addressLocality: escapeHtml(local.city || 'Curitiba'),
      addressRegion: escapeHtml(local.state || 'PR'),
      postalCode: escapeHtml(local.postalCode || ''),
      addressCountry: local.country || 'BR',
    },
  };

  if (local.geoLat && local.geoLng) {
    store.geo = {
      '@type': 'GeoCoordinates',
      latitude: Number(local.geoLat),
      longitude: Number(local.geoLng),
    };
  }

  if (local.openingHours) {
    const DAYS = { Mo: 'Monday', Tu: 'Tuesday', We: 'Wednesday', Th: 'Thursday', Fr: 'Friday', Sa: 'Saturday', Su: 'Sunday' };
    const [range, hours] = String(local.openingHours).split(/\s+/);
    const [, open, close] = (hours || '').match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/) || [];
    const dayList = [];
    (range || '').split(',').forEach((part) => {
      const [a, b] = part.split('-');
      if (!b) { if (DAYS[a]) dayList.push(DAYS[a]); return; }
      const keys = Object.keys(DAYS);
      const i1 = keys.indexOf(a); const i2 = keys.indexOf(b);
      for (let i = i1; i1 >= 0 && i2 >= i1 && i <= i2; i++) dayList.push(DAYS[keys[i]]);
    });
    if (dayList.length && open && close) {
      store.openingHoursSpecification = {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: dayList,
        opens: open,
        closes: close,
      };
    }
  }

  return store;
}

module.exports = {
  productMetaDescription,
  catalogMetaDescription,
  productJsonLd,
  breadcrumbJsonLd,
  homeJsonLd,
  contactMetaDescription,
  contactJsonLd,
  standardDescriptionHtml,
  escapeHtml,
};
