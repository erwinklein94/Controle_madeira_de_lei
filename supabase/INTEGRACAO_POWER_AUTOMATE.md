# Integração Excel Online → Power Automate → Supabase

Esta integração envia uma linha da tabela do Excel por requisição e faz `upsert`
em `public.registros`. O site já lê essa tabela, portanto um registro aceito passa
a aparecer nas telas conforme as políticas de acesso do usuário conectado.

## Endpoint e segurança

URL de produção:

```text
https://rgafzmmnpjlrxfjkabsl.supabase.co/functions/v1/receber-controle-estoque
```

Método: `POST`

Cabeçalhos obrigatórios:

```text
Content-Type: application/json
x-integration-key: <SEGREDO_DA_INTEGRACAO>
```

Não envie `service_role`, `sb_secret` ou qualquer chave privilegiada no Power
Automate ou no frontend. O fluxo conhece somente o segredo exclusivo da
integração. A credencial do banco é disponibilizada pelo Supabase apenas no
ambiente da Edge Function.

Crie um segredo longo e aleatório e configure-o no Supabase:

```powershell
supabase secrets set POWER_AUTOMATE_INTEGRATION_KEY="troque-por-um-segredo-longo" --project-ref rgafzmmnpjlrxfjkabsl
```

O mesmo valor deve ser salvo como entrada segura/variável protegida no Power
Automate. Ative **Entradas seguras** e **Saídas seguras** nas configurações da
ação HTTP para que o histórico do fluxo não mostre o cabeçalho.

## Colunas do Excel e JSON

Use uma coluna própria, por exemplo `ID Integração`, com um valor único, estável
e preenchido em cada linha. Esse valor não pode mudar entre execuções: é ele que
faz uma nova execução atualizar o registro anterior em vez de duplicá-lo. Não
use `guid()` diretamente no corpo da ação HTTP, pois um novo GUID seria criado a
cada execução. Se precisar gerar o ID no fluxo, grave-o de volta na linha antes
do HTTP.

| Coluna sugerida no Excel | Campo JSON | Obrigatório | Observação |
|---|---|---:|---|
| ID Integração | `excel_id` | Sim | Único e estável; até 200 caracteres |
| Data | `data_ref` | Não | Aceita `DD/MM/AAAA`, `AAAA-MM-DD` ou o número serial do Excel |
| Semana | `semana` | Não | Número inteiro de 1 a 53 |
| Fiscal | `fiscal` | Não | Texto |
| Fornecedor | `fornecedor` | Sim | Texto; usado ao criar um pedido ainda inexistente |
| Local | `local` | Não | Texto |
| Pedido | `pedido` | Sim | Número/código tratado como texto |
| ID Pedido Supabase | `pedido_id` | Não | UUID; use somente se ele já existir no Supabase |
| Volume do Pedido | `vol_pedido` | Não | Número não negativo; padrão `0` |
| Volume a Fabricar | `vol_fabricar` | Não | Número não negativo; padrão `0` |
| Volume Fabricado | `vol_pronto` | Não | Número não negativo; padrão `0` |
| Volume Inspecionado | `vol_inspecionado` | Não | Número não negativo; padrão `0` |
| Volume em Estoque | `vol_liberado` | Não | Número não negativo; padrão `0` |
| Volume Transportado | `vol_transportado` | Não | Número não negativo; padrão `0` |

Exemplo completo do JSON:

```json
{
  "excel_id": "ESTOQUE-000123",
  "data_ref": "2026-07-22",
  "semana": 30,
  "fiscal": "Maria Silva",
  "fornecedor": "Fornecedor A",
  "local": "Pátio Norte",
  "pedido": "4500123456",
  "pedido_id": null,
  "vol_pedido": 1200,
  "vol_fabricar": 300,
  "vol_pronto": 250,
  "vol_inspecionado": 200,
  "vol_liberado": 180,
  "vol_transportado": 150
}
```

O endpoint aceita números JSON e textos numéricos com ponto ou vírgula decimal.
Se o pedido ainda não existir, a função cria `public.pedidos` e então grava o
registro. Se já existir, fornecedor, local e volume total do pedido são
normalizados pelo cadastro mestre do site.

## Configuração no Power Automate

Depois de **Listar linhas presentes em uma tabela**:

1. Adicione **Aplicar a cada** e selecione a saída `value` da ação do Excel.
2. Dentro do loop, adicione a ação **HTTP**.
3. Defina o método como `POST` e use a URL informada acima.
4. Adicione os dois cabeçalhos obrigatórios.
5. Monte o corpo com os conteúdos dinâmicos da linha atual. Os nomes das
   colunas podem ser diferentes; o lado esquerdo deve manter os campos JSON da
   tabela acima.
6. Em **Configurações** da ação, ative entradas e saídas seguras. Configure uma
   política de repetição exponencial para erros transitórios (`429`/`5xx`).

Modelo de corpo usando expressões (ajuste o nome interno da ação/colunas):

```json
{
  "excel_id": "@{item()?['ID']}",
  "data_ref": "@{item()?['Data']}",
  "semana": "@{item()?['Semana']}",
  "fiscal": "@{item()?['Fiscal']}",
  "fornecedor": "@{item()?['Fornecedor']}",
  "local": "@{item()?['Local']}",
  "pedido": "@{item()?['Pedido']}",
  "vol_pedido": "@{item()?['Volume do Pedido']}",
  "vol_fabricar": "@{item()?['Volume a ser Fabricado']}",
  "vol_pronto": "@{item()?['Volume Fabricado']}",
  "vol_inspecionado": "@{item()?['Volume Inspecionado']}",
  "vol_liberado": "@{item()?['Volume em Estoque para Entrega']}",
  "vol_transportado": "@{item()?['Volume Transportado']}"
}
```

Use `item()` dentro do **Aplicar a cada**. Não aplique `formatDateTime()` à
coluna Data: dependendo do conector, o Excel pode entregar a data como número
serial. A Edge Function já converte os três formatos aceitos. Linhas sem
Fornecedor ou sem Pedido (inclusive linhas de fórmulas que retornam zero) são
ignoradas com sucesso e não interrompem o fluxo.

Para a primeira carga, limite a concorrência do **Aplicar a cada** ou deixe-a
desativada. A função suporta chamadas paralelas, mas uma carga gradual facilita
acompanhar respostas e corrigir linhas inválidas.

## Implantação

Aplique a migration e publique a função com o Supabase CLI conectado ao projeto:

```powershell
supabase db push
supabase functions deploy receber-controle-estoque --project-ref rgafzmmnpjlrxfjkabsl
```

O arquivo `supabase/config.toml` desativa apenas a validação JWT dessa função.
Isso é necessário para uma chamada externa do Power Automate; o código continua
exigindo `x-integration-key` antes de ler ou gravar dados.

## Teste

Teste em PowerShell, substituindo o segredo:

```powershell
$headers = @{ "x-integration-key" = "troque-por-um-segredo-longo" }
$body = @{
  excel_id = "TESTE-POWER-AUTOMATE-001"
  data_ref = "2026-07-22"
  semana = 30
  fiscal = "Fiscal Teste"
  fornecedor = "Fornecedor Teste"
  local = "Local Teste"
  pedido = "PEDIDO-TESTE-001"
  vol_pedido = 100
  vol_fabricar = 80
  vol_pronto = 60
  vol_inspecionado = 50
  vol_liberado = 40
  vol_transportado = 30
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "https://rgafzmmnpjlrxfjkabsl.supabase.co/functions/v1/receber-controle-estoque" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $body
```

Resultado esperado na primeira chamada: HTTP `201`, `action: "created"`.
Repita com o mesmo `excel_id` e um volume diferente; o esperado é HTTP `200`,
`action: "updated"`, mantendo o mesmo `registro.id`.

Consultas de verificação no SQL Editor:

```sql
select id, excel_id, pedido, fornecedor, vol_transportado, integrado_em
from public.registros
where excel_id = 'TESTE-POWER-AUTOMATE-001';

select excel_id, count(*)
from public.registros
where excel_id is not null
group by excel_id
having count(*) > 1;
```

A segunda consulta deve retornar zero linhas. Para remover somente os dados de
teste, confirme o identificador e execute:

```sql
delete from public.registros where excel_id = 'TESTE-POWER-AUTOMATE-001';
delete from public.pedidos where numero = 'PEDIDO-TESTE-001';
```

Respostas comuns: `400` para JSON/campo inválido, `401` para segredo incorreto,
`405` para método diferente de POST, `415` para `Content-Type` incorreto e `500`
para erro de configuração ou banco. Consulte **Edge Functions → Logs** no painel
do Supabase para diagnosticar um `500`; o retorno público não expõe detalhes do
banco.
