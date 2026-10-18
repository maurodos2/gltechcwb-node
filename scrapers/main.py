"""
Script principal de scraping para GLTechCWB
Conecta com MongoDB e realiza upsert de produtos
"""
import os
import sys
import logging
from datetime import datetime
from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError

# Adiciona o diretório pai ao path para importar os scrapers
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pauta_scraper import PautaScraper
from dicomp_scraper import DicompScraper

# Configuração de logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('logs/scraping.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)


class MongoDBManager:
    """Gerencia operações no MongoDB"""

    def __init__(self, mongo_uri, db_name):
        """
        Inicializa a conexão com MongoDB

        Args:
            mongo_uri: String de conexão MongoDB
            db_name: Nome do banco de dados
        """
        self.client = MongoClient(mongo_uri)
        self.db = self.client[db_name]
        self.products = self.db.products

        # Cria índice único em sku_interno
        try:
            self.products.create_index('sku_interno', unique=True)
            logger.info("Índice único criado em sku_interno")
        except Exception as e:
            logger.warning(f"Índice pode já existir: {e}")

    def upsert_product(self, product_data):
        """
        Upserts um produto no banco de dados

        Args:
            product_data: Dados do produto

        Returns:
            dict: Resultado da operação
        """
        try:
            result = self.products.update_one(
                {'sku_interno': product_data['sku_interno']},
                {
                    '$set': {
                        **product_data,
                        'atualizado_em': datetime.utcnow()
                    }
                },
                upsert=True
            )

            return {
                'sku': product_data['sku_interno'],
                'n_updated': result.modified_count,
                'n_created': result.upserted_id is not None,
                'status': 'created' if result.upserted_id else 'updated'
            }
        except DuplicateKeyError:
            logger.warning(f"SKU duplicado: {product_data['sku_interno']}")
            return {'sku': product_data['sku_interno'], 'status': 'duplicate'}
        except Exception as e:
            logger.error(f"Erro ao upsert produto {product_data['sku_interno']}: {e}")
            return {'sku': product_data['sku_interno'], 'status': 'error'}


def process_scraped_products(products, mongo_manager):
    """
    Processa uma lista de produtos scrapados

    Args:
        products: Lista de produtos scrapados
        mongo_manager: Instância do MongoDBManager

    Returns:
        dict: Estatísticas de processamento
    """
    stats = {
        'total': len(products),
        'success': 0,
        'created': 0,
        'updated': 0,
        'errors': 0
    }

    for product in products:
        result = mongo_manager.upsert_product(product)
        if result['status'] == 'created':
            stats['created'] += 1
        elif result['status'] == 'updated':
            stats['updated'] += 1
        elif result['status'] == 'success':
            stats['success'] += 1
        else:
            stats['errors'] += 1

    return stats


def main():
    """Função principal de execução"""

    # Carrega variáveis de ambiente
    from dotenv import load_dotenv
    load_dotenv()

    # Configurações do MongoDB (substituir pelos valores reais)
    MONGO_URI = os.getenv('MONGO_URI', 'mongodb://127.0.0.1:27017/gltechcwb')
    DB_NAME = os.getenv('DB_NAME', 'gltechcwb')

    # Credenciais dos fornecedores
    PAUTA_USER = os.getenv('PAUTA_USERNAME', '')
    PAUTA_PASS = os.getenv('PAUTA_PASSWORD', '')
    DICOMP_USER = os.getenv('DICOMP_USERNAME', '')
    DICOMP_PASS = os.getenv('DICOMP_PASSWORD', '')

    if not PAUTA_USER or not PAUTA_PASS:
        logger.error("Credenciais da Pauta não fornecidas")
        return

    if not DICOMP_USER or not DICOMP_PASS:
        logger.error("Credenciais do Dicomp não fornecidas")
        return

    logger.info("=" * 80)
    logger.info("INICIANDO SCRAPING GLTECHCWB")
    logger.info("=" * 80)

    # Inicializa MongoDB
    logger.info(f"Conectando ao MongoDB: {MONGO_URI}")
    mongo_manager = MongoDBManager(MONGO_URI, DB_NAME)

    # Inicializa scrapers
    pauta_scraper = PautaScraper(PAUTA_USER, PAUTA_PASS, mongo_manager)
    dicomp_scraper = DicompScraper(DICOMP_USER, DICOMP_PASS, mongo_manager)

    # Executa scraping
    all_products = []

    logger.info("\n--- Scraping Pauta Distribuição ---")
    pauta_products = pauta_scraper.scrape_all()
    all_products.extend(pauta_products)

    logger.info("\n--- Scraping Dicomp ---")
    dicomp_products = dicomp_scraper.scrape_all()
    all_products.extend(dicomp_products)

    # Processa produtos no banco
    logger.info(f"\n--- Processando {len(all_products)} produtos no MongoDB ---")
    stats = process_scraped_products(all_products, mongo_manager)

    # Relatório final
    logger.info("\n" + "=" * 80)
    logger.info("RELATÓRIO FINAL")
    logger.info("=" * 80)
    logger.info(f"Total de produtos scrapados: {stats['total']}")
    logger.info(f"Produtos criados: {stats['created']}")
    logger.info(f"Produtos atualizados: {stats['updated']}")
    logger.info(f"Erros: {stats['errors']}")
    logger.info("=" * 80)

    # Fecha conexão
    mongo_manager.client.close()


if __name__ == '__main__':
    main()
