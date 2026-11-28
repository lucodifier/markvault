# Runbook: Ciclo de Vida e Gestão de Especificações (Specs)

**Objetivo:** Padronizar como propor, aprovar, implementar e concluir especificações técnicas no MarkVault.

---

## Estrutura de Arquivos

Todas as especificações técnicas residem em:
- `docs/specs/`
  - `index.md`: Tabela com o índice de todas as especificações e seus status.
  - `<nome-da-spec>.md`: Documento individual detalhado da especificação.

---

## Status Possíveis

| Status | Significado | Próxima Ação |
| :--- | :--- | :--- |
| **`rascunho`** | Em elaboração inicial; escopo ou viabilidade técnica ainda em discussão. | Refinar e detalhar requisitos até aprovação. |
| **`planejada`** | Aprovada e pronta para execução. Nenhum código foi alterado ainda. | Criar branch a partir da `main` e implementar. |
| **`executada`** | Implementada no código, validada nos testes e mesclada na `main`. | Spec finalizada; reflete o comportamento real. |
| **`rejeitada`** | Descartada ou substituída por outra solução arquitetural. | Arquivada como referência histórica de decisão. |

---

## Fluxo de Trabalho (Passo a Passo)

### 1. Criação da Spec
1. Crie o arquivo `docs/specs/<nome-da-spec>.md` com a estrutura padrão:
   - Resumo
   - Motivação e Situação Atual vs Desejada
   - Arquitetura Proposta e Contratos (IPC / Stores / UI)
   - Requisitos Funcionais (RF) e Não-Funcionais (RNF)
   - Plano de Implementação
2. Defina o status inicial como `rascunho` ou `planejada`.
3. Registre a nova spec na tabela de `docs/specs/index.md`.

### 2. Implementação
1. Certifique-se de que a `main` está atualizada:
   ```bash
   git checkout main && git pull origin main
   ```
2. Crie uma branch específica:
   ```bash
   git checkout -b feature/<nome-da-feature>
   ```
3. Desenvolva as alterações orientando-se estritamente pelos requisitos da spec.

### 3. Conclusão e Atualização de Status
1. Valide a implementação (`npm test`, `npm run test:rust`, `npm run lint`).
2. Atualize o status da spec para **`executada`** tanto no cabeçalho de `<nome-da-spec>.md` quanto na tabela de `docs/specs/index.md`.
3. Atualize `docs/CONTINUIDADE.md` e `docs/VALIDATION.md` se aplicável.
4. Faça o commit e merge para a `main`.
