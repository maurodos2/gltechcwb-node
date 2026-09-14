const SITE_NAME = 'GLTechCWB';

// Trunca um texto no total max caracteres sem cortar palavra no meio (busca o
// último espaço antes do limite).
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

// Monta uma meta description com 120–150 caracteres: puxa do nome do produto,
// do preço (ou parcelamento) e de uma chamada para ação, completando o mínimo
// com frases de enriquecimento quando necessário.
function productMetaDescription(product, opts = {}) {
  const price = opts.price;
  const formatPrice = opts.formatPrice;
  const nome = (product.seoTitle || product.name || '').replace(/\s+/g, ' ').trim();
  const preco = price != null && formatPrice ? ` por ${formatPrice(price)}` : '';

  // Sufixo fixo com a chamada para ação — garante que o CTA nunca é cortado.
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

function catalogMetaDescription(opts = {}) {
  const { categoryName, total, q } = opts;
  let lead;
  if (categoryName) {
    lead = `${categoryName} — ${total} produto${total === 1 ? '' : 's'} com ótimos preços.`;
  } else if (q) {
    lead = `Resultados da busca por "${q}": ${total} produto${total === 1 ? '' : 's'} encontrado${total === 1 ? '' : 's'}.`;
  } else {
    lead = 'Conheça as melhores marcas de informática com preço justo.';
  }
  const cta = ' Compre em até 12x na GLTechCWB com garantia e envio para todo o Brasil.';
  let base = `${lead}${cta}`;
  if (base.length > 150) base = truncate(base, 150);
  return base;
}

// Product JSON-LD completo e válido para a página de produto.
// price null (produto com variantes sem mínimo calculado) suprime o bloco
// offers — evita JSON-LD inválido no Google.
function productJsonLd(product, opts = {}) {
  const { price, pageUrl, inStock } = opts;
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${pageUrl}#product`,
    name: product.seoTitle || product.name,
    description:
      product.shortDescription || product.seoDescription || `${product.name} — disponível na ${SITE_NAME}.`,
    sku: product.sku,
    url: pageUrl,
  };
  if (product.brand) ld.brand = { '@type': 'Brand', name: product.brand };
  if (product.images && product.images.length) ld.image = product.images;
  if (product.barcode) ld.gtin13 = product.barcode;
  if (product.specs && product.specs.size) {
    ld.additionalProperty = Array.from(product.specs.entries()).map(([k, v]) => ({
      '@type': 'PropertyValue',
      name: String(k),
      value: String(v),
    }));
  }
  if (price != null) {
    ld.offers = {
      '@type': 'Offer',
      url: pageUrl,
      priceCurrency: 'BRL',
      price,
      availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: SITE_NAME },
    };
  }
  return ld;
}

function breadcrumbJsonLd(crumbs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c) => ({
      '@type': 'ListItem',
      position: c.position,
      name: c.name,
      item: c.item,
    })),
  };
}

// JSON-LD da homepage: WebSite + LocalBusiness (loja de informática) + ItemList
// (Product dos destaques). Endereços/horário vem de res.locals.storeLocal
// (config em server.js) — não inventar dados aqui.
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
    telephone: phone,
    email,
    address: {
      '@type': 'PostalAddress',
      streetAddress: local.street,
      addressLocality: local.city || 'Curitiba',
      addressRegion: local.state || 'PR',
      postalCode: local.postalCode,
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
    // Formato: "Mo-Fr 08:00-18:00" (dias podem ser Mo,Tu,We,Th,Fr,Sa,Su,
    // com ou sem range "Mo-Fr"). Expande para nomes por extenso do schema.
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
      if (local.openingHoursNote) spec.description = local.openingHoursNote;
      store.openingHoursSpecification = spec;
    }
  }
  if (email) store.email = email;

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
          name: p.name,
          url: `${base}/produto/${p.slug}`,
          image: p.images && p.images.length ? p.images[0] : undefined,
          brand: p.brand ? { '@type': 'Brand', name: p.brand } : undefined,
          offers: p.__price != null
            ? {
                '@type': 'Offer',
                url: `${base}/produto/${p.slug}`,
                priceCurrency: 'BRL',
                price: p.__price,
                availability: p.__inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
              }
            : undefined,
        },
      })),
    });
  }

  return { '@context': 'https://schema.org', '@graph': graph };
}

// Template padrão de descrição para produtos com pouco texto:
// Ficha Técnica Básica, Para quem é indicado, Benefícios e Garantia.
function standardDescriptionHtml(product) {
  const nome = product.name || 'produto';
  const categoria = product.category && product.category.name ? product.category.name : '';
  const marca = product.brand || 'fabricante';
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

  const h = (t) => `<h3>${t}</h3>`;
  const ul = (items) => `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;

  let html = `<p>${intro}</p>`;

  html += `${h('Ficha técnica básica')}<ul>`;
  html += `<li><strong>Marca:</strong> ${marca}</li>`;
  html += `<li><strong>SKU:</strong> ${product.sku || '—'}</li>`;
  if (specs.length) {
    specs.slice(0, 6).forEach(([k, v]) => {
      html += `<li><strong>${k}:</strong> ${v}</li>`;
    });
  }
  html += `</ul>`;

  html += `${h('Para quem é indicado')}${ul(paraQuem)}`;
  html += `${h('Benefícios do produto')}${ul(beneficios)}`;
  html += `${h('Garantia')}<p>Este produto é um item original, comercializado com nota fiscal e coberto pela garantia contra defeitos de fabricação. Sujeito às condições da política de troca e devolução da ${SITE_NAME}.</p>`;

  return html;
}

module.exports = {
  productMetaDescription,
  catalogMetaDescription,
  productJsonLd,
  breadcrumbJsonLd,
  homeJsonLd,
  standardDescriptionHtml,
};