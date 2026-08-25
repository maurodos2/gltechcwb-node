# Mapeamento: (Categoria Zoho, Subcategoria Zoho) -> Categoria consolidada nova
# Regra: quando toda a categoria Zoho vai para o mesmo lugar, mapeio só pela Categoria.

MAPA_POR_CATEGORIA = {
    "Periféricos": "Periféricos",
    "Audio": "Áudio e TV",
    "SmartTV": "Áudio e TV",
    "Baterias/Pilhas": "Pilhas e Baterias",
    "Cabo de Rede": "Redes e Conectividade",
    "Dispositivos de Redes": "Redes e Conectividade",
    "Roteadores": "Redes e Conectividade",
    "Repetidores": "Redes e Conectividade",
    "SWITCH": "Redes e Conectividade",
    "SWITCH GERENCIAVEL": "Redes e Conectividade",
    "Cameras de Segurança": "Segurança e Monitoramento",
    "SSD (Solid State Drive)": "Armazenamento e Memória",
    "Memórias": "Armazenamento e Memória",
    "Acessórios de acabamento/infraestrutura": "Acessórios e Infraestrutura",
    "Material Eletrico": "Acessórios e Infraestrutura",
    "Suporte": "Acessórios e Infraestrutura",
    "Suprimentos": "Acessórios e Infraestrutura",
    "Composto Orgãnico": "Acessórios e Infraestrutura",
    "Ferramenta": "Ferramentas",
    "Rádio de Comunicação": "Telefonia e Comunicação",
    "TELEFONIA": "Telefonia e Comunicação",
    "Placa Mãe para Impressora": "Impressoras",
    "Sem Categoria": "Serviços Técnicos",
}

# Exceções por item específico (dentro de "Periféricos", alguns itens são
# mais coerentes em outra categoria consolidada)
EXCECOES_POR_ITEM = {
    "SSD ADATA 480GB 2,5\" SATA III 6GB/S - ASU650SS- 480GT-R": "Armazenamento e Memória",
    "Placa De Rede Mini Pci-e Gigabit 10/100/1000 Knup Kp-t90": "Redes e Conectividade",
}
