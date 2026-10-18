/**
 * lib/seo.js — SEO técnico & JSON-LD para GLTechCWB (gltechcwb.com)
 *
 * Conforme as regras do Google Search Central para:
 *   • Product (https://developers.google.com/search/docs/appearance/structured-data/product)
 *   • Merchant Listings (shipping & return)
 *   • BreadcrumbList
 *   • LocalBusiness / ElectronicsStore
 *
 * REGRAS CRÍTICAS DO GTIN (causa do erro do Search Console):
 *   • gtin/gtin13/gtin8/gtin14 deve ser um código de barras GLOBALMENTE VÁLIDO.
 *   • EAN-13 = exatamente 13 dígitos numéricos.
 *   • SE NÃO HOUVER UM GTIN VÁLIDO, NÃO INCLUIR O CAMPO. O Google penaliza
 *     valores inventados, SKUs de estoque ou códigos internos como GTIN.
 */

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
// Utilitário: valida se URL é http(s) segura (bloqueia javascript:, data:, etc)
// ---------------------------------------------------------------------------
function isSafeUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Utilitário: valida GTIN EAN-13 (13 dígitos numéricos)
// Retorna o GTIN se válido, ou null se inválido/ausente.
// ---------------------------------------------------------------------------
function validGtin13(barcode) {
  if (!barcode) return null;
  const gtin = String(barcode).trim();
  // EAN-13: exatamente 13 dígitos numéricos
  if (/^\d{13}$/.test(gtin)) return gtin;
  return null;
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

const SITE_NAME = 'GLTechCWB';

const ENRICHMENT = [
  'Produto original com nota fiscal e garantia.',
  'Envio para todo o Brasil.',
  'Parcele em até 12x ou pague no Pix.',
];

// ===========================================================================
// META DESCRIPTIONS
// ===========================================================================

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

// ===========================================================================
// SHIPPING & RETURN (obrigatório para Merchant Listings / Listagens do comerciante)
// ===========================================================================

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

// ===========================================================================
// JSON-LD: Product (página de produto PDP)
// ===========================================================================

/**
 * Gera JSON-LD de Product 100% conforme Google.
 *
 * Regras aplicadas:
 *   • gtin13 incluído APENAS se for EAN-13 válido (13 dígitos numéricos).
 *   • sku obrigatório, nunca vazio.
 *   • images apenas URLs http/https.
 *   • offers.price sempre um número válido (senão omite offers).
 *   • @id e url são URLs absolutas e estáveis.
 *   • Nenhum campo de texto é injetado sem escapeHtml (anti-XSS).
 */
function productJsonLd(product, opts = {}) {
  const { price, pageUrl, inStock } = opts;

  // URL canônica absoluta e segura
  const safePageUrl = isSafeUrl(pageUrl) ? pageUrl.trim() : '/';

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${safePageUrl}#product`,
    name: escapeHtml(product.seoTitle || product.name || 'Produto'),
    url: safePageUrl,
  };

  // Descrição: usa shortDescription ou seoDescription, nunca texto cru do DB sem escape
  if (product.shortDescription) {
    ld.description = escapeHtml(product.shortDescription);
  } else if (product.seoDescription) {
    ld.description = escapeHtml(product.seoDescription);
  } else {
    ld.description = `${escapeHtml(product.name || 'Produto')} — disponível na ${SITE_NAME}.`;
  }

  // SKU: obrigatório para Product. Nunca deixa vazio.
  if (product.sku) {
    ld.sku = escapeHtml(product.sku);
  } else {
    ld.sku = 'sem-sku';
  }

  // Marca: objeto Brand
  if (product.brand) {
    ld.brand = {
      '@type': 'Brand',
      name: escapeHtml(product.brand),
    };
  }

  // Imagens: apenas URLs http/https válidas
  if (product.images && Array.isArray(product.images) && product.images.length) {
    const safeImages = product.images.filter((img) => isSafeUrl(img));
    if (safeImages.length) {
      ld.image = safeImages;
    }
  }

  // GTIN: APENAS se for EAN-13 válido. Caso contrário, OMITE o campo.
  // Isso corrige o erro "Não é um GTIN válido globalmente" do Search Console.
  const gtin = validGtin13(product.barcode);
  if (gtin) {
    ld.gtin13 = gtin;
  }

  // Especificações técnicas como additionalProperty
  if (product.specs && product.specs.size) {
    ld.additionalProperty = Array.from(product.specs.entries()).map(([k, v]) => ({
      '@type': 'PropertyValue',
      name: escapeHtml(String(k)),
      value: escapeHtml(String(v)),
    }));
  }

  // Oferta (preço, estoque, envio, devolução)
  if (price != null && !isNaN(price)) {
    ld.offers = {
      '@type': 'Offer',
      '@id': `${safePageUrl}#offer`,
      url: safePageUrl,
      priceCurrency: 'BRL',
      price: Math.round(Number(price) * 100) / 100, // 2 casas decimais
      availability: inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: {
        '@type': 'Organization',
        name: SITE_NAME,
      },
      ...shippingReturnLd(),
    };
  }

  return ld;
}

// ===========================================================================
// JSON-LD: BreadcrumbList
// ===========================================================================

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

// ===========================================================================
// JSON-LD: Homepage (WebSite + ElectronicsStore + ItemList)
// ===========================================================================

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
      '@id': `${base}/#itemlist`,
      itemListElement: items.map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        item: {
          '@type': 'Product',
          '@id': `${base}/produto/${escapeHtml(p.slug || '')}#product`,
          name: escapeHtml(p.name || ''),
          url: `${base}/produto/${escapeHtml(p.slug || '')}`,
          image: p.images && p.images.length ? p.images.filter(isSafeUrl) : undefined,
          brand: p.brand ? { '@type': 'Brand', name: escapeHtml(p.brand) } : undefined,
          ...(p.__price != null && !isNaN(p.__price)
            ? {
                '@type': 'Offer',
                '@id': `${base}/produto/${escapeHtml(p.slug || '')}#offer`,
                url: `${base}/produto/${escapeHtml(p.slug || '')}`,
                priceCurrency: 'BRL',
                price: Math.round(Number(p.__price) * 100) / 100,
                availability: p.__inStock
                  ? 'https://schema.org/InStock'
                  : 'https://schema.org/OutOfStock',
                itemCondition: 'https://schema.org/NewCondition',
                seller: { '@type': 'Organization', name: SITE_NAME },
                ...shippingReturnLd(),
              }
            : {}),
        },
      })),
    });
  }

  return { '@context': 'https://schema.org', '@graph': graph };
}

// ===========================================================================
// HTML: descrição padrão para produtos com pouco texto (anti-XSS)
// ===========================================================================

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

// ===========================================================================
// JSON-LD: Página de contato (LocalBusiness)
// ===========================================================================

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
  validGtin13,
};
