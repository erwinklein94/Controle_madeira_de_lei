# Programação Semanal — Excel Online → Power Automate → Site

## Colunas da segunda tabela do Excel

Transforme os dados da segunda aba em uma **Tabela** do Excel e dê a ela o nome
`tbProgramacaoSemanal`.

| Coluna no Excel | Obrigatória | Uso no site |
|---|---:|---|
| ID Programação | Sim | Identificador único da linha; evita duplicações |
| Ano | Sim | Ano da programação |
| Semana | Sim | Número da semana, de 1 a 53 |
| Fiscal | Sim | Fiscal programado |
| Fornecedor | Não | Fornecedor que será visitado |
| Local | Sim | Local da inspeção |
| Expectativa de Peças | Sim | Quantidade prevista para inspeção |
| Observações | Não | Orientações adicionais |

Não altere o `ID Programação` de uma linha já enviada. Quando o mesmo ID for
recebido novamente, o registro existente será atualizado.

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
  "excel_id": "@{item()?['ID Programação']}",
  "ano": "@{item()?['Ano']}",
  "semana": "@{item()?['Semana']}",
  "fiscal": "@{item()?['Fiscal']}",
  "fornecedor": "@{item()?['Fornecedor']}",
  "local": "@{item()?['Local']}",
  "expectativa_pecas": "@{item()?['Expectativa de Peças']}",
  "observacoes": "@{item()?['Observações']}"
}
```

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
