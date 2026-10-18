"""
Base Scraper com autenticação, tratamento de cookies e download de imagens
"""
import os
import time
import logging
import hashlib
import requests
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup
from datetime import datetime
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class BaseScraper:
    """Classe base para scrapers com autenticação e download de imagens"""

    def __init__(self, base_url, login_url, username, password, db_config):
        """
        Inicializa o scraper

        Args:
            base_url: URL base do site
            login_url: URL de login
            username: Usuário para login
            password: Senha para login
            db_config: Configuração do MongoDB
        """
        self.base_url = base_url
        self.login_url = login_url
        self.username = username
        self.password = password
        self.db_config = db_config

        # Configuração de sessão com headers realistas
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        })

        # Coletar cookies de sessão
        self.session.cookies.clear()

    def _login(self):
        """Realiza login no site"""
        logger.info(f"Tentando login em {self.login_url}")

        login_data = {
            'username': self.username,
            'password': self.password,
        }

        try:
            response = self.session.post(
                self.login_url,
                data=login_data,
                allow_redirects=True,
                timeout=30
            )

            if response.status_code == 200:
                logger.info("Login realizado com sucesso")
                # Verifica se estamos logado
                # Verifica se o login foi bem-sucedido
                if '/login/page' not in response.url.lower():
                    logger.info("Login realizado com sucesso")
                    return True
                else:
                    logger.error("Falha no login - credenciais inválidas")
                    return False
            else:
                logger.error(f"Falha no login - status code: {response.status_code}")
                return False

        except Exception as e:
            logger.error(f"Erro ao realizar login: {e}")
            return False

    def _clean_slug(self, text):
        """Limpa e cria um slug a partir de texto"""
        if not text:
            return 'produto'
        # Remove caracteres especiais e espaços excessivos
        slug = text.lower()
        slug = ''.join(c for c in slug if c.isalnum() or c in (' ', '-', '_'))
        slug = slug.strip().replace(' ', '-').replace('_', '-')
        slug = '-'.join(s for s in slug.split('-') if s)
        return slug[:100]  # Limita tamanho

    def _download_image(self, image_url, product_slug, supplier_name):
        """
        Baixa imagem de forma segura, evitando hotlinking

        Args:
            image_url: URL da imagem original
            product_slug: Slug do produto para renomear
            supplier_name: Nome do fornecedor

        Returns:
            str: Caminho local da imagem ou None se falhar
        """
        if not image_url:
            return None

        try:
            # Verifica se é uma URL externa
            parsed_url = urlparse(image_url)
            if not parsed_url.scheme or not parsed_url.netloc:
                logger.warning(f"URL de imagem inválida: {image_url}")
                return None

            # Tenta baixar a imagem
            response = self.session.get(
                image_url,
                stream=True,
                timeout=15,
                headers={'Referer': self.base_url}
            )

            if response.status_code != 200:
                logger.warning(f"Erro ao baixar imagem: {response.status_code}")
                return None

            # Determina o tipo de conteúdo
            content_type = response.headers.get('Content-Type', 'image/jpeg')
            ext = '.jpg' if 'jpeg' in content_type else '.png'

            # Cria o nome do arquivo
            filename = f"{product_slug}_{supplier_name[:3].upper()}_{int(time.time())}{ext}"
            save_path = Path('public/images/produtos') / filename

            # Baixa o conteúdo
            with open(save_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)

            logger.info(f"Imagem salva: {save_path}")
            return str(save_path)

        except Exception as e:
            logger.error(f"Erro ao baixar imagem {image_url}: {e}")
            return None

    def _get_images_from_html(self, html_content, product_url):
        """
        Extrai URLs de imagens do HTML

        Args:
            html_content: HTML da página
            product_url: URL do produto (para referência)

        Returns:
            list: Lista de URLs de imagens
        """
        soup = BeautifulSoup(html_content, 'html.parser')
        images = []

        # Busca por tags img
        img_tags = soup.find_all('img')
        for img in img_tags:
            src = img.get('src') or img.get('data-src')
            if src:
                # Converte para URL absoluta
                full_url = urljoin(product_url, src)
                images.append(full_url)

        logger.info(f"Encontradas {len(images)} imagens na página")
        return images

    def _get_product_id_from_url(self, product_url):
        """
        Extrai o SKU ou ID do produto da URL
        """
        parsed = urlparse(product_url)
        path = parsed.path

        # Tenta extrair SKU de padrões comuns
        if '/produto/' in path or '/p/' in path:
            parts = path.split('/')
            for part in parts:
                if part and len(part) > 3 and len(part) < 50:
                    return part

        # Tenta extrair do query string
        query = parsed.query
        if query:
            for param in query.split('&'):
                if param.startswith('sku='):
                    return param.split('=')[1]

        return None

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
            if 'login' in response.url.lower():
                logger.error("Falha ao scrapar produto - não autenticado")
                return None

            # Extrai imagens
            images = self._get_images_from_html(html, product_url)

            # Extrai outras informações (será implementado nas subclasses)
            product_data = {
                'sku_interno': self._get_product_id_from_url(product_url),
                'titulo': '',
                'slug': '',
                'marca': '',
                'categoria': '',
                'descricao_completa': '',
                'imagens': [],
                'fornecedores': {
                    supplier_name: {
                        'sku_fornecedor': self._get_product_id_from_url(product_url),
                        'preco_custo': 0,
                        'estoque_disponivel': 0,
                        'disponivel': False,
                        'atualizado_em': datetime.utcnow().isoformat()
                    }
                }
            }

            # Baixa as imagens
            for idx, img_url in enumerate(images):
                local_path = self._download_image(img_url, product_data['slug'], supplier_name)
                if local_path:
                    product_data['imagens'].append({
                        'caminho_local': local_path,
                        'url_origem': img_url,
                        'eh_principal': idx == 0,
                        'ordem': idx
                    })

            logger.info(f"Produto extraído: {product_data['sku_interno']}")
            return product_data

        except Exception as e:
            logger.error(f"Erro ao scrapar produto {product_url}: {e}")
            return None

    def scrape_catalog(self, product_list_url):
        """
        Scrapes um catálogo de produtos (será implementado nas subclasses)

        Args:
            product_list_url: URL da página do catálogo

        Returns:
            list: Lista de produtos
        """
        raise NotImplementedError("Deve ser implementado pela subclasse")

    def scrape_all(self):
        """
        Scrapes todos os produtos disponíveis

        Returns:
            list: Lista de produtos
        """
        raise NotImplementedError("Deve ser implementado pela subclasse")
