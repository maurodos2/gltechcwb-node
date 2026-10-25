const SUPPLIER_NAME = /\b(?:pauta(?:\s+(?:distribuidora|computadores))?|dicomp)\b/i;
const SUPPLIER_URL = /https?:\/\/(?:www\.)?(?:loja\.)?(?:pauta|dicomp)\.com\.br[^\s<>"']*/gi;

function cleanSupplierText(value) {
  const text = String(value || '');
  if (!SUPPLIER_NAME.test(text) && !/(?:pauta|dicomp)\.com\.br/i.test(text)) return text;

  return text
    .replace(/\b(?:produto(?:s)?\s+)?importad[oa]s?\s+(?:automaticamente\s+)?da\s+(?:pauta(?:\s+distribuidora)?|dicomp)\b(?:\s+para\s+a\s+categoria\s+de\s+ferramentas)?[.:]?/gi, '')
    .replace(/\bgarantia\s+(?:com|pela)\s+(?:a\s+)?pauta\b/gi, '')
    .replace(/\b(?:fonte|origem)\s*:\s*/gi, '')
    .replace(SUPPLIER_URL, '')
    .replace(/\b(?:pauta(?:\s+(?:distribuidora|computadores))?|dicomp)\b/gi, '')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,;:])\s*([.!?])/g, '$2')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/^[,;:.\/\-–|\s]+|[,;:.\/\-–|\s]+$/g, '');
}

function cleanSupplierBrand(value) {
  if (SUPPLIER_NAME.test(String(value || ''))) return '';
  return cleanSupplierText(value);
}

function cleanSupplierSlug(value) {
  const text = String(value || '');
  if (!SUPPLIER_NAME.test(text) && !/(?:pauta|dicomp)\.com\.br/i.test(text)) return text;

  return cleanSupplierText(text)
    .replace(/[^a-z0-9-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function containsSupplierName(value) {
  return SUPPLIER_NAME.test(String(value || ''));
}

module.exports = { cleanSupplierText, cleanSupplierBrand, cleanSupplierSlug, containsSupplierName };