# Oracle Cloud: upgrade para Pay As You Go (PAYG) + A1 + alerta de orçamento

Roteiro para destravar a capacidade da instância **Ampere A1** (Always Free
4 OCPU / 24 GB) no Oracle Cloud a partir de uma conta free que só conseguiu as
AMD frágeis (1/8 OCPU, 1 GB). O upgrade para PAYG dá prioridade de capacidade e
**não custa nada** se você ficar dentro dos limites do Always Free.

## 1) Upgrade da conta para PAYG

Antes: cartão de crédito válido (Visa/Mastercard/Amex) e sem pendências na
conta. O hold de ~US$ 100 é uma pré-autorização temporária — some da fatura em
alguns dias, **não vira cobrança**.

1. Entre no console: `cloud.oracle.com` (home region).
2. Menu ☰ → **Billing & Cost Management** → **Upgrade and Manage Payment**.
3. Clique em **"Upgrade to Pay As You Go"**.
4. Cadastre cartão + endereço de cobrança, aceite os termos.
5. Clique em **"Start My Upgrade"**.
6. Aguarde processar (minutos até ~30 min); confirme por e-mail/status na
   mesma tela.

Pronto: os recursos do Always Free **continuam grátis**; manter dentro do
limite (A1 **2 OCPUs / 12 GB** atual — não mais 4/24) = fatura US$ 0.

## 2) Criar a A1 (agora com prioridade)

1. Menu ☰ → Compute → Instances → **Create Instance**.
2. Nome: `prod-app-server`.
3. Imagem: **Canonical Ubuntu 24.04** (a base do `deploy/oracle-provision.sh`).
4. Shape → **Edit** → `VM.Standard.A1.Flex`, **OCPUs = 2, Memória = 12 GB**.
   (Limite Always Free atual da A1: 2 OCPUs / 12 GB no total — uma única
   instância 2/12, ou duas de 1/6. Criar além disso cobra ou falha.)
5. SSH: gerar/salvar o par de chaves (guardar a privada!).
6. Networking: VCN com **Assign public IPv4**; liberar 22, 80 e 443 no
   security list.
7. **Create**. Se ainda der "Out of host capacity", troque o availability
   domain e tente de novo em alguns minutos.

## 3) Alerta de orçamento (evitar cobrança surpresa)

1. ☰ → Billing & Cost Management → **Budgets** → **Create Budget**.
2. Tipo: **Cost** (não "Usage").
3. Scope: **Tenancy** (raiz).
4. Valor: **US$ 1,00** (mensal).
5. Alerta: limite **90%**, frequência diária, e-mails de contato (adicione um
   2º e-mail).
6. **Create Budget**.

## Observações

- A 2 AMD micros (E2.1.Micro) coexistem com a A1 (o free tier inclui as duas
  linhas ao mesmo tempo) — não é preciso deletá-las para criar a A1.
- Política de "idle reclaim": instância free parada pode ser recolhida pela
  Oracle. A loja + bot rodando 24/7 nunca ficam ociosas, então risco baixo.
- As AMD micros não aguentam o Chromium do bot (1 GB de RAM) — usar só para
  loja isolada, proxy reverso (Caddy) ou descartar.