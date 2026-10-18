"""
Scraper para Dicomp
"""
import logging
import time
from datetime import datetime
from urllib.parse import urljoin

import sys
import os

# Adiciona o diretório pai ao path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from base_scraper import BaseScraper

logger = logging.getLogger(__name__)


class DicompScraper(BaseScraper):
    """Scraper especializado para Dicomp"""

    def __init__(self, username, password, db_config):
        """
        Inicializa o scraper do Dicomp

        Args:
            username: Usuário Dicomp
            password: Senha Dicomp
            db_config: Configuração do MongoDB
        """
        super().__init__(
            base_url='https://loja.dicomp.com.br',
            login_url='https://loja.dicomp.com.br/login',
            username=username,
            password=password,
            db_config=db_config
        )

    def _extract_product_list(self, html_content):
        """
        Extrai a lista de produtos de uma página de catálogo

        Args:
            html_content: HTML da página

        Returns:
            list: Lista de URLs de produtos
        """
        soup = BeautifulSoup(html_content, 'html.parser')
        product_urls = []

        # Dicomp usa estrutura diferente - pode precisar ajustar
        # Tenta encontrar elementos de produtos
        product_elements = soup.find_all('div', class_='product-item') or \
                           soup.find_all('div', class_='product') or \
                           soup.find_all('article', class_='product')

        for element in product_elements:
            link = element.find('a', href=True)
            if link:
                product_url = urljoin(self.base_url, link['href'])
                product_urls.append(product_url)

        logger.info(f"Dicomp: Encontrados {len(product_urls)} produtos na página")
        return product_urls

    def _extract_product_details(self, html_content):
        """
        Extrai detalhes completos de um produto do Dicomp

        Args:
            html_content: HTML da página do produto

        Returns:
            dict: Dados do produto
        """
        soup = BeautifulSoup(html_content, 'html.parser')

        # Extrai título
        title_element = soup.find('h1')
        titulo = title_element.get_text(strip=True) if title_element else ''

        # Extrai preço
        price_element = soup.find('span', class_='price') or \
                       soup.find('div', class_='price')
        preco_str = price_element.get_text(strip=True) if price_element else ''
        try:
            preco_custo = float(preco_str.replace('R$', '').replace('.', '').replace(',', '.'))
        except:
            preco_custo = 0

        # Extrai SKU
        sku_element = soup.find('span', class_='sku') or \
                     soup.find('span', class_='code') or \
                     soup.find('div', class_='sku')
        sku = sku_element.get_text(strip=True) if sku_element else ''

        # Extrai descrição
        desc_element = soup.find('div', class_='description') or \
                      soup.find('div', class_='product-description')
        descricao = desc_element.get_text(strip=True) if desc_element else ''

        # Extrai imagens
        images = []
        img_elements = soup.find_all('img')
        for img in img_elements:
            src = img.get('src') or img.get('data-src') or img.get('data-original')
            if src:
                full_url = urljoin(self.base_url, src)
                images.append(full_url)

        # Extrai categoria
        category_element = soup.find('a', class_='category')
        categoria = category_element.get_text(strip=True) if category_element else ''

        # Extrai marca
        brand_element = soup.find('span', class_='brand') or \
                       soup.find('div', class_='brand')
        marca = brand_element.get_text(strip=True) if brand_element else ''

        # Extrai estoque
        stock_element = soup.find('span', class_='stock') or \
                       soup.find('div', class_='stock')
        estoque = stock_element.get_text(strip=True) if stock_element else ''
        disponivel = 'disponível' in estoque.lower() or 'em estoque' in estoque.lower()

        return {
            'sku_interno': sku,
            'titulo': titulo,
            'slug': self._clean_slug(titulo),
            'marca': marca,
            'categoria': categoria,
            'descricao_completa': descricao,
            'imagens': images,
            'preco_custo': preco_custo,
            'estoque_disponivel': int(estoque) if estoque.isdigit() else 0,
            'disponivel': disponivel
        }

    def scrape_catalog(self, catalog_url):
        """
        Scrapes um catálogo do Dicomp

        Args:
            catalog_url: URL do catálogo

        Returns:
            list: Lista de produtos
        """
        logger.info(f"Dicomp: Scraping catálogo {catalog_url}")

        if not self._login():
            logger.error("Falha ao login no Dicomp")
            return []

        try:
            response = self.session.get(catalog_url, timeout=30)
            response.raise_for_status()

            # Extrai lista de produtos
            product_urls = self._extract_product_list(response.text)

            # Scrapes cada produto individualmente
            products = []
            for idx, product_url in enumerate(product_urls, 1):
                logger.info(f"Dicomp: Processando produto {idx}/{len(product_urls)}")
                product_data = self.scrape_product(product_url, 'Dicomp')
                if product_data:
                    products.append(product_data)

                # Pausa para evitar bloqueio
                time.sleep(2)

            logger.info(f"Dicomp: Finalizado. Total: {len(products)} produtos")
            return products

        except Exception as e:
            logger.error(f"Erro ao scrapear catálogo Dicomp: {e}")
            return []

    def scrape_all(self):
        """
        Scrapes todos os produtos do Dicomp
        Nota: Esta função deve ser personalizada com as URLs dos catálogos reais
        """
        # URLs dos catálogos do Dicomp (substituir pelos reais)
        catalog_urls = [
            'https://www.dicomp.com.br/categoria/computadores',
            'https://www.dicomp.com.br/categoria/eletronicos',
            # Adicionar mais URLs conforme necessário
        ]

        all_products = []
        for catalog_url in catalog_urls:
            products = self.scrape_catalog(catalog_url)
            all_products.extend(products)

        return all_products
