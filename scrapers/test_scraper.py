"""
Script de teste para scrapers
Testa a conexão com os fornecedores e extrai um produto de exemplo
"""
import os
import sys
from dotenv import load_dotenv

# Adiciona o diretório atual ao path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Se estiver rodando como script, adiciona o diretório pai ao path também
current_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from scrapers.pauta_scraper import PautaScraper
from scrapers.dicomp_scraper import DicompScraper

load_dotenv()


def test_pauta():
    """Testa conexão e extrai produto da Pauta"""
    print("\n" + "=" * 80)
    print("TESTANDO PAUTA DISTRIBUIÇÃO")
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
        return True
    else:
        print("❌ Falha ao extrair produto")
        return False


def test_dicomp():
    """Testa conexão e extrai produto do Dicomp"""
    print("\n" + "=" * 80)
    print("TESTANDO DICOMP")
    print("=" * 80)

    username = os.getenv('DICOMP_USERNAME')
    password = os.getenv('DICOMP_PASSWORD')

    if not username or not password:
        print("❌ Credenciais do Dicomp não encontradas no .env")
        return False

    scraper = DicompScraper(username, password, None)

    # Tenta login
    if not scraper._login():
        print("❌ Falha ao login no Dicomp")
        return False

    print("✅ Login realizado com sucesso")

    # Extrai um produto de exemplo
    print("\nExtraindo produto de exemplo...")
    product = scraper.scrape_product(
        'https://www.dicomp.com.br/produto/EXEMPLO',
        'Dicomp'
    )

    if product:
        print("✅ Produto extraído com sucesso:")
        print(f"  SKU: {product.get('sku_interno')}")
        print(f"  Título: {product.get('titulo')[:100]}...")
        print(f"  Preço: R$ {product.get('preco_custo', 0)}")
        print(f"  Imagens: {len(product.get('imagens', []))}")
        return True
    else:
        print("❌ Falha ao extrair produto")
        return False


def main():
    """Função principal de teste"""
    print("\n" + "=" * 80)
    print("TESTE DE SCRAPERS GLTECHCWB")
    print("=" * 80)

    # Testa Pauta
    pauta_ok = test_pauta()

    # Testa Dicomp
    dicomp_ok = test_dicomp()

    # Relatório final
    print("\n" + "=" * 80)
    print("RELATÓRIO FINAL")
    print("=" * 80)
    print(f"Pauta: {'✅ OK' if pauta_ok else '❌ ERRO'}")
    print(f"Dicomp: {'✅ OK' if dicomp_ok else '❌ ERRO'}")
    print("=" * 80)

    return pauta_ok and dicomp_ok


if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)
