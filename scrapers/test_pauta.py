"""
Script de teste para scraper da Pauta
Testa a conexão e extrai produtos do catálogo
"""
import os
import sys

# Adiciona o diretório pai ao path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scrapers.pauta_scraper import PautaScraper
from dotenv import load_dotenv

load_dotenv()


def test_pauta_single():
    """Testa conexão e extrai produto da Pauta"""
    print("\n" + "=" * 80)
    print("TESTANDO PAUTA DISTRIBUIÇÃO - PRODUTO ÚNICO")
    print("=" * 80)

    username = os.getenv('PAUTA_USERNAME')
    password = os.getenv('PAUTA_PASSWORD')

    if not username or not password:
        print("❌ Credenciais da Pauta não encontradas no .env")
        return False

    scraper = PautaScraper(username, password, None)

    # Tenta login
    if not scraper._login():
        print("❌ Falha ao login na Pauta")
        return False

    print("✅ Login realizado com sucesso")

    # Extrai um produto de exemplo
    print("\nExtraindo produto de exemplo...")
    product = scraper.scrape_product(
        'https://pauta.com.br/cabo-rede-lan-furukawa-sohoplus-cat6-uutp-cmx-azul-claro-certificado-cx-305m-4',
        'Pauta'
    )

    if product:
        print("✅ Produto extraído com sucesso:")
        print(f"  SKU: {product.get('sku_interno')}")
        print(f"  Título: {product.get('titulo')[:100]}...")
        print(f"  Preço: R$ {product.get('preco_custo', 0)}")
        print(f"  Imagens: {len(product.get('imagens', []))}")
        for img in product.get('imagens', [])[:3]:
            print(f"    - {img.get('caminho_local', 'N/A')}")
        return True
    else:
        print("❌ Falha ao extrair produto")
        return False


def main():
    """Função principal de teste"""
    print("\n" + "=" * 80)
    print("TESTE DE SCRAPERS PAUTA - GLTECHCWB")
    print("=" * 80)

    # Testa Pauta
    pauta_ok = test_pauta_single()

    # Relatório final
    print("\n" + "=" * 80)
    print("RELATÓRIO FINAL")
    print("=" * 80)
    print(f"Pauta: {'✅ OK' if pauta_ok else '❌ ERRO'}")
    print("=" * 80)

    return pauta_ok


if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)
