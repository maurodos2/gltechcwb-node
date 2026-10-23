"""
Converte RelatorioListaPrecos.xlsm (exportado do Zoho) em dois arquivos JSON
prontos para importar no MongoDB do projeto gltechcwb-node:
  - categorias.json
  - produtos.json

Uso:
    python3 gerar_catalogo_json.py caminho/para/RelatorioListaPrecos.xlsm
"""
import sys
import json
import re
import unicodedata
import pandas as pd

from mapeamento_categorias import MAPA_POR_CATEGORIA, EXCECOES_POR_ITEM


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFD", text)
    text = text.encode("ascii", "ignore").decode("utf-8")
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")


def gerar_sku(categoria_slug: str, indice: int) -> str:
    prefixo = "".join([p[0] for p in categoria_slug.split("-")])[:4].upper()
    return f"{prefixo}-{indice:04d}"


def main(caminho_xlsx: str):
    df = pd.read_excel(caminho_xlsx, sheet_name="Plan 1", engine="openpyxl")
    df = df[df["Item"].notna()]
    df = df[~df["Item"].astype(str).str.contains("Totais", na=False)]

    # --- Resolve categoria consolidada de cada linha ---
    def categoria_final(row):
        if row["Item"] in EXCECOES_POR_ITEM:
            return EXCECOES_POR_ITEM[row["Item"]]
        return MAPA_POR_CATEGORIA.get(row["Categoria"], "Outros")

    df["categoria_consolidada"] = df.apply(categoria_final, axis=1)

    # --- Monta categorias únicas, em ordem de aparição, com Serviços por último ---
    ordem_categorias = []
    for cat in df["categoria_consolidada"]:
        if cat not in ordem_categorias:
            ordem_categorias.append(cat)
    if "Serviços Técnicos" in ordem_categorias:
        ordem_categorias.remove("Serviços Técnicos")
        ordem_categorias.append("Serviços Técnicos")

    categorias = []
    for i, nome in enumerate(ordem_categorias, start=1):
        categorias.append(
            {
                "name": nome,
                "slug": slugify(nome),
                "description": "",
                "order": i,
                "active": True,
            }
        )

    slug_por_categoria = {c["name"]: c["slug"] for c in categorias}

    # --- Monta produtos ---
    produtos = []
    contador_por_categoria = {}

    for _, row in df.iterrows():
        cat_nome = row["categoria_consolidada"]
        cat_slug = slug_por_categoria[cat_nome]
        contador_por_categoria[cat_slug] = contador_por_categoria.get(cat_slug, 0) + 1

        eh_servico = cat_nome == "Serviços Técnicos"
        nome_item = str(row["Item"]).strip()

        # código de barras genérico Zoho (prefixo 2000000000...) não é EAN real
        cod_barras = str(row["Cód.Barras"]).strip()
        cod_barras_real = None if cod_barras.startswith("2000000000") else cod_barras

        preco_varejo = float(row["Valor de varejo"]) if pd.notna(row["Valor de varejo"]) else 0.0
        custo = float(row["Custo"]) if pd.notna(row["Custo"]) else 0.0

        produto = {
            "name": nome_item,
            "slug": slugify(nome_item)[:80] + f"-{contador_por_categoria[cat_slug]}",
            "sku": gerar_sku(cat_slug, contador_por_categoria[cat_slug]),
            "type": "servico" if eh_servico else "produto",
            "categorySlug": cat_slug,
            "subcategoryOriginal": str(row["Subcategoria"]) if pd.notna(row["Subcategoria"]) else "",
            "brand": "",
            "price": round(preco_varejo, 2),
            "cost": round(custo, 2),
            "promoPrice": None,
            "stock": 0 if eh_servico else 10,  # placeholder: ajustar estoque real depois
            "barcode": cod_barras_real,
            "active": True,
            "description": "",
            "shortDescription": "",
            "images": [],
        }
        produtos.append(produto)

    with open("categorias.json", "w", encoding="utf-8") as f:
        json.dump(categorias, f, ensure_ascii=False, indent=2)

    with open("produtos.json", "w", encoding="utf-8") as f:
        json.dump(produtos, f, ensure_ascii=False, indent=2)

    print(f"Categorias geradas: {len(categorias)}")
    for c in categorias:
        qtd = contador_por_categoria.get(c["slug"], 0)
        print(f"  - {c['name']} ({c['slug']}): {qtd} itens")
    print(f"\nTotal de produtos/serviços: {len(produtos)}")


if __name__ == "__main__":
    caminho = sys.argv[1] if len(sys.argv) > 1 else "RelatorioListaPrecos.xlsm"
    main(caminho)
