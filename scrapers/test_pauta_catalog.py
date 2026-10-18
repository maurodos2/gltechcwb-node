"""
Script de teste rápido para scraping de catálogo da Pauta
"""
import os
import sys
import time

# Adiciona o diretório pai ao path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pauta_scraper import PautaScraper
from dotenv import load_dotenv

load_dotenv()


def test_pauta_catalog():
    """Testa scraping de um catálogo da Pauta"""
    print("\n" + "=" * 80)
    print("TESTE DE CATALOGO PAUTA - VERSÃO RÁPIDA")
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

    # Testa várias URLs de catálogo
    catalog_urls = [
        'https://pauta.com.br/computadores',
        'https://pauta.com.br/produtos/computadores',
        'https://pauta.com.br/eletronicos',
        'https://pauta.com.br/produtos/eletronicos',
    ]

    for catalog_url in catalog_urls:
        print(f"\n{'='*80}")
        print(f"Testando: {catalog_url}")
        print(f"{'='*80}")

        products = scraper.scrape_catalog(catalog_url)

        if products:
            print(f"✅ Encontrados {len(products)} produtos!")
            for idx, product in enumerate(products[:3], 1):
                print(f"\n  Produto {idx}:")
                print(f"    SKU: {product.get('sku_interno')}")
                print(f"    Título: {product.get('titulo', 'N/A')[:60]}...")
                print(f"    Preço: R$ {product.get('preco_custo', 0)}")
                print(f"    Imagens: {len(product.get('imagens', []))}")
            break
        else:
            print(f"❌ Nenhum produto encontrado nesta URL")
            time.sleep(3)

    return True


def main():
    """Função principal"""
    print("\n" + "=" * 80)
    print("TESTE DE CATALOGO PAUTA - GLTECHCWB")
    print("=" * 80)

    success = test_pauta_catalog()

    print("\n" + "=" * 80)
    print("RELATÓRIO FINAL")
    print("=" * 80)
    print(f"Resultado: {'✅ SUCESSO' if success else '❌ FALHA'}")
    print("=" * 80)

    return success


if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)
