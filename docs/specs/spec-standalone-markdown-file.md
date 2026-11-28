# Especificação: Abertura de Arquivo Markdown Isolado (Standalone) sem Adicionar Pasta ao Workspace

**Status:** planejada  
**Data:** 2026-11-28  
**Autor:** Antigravity  
**Versão:** 1.0  

---

## 1. Resumo

Permitir que o usuário abra um documento Markdown (`.md`) isolado diretamente pelo Windows Explorer (ex.: duplo clique ou "Abrir com"), sem que a pasta onde o arquivo se encontra seja anexada automaticamente à lista de pastas abertas na barra lateral do MarkVault.

Caso o arquivo pertença a uma pasta que já está na barra lateral, ele continuará sendo aberto no contexto dessa pasta. Apenas pastas adicionadas explicitamente (via botão "Adicionar pasta" ou menu de contexto de pasta no Windows Explorer) devem fazer parte da lista persistente de vaults.

---

## 2. Motivação e Situação Atual

### 2.1 Comportamento Atual
Atualmente, quando o MarkVault é acionado com o caminho de um arquivo `.md` (`markvault.exe C:\caminho\nota.md`):
1. O backend Tauri chama `resolve_launch_target(&target, &roots)`.
2. Se o arquivo não pertence a um root já aberto, o sistema resolve a pasta pai (`parent = canonical.parent()`) e o nome do arquivo.
3. O backend invoca `attach_vault(&app, &mut guard, &root)` para a pasta pai do arquivo.
4. Em seguida, chama `persist_workspaces(&app, &guard)`, gravando a pasta em `workspaces.json`.
5. Como resultado, toda a pasta do arquivo aparece na barra lateral ("PASTAS ABERTAS"), poluindo o workspace com diretórios temporários, pastas de Downloads ou pastas com dezenas de outros arquivos que o usuário não desejava incluir no seu catálogo de notas.

### 2.2 Comportamento Desejado
- **Arquivo de pasta já monitorada:** abre o arquivo normalmente dentro da respectiva pasta na barra lateral.
- **Arquivo avulso/isolado:** o MarkVault abre apenas o arquivo no editor/preview. A pasta pai **não** é adicionada a `workspaces.json` nem exibida na seção "PASTAS ABERTAS".
- O usuário pode visualizar, editar, contar palavras e salvar (`Ctrl+S` / salvamento automático / detecção de conflitos externos) o arquivo avulso normalmente.

---

## 3. Arquitetura e Modelagem da Solução

### 3.1 Identificação de Documento Standalone
Um documento aberto é considerado **isolado/standalone** quando seu caminho absoluto não pertence a nenhum dos `workspaces` (pastas) cadastrados pelo usuário.

Podemos representar o arquivo standalone mantendo a semântica de segurança do `LocalFilesystemProvider` sem expor a pasta como um vault persistido:
- **Backend (Tauri/Rust):**
  - Diferenciar sessões com `workspaces` persistidos de uma pasta/arquivo efêmero ou permitir carregar um `standalone_file` no `WorkspaceSession`.
  - Como alternativa limpa e segura com as APIs atuais de Tauri:
    - O backend cria um provider restrito ou não adiciona a pasta à lista `persist_workspaces`.
    - Ao abrir um arquivo fora dos roots conhecidos:
      - A pasta pai pode ser manipulada em memória pelo backend apenas para leitura/escrita do arquivo específico (ou configurada com flag `is_standalone: true`), **sem** ser gravada em `workspaces.json` e **sem** ser retornada na lista de `workspaces` de navegação da barra lateral.
      - Ou `InitialFile` / `WorkspaceSession` retorna informações de `standalone_document: Option<StandaloneDocument>` com `full_path`, `content`, `saved`, `revision`.
  
### 3.2 IPC e Contratos (Tauri / Rust)
1. **Comandos IPC:**
   - `read_standalone_file(path: String) -> Result<Snapshot>` (ou ler via path absoluto verificado).
   - `write_standalone_file(path: String, content: String, expected_revision: String) -> Result<Snapshot>`.
   - Alternativa transparente: Manter `with_workspace` ou adicionar um identificador de workspace efêmero (`__standalone__` ou não salvo em `workspaces.json`), de forma que as operações de leitura, escrita e watcher funcionem exclusivamente para o arquivo aberto, sem poluir a lista `guard.vaults` persistida no disco.
2. **`resolve_launch_target`:**
   - Retornar se o arquivo faz parte de um workspace existente ou se é avulso (`is_standalone: bool`).
   - Se for avulso, não chamar `persist_workspaces`.

### 3.3 Frontend (Zustand & React)
- **`workspaceStore.ts`:**
  - Suportar `standaloneDocument: { fullPath: string; path: string; name: string; content: string; saved: string; revision: string } | null`.
  - Ou permitir que `document.workspacePath` indique que é um documento avulso (ex.: `isStandalone: true`).
  - O editor renderiza o documento avulso normalmente com o `MarkdownEditor` e `MarkdownPreview`.
  - `save()`, `edit()`, `reload()` e `overwrite()` funcionam perfeitamente para o arquivo avulso.
- **`App.tsx` & `FileTree.tsx`:**
  - A barra lateral lista exclusivamente `workspaces` persistidos.
  - Se apenas um arquivo avulso estiver aberto (sem nenhuma pasta na lista de vaults), a barra lateral exibe "Seus documentos, nas suas pastas." ou botão de "Adicionar pasta", enquanto o documento é exibido e editável no painel central.
  - O breadcrumb no topo exibe o nome do arquivo avulso (ou ícone indicando documento avulso) sem referência a uma pasta raiz que não foi aberta.

---

## 4. Requisitos

### Requisitos Funcionais (RF)
- **RF-01:** Ao abrir um arquivo `.md` via linha de comando ou explorer pertencente a uma pasta já cadastrada, o app deve focar o arquivo dentro dessa pasta existente.
- **RF-02:** Ao abrir um arquivo `.md` avulso (fora de qualquer pasta cadastrada), o MarkVault deve abrir o arquivo imediatamente no editor/leitor.
- **RF-03:** Ao abrir um arquivo avulso, a pasta do arquivo **NÃO** deve ser salva em `workspaces.json` nem exibida na barra lateral "PASTAS ABERTAS".
- **RF-04:** Alterações feitas no arquivo avulso devem ser salvas no disco no mesmo arquivo (`Ctrl+S` e autosave), mantendo prevenção de conflito externa.
- **RF-05:** Se o usuário fechar e reabrir o MarkVault sem parâmetros, os workspaces salvos continuam intactos e a pasta do arquivo avulso anterior não estará lá.

### Requisitos Não Funcionais (RNF)
- **RNF-01:** Compatibilidade com Windows Explorer e integração de menu de contexto (pastas continuam abrindo como pastas quando solicitado).
- **RNF-02:** Segurança contra links simbólicos maliciosos (manter `check_not_link`).
- **RNF-03:** Manter 100% de cobertura e passagem dos testes existentes de Rust e TypeScript.

---

## 5. Plano de Implementação

1. **Git:**
   - `git checkout main` e `git pull origin main`.
   - `git checkout -b feature/open-standalone-markdown-file`.
2. **Backend Rust:**
   - Ajustar `resolve_launch_target` e o fluxo de inicialização/evento `consume_external_open`.
   - Impedir que a pasta do arquivo avulso seja gravada em `persist_workspaces`.
   - Ajustar commands de leitura/escrita/observação para suportar o arquivo avulso.
3. **Frontend TypeScript:**
   - Adaptar `workspaceStore` e tipagens em `types.ts` para tratar documentos abertos sem workspace persistido.
   - Ajustar UI (`App.tsx`) para refletir título, status de salvamento e breadcrumb adequados.
4. **Testes:**
   - Testes unitários Rust (`resolve_launch_target` com arquivo isolado e não persistência em `workspaces.json`).
   - Testes unitários no Zustand (`workspaceStore.test.ts`).
