"""
Scraper para Pauta Distribuição
"""
import logging
import time
from datetime import datetime
from urllib.parse import urljoin
from bs4 import BeautifulSoup

import sys
import os

# Adiciona o diretório pai ao path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from base_scraper import BaseScraper

logger = logging.getLogger(__name__)


class PautaScraper(BaseScraper):
    """Scraper especializado para Pauta Distribuição"""

    def __init__(self, username, password, db_config):
        """
        Inicializa o scraper da Pauta

        Args:
            username: Usuário Pauta
            password: Senha Pauta
            db_config: Configuração do MongoDB
        """
        super().__init__(
            base_url='https://pauta.com.br',
            login_url='https://pauta.com.br/login',
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

        # Pauta usa divs com classe específica para produtos
        product_elements = soup.find_all('div', class_='product-item')

        for element in product_elements:
            # Tenta encontrar o link do produto
            link = element.find('a', href=True)
            if link:
                product_url = urljoin(self.base_url, link['href'])
                product_urls.append(product_url)

        logger.info(f"Pauta: Encontrados {len(product_urls)} produtos na página")
        return product_urls

    def _extract_product_details(self, html_content):
        """
        Extrai detalhes completos de um produto da Pauta

        Args:
            html_content: HTML da página do produto

        Returns:
            dict: Dados do produto
        """
        soup = BeautifulSoup(html_content, 'html.parser')

        # Extrai título
        title_element = soup.find('h1', class_='product-title')
        titulo = title_element.get_text(strip=True) if title_element else ''

        # Extrai preço (formato R$ 1.234,56)
        price_element = soup.find('span', class_='price')
        preco_str = price_element.get_text(strip=True) if price_element else ''
        try:
            preco_custo = float(preco_str.replace('R$', '').replace('.', '').replace(',', '.'))
        except:
            preco_custo = 0

        # Extrai SKU
        sku_element = soup.find('span', class_='sku')
        sku = sku_element.get_text(strip=True) if sku_element else ''

        # Extrai descrição
        desc_element = soup.find('div', class_='description')
        descricao = desc_element.get_text(strip=True) if desc_element else ''

        # Extrai imagens
        images = []
        img_elements = soup.find_all('img', class_='product-image')
        for idx, img in enumerate(img_elements):
            src = img.get('src') or img.get('data-src')
            if src:
                from urllib.parse import urljoin
                full_url = urljoin(self.base_url, src)
                images.append(full_url)

        # Extrai categoria
        category_element = soup.find('a', class_='category-link')
        categoria = category_element.get_text(strip=True) if category_element else ''

        # Extrai marca (geralmente em um elemento específico)
        brand_element = soup.find('span', class_='brand')
        marca = brand_element.get_text(strip=True) if brand_element else ''

        return {
            'sku_interno': sku,
            'titulo': titulo,
            'slug': self._clean_slug(titulo),
            'marca': marca,
            'categoria': categoria,
            'descricao_completa': descricao,
            'imagens': images,
            'preco_custo': preco_custo,
            'estoque_disponivel': 0  # Pauta não mostra estoque público
        }

    def scrape_catalog(self, catalog_url):
        """
        Scrapes um catálogo da Pauta

        Args:
            catalog_url: URL do catálogo

        Returns:
            list: Lista de produtos
        """
        logger.info(f"Pauta: Scraping catálogo {catalog_url}")

        if not self._login():
            logger.error("Falha ao login na Pauta")
            return []

        try:
            response = self.session.get(catalog_url, timeout=30)
            response.raise_for_status()

            # Verifica se a página existe
            if response.status_code == 404:
                logger.error(f"URL não encontrada: {catalog_url}")
                return []

            # Extrai lista de produtos
            product_urls = self._extract_product_list(response.text)

            if not product_urls:
                logger.warning(f"Nenhum produto encontrado em {catalog_url}")
                logger.info("Tentando extrair produtos do HTML da página...")
                # Tenta extrair produtos diretamente da página
                product_urls = self._extract_products_from_page(response.text)

            # Scrapes cada produto individualmente
            products = []
            for idx, product_url in enumerate(product_urls, 1):
                logger.info(f"Pauta: Processando produto {idx}/{len(product_urls)}")
                product_data = self.scrape_product(product_url, 'Pauta')
                if product_data:
                    products.append(product_data)

                # Pausa para evitar bloqueio
                time.sleep(2)

            logger.info(f"Pauta: Finalizado. Total: {len(products)} produtos")
            return products

        except Exception as e:
            logger.error(f"Erro ao scrapear catálogo Pauta: {e}")
            return []

    def _extract_products_from_page(self, html_content):
        """
        Extrai produtos diretamente da página de catálogo
        """
        soup = BeautifulSoup(html_content, 'html.parser')
        products = []

        # Tenta encontrar produtos em diferentes elementos
        selectors = [
            ('div.product-item', 'a.product-item-link'),
            ('div.product', 'a.product-link'),
            ('article.product', 'a.product-detail'),
        ]

        for parent_selector, link_selector in selectors:
            parent_elements = soup.select(parent_selector)
            if parent_elements:
                logger.info(f"Encontrados {len(parent_elements)} produtos com {parent_selector}")

                for element in parent_elements:
                    link = element.select_one(link_selector)
                    if link and link.get('href'):
                        product_url = urljoin(self.base_url, link['href'])
                        products.append(product_url)
                break

        return products

    def scrape_product(self, product_url, supplier_name):
        """
        Extrai dados de um produto específico

        Args:
            product_url: URL do produto
            supplier_name: Nome do fornecedor

        Returns:
            dict: Dados do produto
        """
        logger.info(f"Scraping produto: {product_url}")

        try:
            response = self.session.get(product_url, timeout=30)
            response.raise_for_status()
            html = response.text

            # Verifica se estamos logados
            if '/login/page' in response.url.lower():
                logger.error("Falha ao scrapar produto - não autenticado")
                return None

            # Extrai dados usando BeautifulSoup
            soup = BeautifulSoup(html, 'html.parser')

            # Extrai SKU (do URL ou da página)
            sku = self._get_product_id_from_url(product_url)
            if not sku:
                # Tenta extrair do atributo data-product-id
                sku_element = soup.find(attrs={'data-product-id': True})
                if sku_element:
                    sku = sku_element.get('data-product-id')

            # Extrai título
            titulo_element = soup.find('h1')
            titulo = titulo_element.get_text(strip=True) if titulo_element else ''

            # Extrai preço
            price_element = soup.find('span', class_='price')
            preco_str = price_element.get_text(strip=True) if price_element else ''
            try:
                preco_custo = float(preco_str.replace('R$', '').replace('.', '').replace(',', '.'))
            except:
                preco_custo = 0

            # Extrai descrição
            desc_element = soup.find('div', class_='description')
            descricao = desc_element.get_text(strip=True) if desc_element else ''

            # Extrai imagens
            images = []
            img_elements = soup.find_all('img', class_='product-image')
            for img in img_elements:
                src = img.get('src') or img.get('data-src')
                if src:
                    full_url = urljoin(self.base_url, src)
                    images.append(full_url)

            # Baixa as imagens
            imagens_locais = []
            for idx, img_url in enumerate(images):
                local_path = self._download_image(img_url, sku, supplier_name)
                if local_path:
                    imagens_locais.append({
                        'caminho_local': local_path,
                        'url_origem': img_url,
                        'eh_principal': idx == 0,
                        'ordem': idx
                    })

            product_data = {
                'sku_interno': sku,
                'titulo': titulo,
                'slug': self._clean_slug(titulo),
                'marca': '',
                'categoria': '',
                'descricao_completa': descricao,
                'imagens': imagens_locais,
                'fornecedores': {
                    supplier_name: {
                        'sku_fornecedor': sku,
                        'preco_custo': preco_custo,
                        'estoque_disponivel': 0,
                        'disponivel': False,
                        'atualizado_em': datetime.utcnow().isoformat()
                    }
                }
            }

            logger.info(f"Produto extraído: {sku} - {titulo[:50]}...")
            return product_data

        except Exception as e:
            logger.error(f"Erro ao scrapar produto {product_url}: {e}")
            return None

    def scrape_all(self):
        """
        Scrapes todos os produtos da Pauta
        Testa múltiplas URLs de categorias
        """
        # Lista de URLs de categorias para testar
        catalog_urls = [
            'https://pauta.com.br/computadores',
            'https://pauta.com.br/produtos/computadores',
            'https://pauta.com.br/produtos/categoria/computadores',
            'https://pauta.com.br/eletronicos',
            'https://pauta.com.br/produtos/eletronicos',
            'https://pauta.com.br/redes-e-infraestrutura',
            'https://pauta.com.br/produtos/redes-e-infraestrutura',
            'https://pauta.com.br/monitor-de-video',
            'https://pauta.com.br/produtos/monitor-de-video',
            'https://pauta.com.br/produtos/categoria/monitor-de-video',
        ]

        all_products = []
        for catalog_url in catalog_urls:
            logger.info(f"\n{'='*80}")
            logger.info(f"Tentando URL: {catalog_url}")
            logger.info(f"{'='*80}")
            products = self.scrape_catalog(catalog_url)
            all_products.extend(products)

            # Pausa entre categorias
            time.sleep(5)

        return all_products
