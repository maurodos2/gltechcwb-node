"""
Web Scrapers para GLTechCWB
Extrai produtos de Pauta Distribuição e Dicomp
"""

from .base_scraper import BaseScraper
from .pauta_scraper import PautaScraper
from .dicomp_scraper import DicompScraper

__all__ = ['BaseScraper', 'PautaScraper', 'DicompScraper']
