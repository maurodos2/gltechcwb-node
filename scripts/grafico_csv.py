import argparse
import csv
from pathlib import Path


def ler_csv(caminho, delimitador=None):
    with caminho.open("r", encoding="utf-8-sig", newline="") as arquivo:
        amostra = arquivo.read(4096)
        arquivo.seek(0)
        if delimitador is None:
            try:
                delimitador = csv.Sniffer().sniff(amostra, delimiters=",;\t|").delimiter
            except csv.Error:
                delimitador = ","

        leitor = csv.DictReader(arquivo, delimiter=delimitador)
        if not leitor.fieldnames:
            raise ValueError("O CSV está vazio ou não possui cabeçalho.")

        linhas = list(leitor)
        if not linhas:
            raise ValueError("O CSV não possui linhas de dados.")
        return leitor.fieldnames, linhas


def numero(valor):
    try:
        return float(valor.strip())
    except (AttributeError, ValueError):
        return None


def main():
    parser = argparse.ArgumentParser(
        description="Gera um gráfico de linhas a partir de um arquivo CSV."
    )
    parser.add_argument(
        "arquivo",
        nargs="?",
        type=Path,
        default=Path("dados.csv"),
        help="Caminho do arquivo CSV (padrão: dados.csv)",
    )
    parser.add_argument("--x", help="Coluna usada no eixo horizontal (padrão: primeira coluna)")
    parser.add_argument("--y", nargs="+", help="Coluna(s) numérica(s) para desenhar")
    parser.add_argument("--saida", type=Path, help="Opcional: arquivo de imagem de saída")
    parser.add_argument("--delimitador", help="Delimitador do CSV (detectado automaticamente por padrão)")
    args = parser.parse_args()

    if not args.arquivo.is_file():
        parser.error(f"Arquivo não encontrado: {args.arquivo}")

    try:
        colunas, linhas = ler_csv(args.arquivo, args.delimitador)
    except (OSError, ValueError) as erro:
        parser.error(str(erro))

    coluna_x = args.x or colunas[0]
    if coluna_x not in colunas:
        parser.error(f"Coluna do eixo X não encontrada: {coluna_x}")

    colunas_y = args.y or [coluna for coluna in colunas if coluna != coluna_x]
    for coluna in colunas_y:
        if coluna not in colunas:
            parser.error(f"Coluna não encontrada: {coluna}")
    if not colunas_y:
        parser.error("Informe ao menos uma coluna numérica com --y.")

    dados = {}
    for coluna in colunas_y:
        valores = [numero(linha.get(coluna)) for linha in linhas]
        if not any(valor is not None for valor in valores):
            parser.error(f"A coluna não contém valores numéricos: {coluna}")
        dados[coluna] = valores

    try:
        import matplotlib.pyplot as plt
    except ImportError:
        parser.error("Matplotlib não está instalado. Instale com: python -m pip install matplotlib")

    eixo_x = [linha[coluna_x] for linha in linhas]
    for coluna, valores in dados.items():
        plt.plot(eixo_x, valores, marker="o", label=coluna)

    plt.xlabel(coluna_x)
    plt.ylabel("Valor")
    plt.title(f"{', '.join(colunas_y)} por {coluna_x}")
    plt.xticks(rotation=45, ha="right")
    if len(colunas_y) > 1:
        plt.legend()
    plt.grid(True, alpha=0.3)
    plt.tight_layout()

    if args.saida:
        plt.savefig(args.saida, dpi=150)
        print(f"Gráfico salvo em: {args.saida}")

    plt.show()


if __name__ == "__main__":
    main()