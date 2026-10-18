# Web Scrapers GLTechCWB

Sistema de scraping automatizado para extrair produtos de Pauta Distribuição e Dicomp.

## 📋 Estrutura

```
scrapers/
├── __init__.py           # Módulo principal
├── base_scraper.py       # Classe base com autenticação e download de imagens
├── pauta_scraper.py      # Scraper específico para Pauta
├── dicomp_scraper.py     # Scraper específico para Dicomp
├── main.py               # Script principal de orquestração
├── requirements.txt      # Dependências Python
├── .env.example          # Exemplo de configuração
├── logs/                 # Log de execução (criado automaticamente)
└── README.md             # Este arquivo
```

## 🚀 Instalação

### 1. Instalar dependências Python

```bash
cd scrapers
pip install -r requirements.txt
```

### 2. Configurar credenciais

```bash
cp .env.example .env
# Edite o arquivo .env com suas credenciais reais
```

### 3. Verificar conexão com MongoDB

```bash
# O MongoDB deve estar rodando na instância OCI
# Ou use a string de conexão do MongoDB Atlas
```

## 📖 Uso

### Executar scraping completo

```bash
cd scrapers
python main.py
```

### Executar scraping de fornecedor específico

```bash
# Scraping Pauta apenas
python -c "
from scrapers.pauta_scraper import PautaScraper
from dotenv import load_dotenv
import os

load_dotenv()
scraper = PautaScraper(os.getenv('PAUTA_USERNAME'), os.getenv('PAUTA_PASSWORD'), None)
products = scraper.scrape_all()
print(f'Encontrados {len(products)} produtos')
"
```

## 🔧 Personalização

### URLs dos Catálogos

Edite as URLs nos métodos `scrape_all()` das classes:

**Pauta (`pauta_scraper.py`):**
```python
def scrape_all(self):
    catalog_urls = [
        'https://www.pautadistribuicao.com.br/produtos/categoria/computadores',
        'https://www.pautadistribuicao.com.br/produtos/categoria/eletronicos',
        # Adicione mais URLs
    ]
    # ...
```

**Dicomp (`dicomp_scraper.py`):**
```python
def scrape_all(self):
    catalog_urls = [
        'https://www.dicomp.com.br/categoria/computadores',
        'https://www.dicomp.com.br/categoria/eletronicos',
        # Adicione mais URLs
    ]
    # ...
```

### Estrutura de Dados

Os produtos são salvos no MongoDB com a seguinte estrutura:

```javascript
{
  "sku_interno": "SKU_DO_FORNECEDOR",
  "titulo": "Nome do Produto",
  "slug": "nome-do-produto",
  "marca": "Marca",
  "categoria": "Categoria",
  "descricao_completa": "Descrição completa",
  "preco_custo": 123.45,
  "estoque_disponivel": 100,
  "disponivel": true,
  "imagens": [
    {
      "caminho_local": "public/images/produtos/produto_slug_PAU_1234567890.jpg",
      "url_origem": "https://...",
      "eh_principal": true,
      "ordem": 0
    }
  ],
  "fornecedores": {
    "Pauta": {
      "sku_fornecedor": "SKU_PAUTA",
      "preco_custo": 123.45,
      "estoque_disponivel": 100,
      "disponivel": true,
      "atualizado_em": "2026-10-17T10:30:00.000Z"
    },
    "Dicomp": {
      "sku_fornecedor": "SKU_DICOMP",
      "preco_custo": 120.00,
      "estoque_disponivel": 50,
      "disponivel": true,
      "atualizado_em": "2026-10-17T10:31:00.000Z"
    }
  },
  "atualizado_em": "2026-10-17T10:30:00.000Z"
}
```

## 🛡️ Segurança

- **Cookies e Sessões:** O script gerencia sessões automaticamente
- **Download de Imagens:** As imagens são baixadas localmente para evitar hotlinking
- **User-Agent:** Headers realistas simulam navegação humana
- **Delay entre requests:** Pausas automáticas para evitar bloqueio

## 📊 Logs

Os logs são salvos em `scrapers/logs/scraping.log` e exibidos no terminal.

## 🐛 Troubleshooting

### Erro de conexão com MongoDB
- Verifique se o MongoDB está rodando na instância OCI
- Confirme a string de conexão `MONGO_URI` no arquivo `.env`

### Erro de login no fornecedor
- Verifique se as credenciais estão corretas
- Teste login manualmente no site do fornecedor
- Verifique se o site não mudou a estrutura HTML

### Erro de timeout
- Aumente o valor de `timeout` nos métodos `get()`
- Verifique se há bloqueio IP pelo site

## 🔄 Atualização Automática

Para integrar com o seu site Node.js, você pode:

1. **Criar uma API REST** no Node.js que expõe os produtos do MongoDB
2. **Executar o scraping** via Cron Job na instância OCI
3. **Consumir via fetch** no frontend JavaScript

Exemplo de integração com o seu backend:

```javascript
// routes/api/products.js
router.get('/products', async (req, res) => {
  const products = await Product.find({});
  res.json(products);
});
```

## 📝 Próximos Passos

1. [ ] Testar scraping manualmente
2. [ ] Adicionar URLs dos catálogos reais
3. [ ] Executar scraping completo
4. [ ] Integrar com o frontend do site
5. [ ] Configurar Cron Job para atualizações periódicas

## 📞 Suporte

Para dúvidas sobre scraping ou integração, consulte:
- Documentação do MongoDB: https://www.mongodb.com/docs/
- Documentação do BeautifulSoup: https://www.crummy.com/software/BeautifulSoup/bs4/doc/
- Documentação do Requests: https://requests.readthedocs.io/
