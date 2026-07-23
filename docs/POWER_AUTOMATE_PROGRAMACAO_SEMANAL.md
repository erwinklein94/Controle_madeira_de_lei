# Programação Semanal — Excel Online → Power Automate → Site

## Colunas da segunda tabela do Excel

Transforme os dados da segunda aba em uma **Tabela** do Excel e dê a ela o nome
`tbProgramacaoSemanal`.

Use exatamente estes cabeçalhos:

| Coluna no Excel | Obrigatória | Uso no site |
|---|---:|---|
| ID | Sim | Identificador único da linha; evita duplicações |
| Fornecedor | Sim | Fornecedor da programação |
| Pedido | Sim | Número do pedido |
| Fiscal | Sim | Fiscal responsável |
| Data Início | Sim | Primeiro dia da programação |
| Data Fim | Sim | Último dia da programação |
| Qtde Peças | Sim | Quantidade prevista para inspeção |
| Status | Sim | Situação atual da programação |
| Observações | Não | Orientações adicionais |

O site calcula automaticamente o **ano** e o **número da semana** a partir de
`Data Início`; essas duas colunas não precisam existir no Excel.

Não altere o `ID` de uma linha já enviada. Quando o mesmo ID for recebido
novamente, o registro existente será atualizado, sem criar duplicação.

## URL e cabeçalhos

**Método:** `POST`

**URL:**

`https://rgafzmmnpjlrxfjkabsl.supabase.co/functions/v1/receber-programacao-semanal`

**Cabeçalhos:**

| Chave | Valor |
|---|---|
| `Content-Type` | `application/json` |
| `x-integration-key` | A mesma chave secreta usada na integração do estoque |

## Corpo completo do HTTP no Power Automate

Dentro do segundo **Aplicar a cada**, use:

```json
{
  "excel_id": "@{item()?['ID']}",
  "fornecedor": "@{item()?['Fornecedor']}",
  "pedido": "@{item()?['Pedido']}",
  "fiscal": "@{item()?['Fiscal']}",
  "data_inicio": "@{item()?['Data Início']}",
  "data_fim": "@{item()?['Data Fim']}",
  "qtde_pecas": "@{item()?['Qtde Peças']}",
  "status": "@{item()?['Status']}",
  "observacoes": "@{item()?['Observações']}"
}
```

Não coloque vírgula depois de `observacoes`.

## Configuração do fluxo

1. Abra o fluxo horário que já sincroniza o arquivo `Controle estoque.xlsx`.
2. Depois das ações atuais, adicione outra ação **Listar linhas presentes em uma tabela**.
3. Selecione o mesmo arquivo e a tabela `tbProgramacaoSemanal`.
4. Adicione **Aplicar a cada** e, como entrada, selecione `value` da nova ação
   **Listar linhas presentes em uma tabela**.
5. Dentro desse segundo loop, adicione a ação **HTTP**.
6. Configure o método, URL, cabeçalhos e corpo mostrados acima.
7. Salve e use **Testar** uma vez. Depois disso, a recorrência horária executa
   automaticamente; não é necessário clicar em Testar novamente.

## Respostas esperadas

- `201` e `action: "created"`: nova programação criada;
- `200` e `action: "updated"`: programação existente atualizada;
- `200` e `action: "unchanged"`: a linha já estava igual;
- `200` e `action: "skipped"`: linha totalmente vazia;
- `400`: coluna obrigatória ausente ou valor inválido;
- `401`: chave `x-integration-key` incorreta.
