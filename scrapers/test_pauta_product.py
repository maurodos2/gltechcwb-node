"""
Script de teste para scraping de produto individual da Pauta
"""
import os
import sys

# Adiciona o diretório pai ao path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pauta_scraper import PautaScraper
from dotenv import load_dotenv

load_dotenv()


def test_pauta_product():
    """Testa scraping de um produto específico"""
    print("\n" + "=" * 80)
    print("TESTE DE PRODUTO PAUTA - VERIFICAÇÃO DAS IMAGENS")
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

    # Testa scraping de um produto específico
    product_url = 'https://pauta.com.br/cabo-rede-lan-furukawa-sohoplus-cat6-uutp-cmx-azul-claro-certificado-cx-305m-4'
    print(f"\nTestando URL: {product_url}")

    product = scraper.scrape_product(product_url, 'Pauta')

    if product:
        print("\n✅ Produto extraído com sucesso!")
        print(f"  SKU: {product.get('sku_interno')}")
        print(f"  Título: {product.get('titulo', 'N/A')}")
        print(f"  Slug: {product.get('slug', 'N/A')}")
        print(f"  Preço: R$ {product.get('preco_custo', 0)}")
        print(f"  Descrição: {product.get('descricao_completa', 'N/A')[:100]}...")

        imagens = product.get('imagens', [])
        print(f"\n  Total de imagens: {len(imagens)}")

        for idx, img in enumerate(imagens, 1):
            print(f"\n  Imagem {idx}:")
            print(f"    Caminho local: {img.get('caminho_local', 'N/A')}")
            print(f"    URL origem: {img.get('url_origem', 'N/A')}")
            print(f"    Principal: {img.get('eh_principal', False)}")

        # Verifica se as imagens foram baixadas
        if imagens:
            print("\n✅ IMAGENS FORAM BAIXADAS COM SUCESSO!")
            print("   Verifique a pasta: public/images/produtos/")
            return True
        else:
            print("\n❌ Nenhuma imagem foi baixada")
            return False
    else:
        print("\n❌ Falha ao extrair produto")
        return False


def main():
    """Função principal"""
    print("\n" + "=" * 80)
    print("TESTE DE PRODUTO PAUTA - IMAGENS")
    print("=" * 80)

    success = test_pauta_product()

    print("\n" + "=" * 80)
    print("RELATÓRIO FINAL")
    print("=" * 80)
    print(f"Resultado: {'✅ SUCESSO - IMAGENS BAIXADAS' if success else '❌ FALHA'}")
    print("=" * 80)

    return success


if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)
