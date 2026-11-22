# Continuidade — MarkVault 0.3.0

Registro de estado atualizado em **22/11/2026**.

## Estado da versão

Versão **0.3.0** estável, validada (lint, Vitest, build e testes Rust) e distribuída como instalador NSIS na página de releases do GitHub. Decisão do autor: a versão atual está boa; **não alterar código sem nova demanda**.

Histórico resumido:

- **0.1.0** — MVP: pasta como cofre, editor com 4 modos, autosave seguro, watcher e conflitos.
- **0.2.0** — várias pastas abertas, menu de contexto (copiar caminho/link), associação de arquivos `.md`, quebras de linha e diagramas Mermaid.
- **0.3.0** — URLs no editor ficam sublinhadas e abrem no navegador padrão com Ctrl/Cmd+clique.

O escopo original está em [`prompt.md`](prompt.md). A referência de stack foi o Alethe (somente leitura). Manter React 18, TypeScript, Vite 6, Tauri 2/Rust, Zustand 5, CSS próprio, Lucide, React Markdown/GFM, Radix Dialog e CodeMirror 6.

## O que está implementado

- Seletor nativo de pasta, **múltiplos workspaces abertos** e restauração dos workspaces/documento anteriores.
- Abertura de arquivo `.md` ou pasta pelo sistema (associação do instalador e argumento de linha de comando).
- Árvore de diretórios, criar/renomear/excluir com confirmação, sidebar redimensionável e menu de contexto.
- Editor CodeMirror, Preview, Leitura e modo Dividido; URLs clicáveis com Ctrl/Cmd+clique.
- Preview com GFM, quebras de linha, diagramas Mermaid, imagens locais/HTTPS e links entre notas.
- Busca por nome/caminho (sem acentos) e no conteúdo; atalhos Ctrl+P, Ctrl+Shift+F, Ctrl+N, Ctrl+S, Ctrl+\.
- Persistência direta em `.md` UTF-8, autosave de 700 ms, escrita atômica com revisão SHA-256 e cache de rascunhos.
- Watcher nativo, tratamento de conflitos externos (usar disco, substituir, salvar cópia).
- Validação de caminhos (sem saída da raiz, nomes reservados, symlinks e junctions).
- Contrato `StorageProvider` com adaptador local; nenhuma integração externa foi implementada ou simulada.

## Onde continuar no código

| Arquivo/diretório | Responsabilidade |
| --- | --- |
| `src/components/App.tsx` | Layout, toolbar, modos, conflitos e atalhos |
| `src/components/MarkdownEditor.tsx` | CodeMirror, links clicáveis e bloqueio de edição |
| `src/components/MarkdownPreview.tsx` | Markdown, imagens, links e quebras de linha |
| `src/components/MermaidDiagram.tsx` | Renderização de diagramas Mermaid |
| `src/components/FileTree.tsx` | Árvore, workspaces e menu de contexto |
| `src/components/ActionDialog.tsx` | Criação, renomeação, exclusão e cópia |
| `src/components/SearchDialog.tsx`, `ContentSearchDialog.tsx` | Busca por nome e por conteúdo |
| `src/stores/workspaceStore.ts` | Estado, gravação serializada, conflitos, restauração e múltiplos workspaces |
| `src/stores/recovery.ts` | Cache de rascunhos por workspace/caminho |
| `src/hooks/useWorkspaceLifecycle.ts` | Inicialização, autosave, eventos e fechamento |
| `src/storage/` | Contrato do provedor e encapsulamento de IPC Tauri |
| `src-tauri/src/storage.rs` | Operações no disco, revisões e validação de caminhos |
| `src-tauri/src/lib.rs` | Comandos, seletor, watchers, abertura externa, anexos e configurações |
| `src-tauri/nsis/hooks.nsh` | Associação de `.md` no instalador |
| `src-tauri/tauri.conf.json` | Janela, CSP, build e bundle Windows/NSIS |
| `site/` | Landing page publicada via GitHub Pages |

Correções que devem ser preservadas:

- Salvar espera também pelas edições feitas durante uma gravação, antes de navegar ou fechar.
- Navegação/mutação usam estado ocupado; o editor fica temporariamente indisponível.
- Rascunhos de arquivos removidos podem ser restaurados; rascunhos em conflito mantêm a revisão original e nunca sobrescrevem a versão externa automaticamente.
- Eventos de acesso do watcher são ignorados para evitar ciclos provocados por leituras.

## Validação

Resultados e roteiro manual em [`VALIDATION.md`](VALIDATION.md). Comandos:

```powershell
npm install
npm run lint
npm test
npm run build
npm run test:rust
npm run app            # desenvolvimento
npm run desktop:build  # executável e instalador NSIS
```

Pré-requisitos: Node.js 22+, Rust estável MSVC, Visual Studio Build Tools (C++/Windows SDK) e WebView2. `npm run test:core` roda sem dependências, mas valida apenas funções puras.

## Publicação de uma versão

1. Atualizar a versão em `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` e `src-tauri/tauri.conf.json`.
2. Atualizar README, `site/index.html` e esta documentação.
3. Rodar lint, testes, build e `npm run desktop:build`.
4. Commit, tag `vX.Y.Z`, push e `gh release create` anexando `src-tauri/target/release/bundle/nsis/MarkVault_X.Y.Z_x64-setup.exe`.

A landing page é publicada pelo workflow `.github/workflows/pages.yml` quando `site/**` muda na `main`.

## Ideias futuras (fora do escopo atual)

Abas, tema claro, grafo de notas, assinatura de código, integração com provedores (Google Drive/Box via `StorageProvider`; GitHub exigiria camada Git própria).

## Limites mantidos

Um documento aberto por vez; tema escuro; sem sync, login, banco de dados, IA, grafo ou plugins. Limites de 16 MB por documento, 20 MB por imagem e 64 níveis de diretórios. Pastas `.git` e `node_modules` não aparecem na árvore.

As verificações de revisão e a substituição atômica não são uma transação com outros processos. Não há proteção completa contra alterações maliciosas de caminhos durante a operação, hardlinks existentes ou múltiplas instâncias. Trabalhar com pastas locais confiáveis.

Para retomar em outra conversa: **“Leia `docs/CONTINUIDADE.md` e continue o MarkVault.”**
