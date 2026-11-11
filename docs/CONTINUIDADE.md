# Continuidade — MarkVault 0.1.0

Registro de encerramento da sessão: **10/11/2026**, horário de São Paulo.

## Estado da versão

Implementação inicial do MVP criada no código. **Ainda não considerar a versão funcionalmente validada ou pronta para distribuição.** Não foi possível compilar nem abrir a janela desktop nesta sessão.

O escopo original está em `prompt.md`. A referência de stack foi o Alethe em `C:\codes\CodeHolistic\alethe-agents-local`, consultado somente para leitura. Manter React 18, TypeScript, Vite 6, Tauri 2/Rust, Zustand 5, CSS próprio, Lucide, React Markdown/GFM e Radix Dialog. CodeMirror 6 foi adicionado para edição com realce e números de linha.

## O que está implementado no código

- Seletor nativo de pasta e restauração do último workspace/documento.
- Árvore de diretórios, expansão/recolhimento e sidebar redimensionável.
- Criação de notas e pastas, renomeação e exclusão com confirmação.
- Editor CodeMirror, Preview, Leitura e modo Dividido.
- Busca por nome/caminho e atalhos Ctrl+P, Ctrl+N, Ctrl+S e Ctrl+\.
- Persistência direta em arquivos `.md` UTF-8, autosave de 700 ms e cache de rascunhos para recuperação.
- Escrita por arquivo temporário, sincronização e comparação de revisão SHA-256.
- Watcher nativo com `notify`, atualização da árvore/documento e tratamento de conflitos externos.
- Opções de usar a versão do disco, substituir pelo texto local ou salvar cópia; arquivo removido externamente permite recuperar o texto em uma cópia.
- Validação de caminhos relativos e recusa de saída da raiz, nomes Windows reservados, symlinks e junctions.
- Imagens locais e HTTPS, links entre notas e abertura de anexos permitidos no aplicativo padrão.
- Contrato `StorageProvider` com adaptador local. Nenhuma integração externa foi implementada ou simulada.
- Testes Vitest e Rust escritos, documentação e ícones PNG/ICO gerados.

## Onde continuar no código

| Arquivo/diretório | Responsabilidade |
| --- | --- |
| `src/components/App.tsx` | Layout, toolbar, modos, conflitos e atalhos |
| `src/components/MarkdownEditor.tsx` | CodeMirror e bloqueio de edição durante operações |
| `src/components/MarkdownPreview.tsx` | Markdown, imagens e links |
| `src/components/FileTree.tsx` | Árvore e ações de cada item |
| `src/components/ActionDialog.tsx` | Criação, renomeação, exclusão e cópia |
| `src/stores/workspaceStore.ts` | Estado, gravação serializada, conflitos e restauração |
| `src/stores/recovery.ts` | Cache de rascunhos por workspace/caminho |
| `src/hooks/useWorkspaceLifecycle.ts` | Inicialização, autosave, eventos e fechamento |
| `src/storage/` | Contrato do provedor e encapsulamento de IPC Tauri |
| `src-tauri/src/storage.rs` | Operações reais no disco, revisões e validação de caminhos |
| `src-tauri/src/lib.rs` | Comandos, seletor, watcher, anexos e configurações |
| `src-tauri/tauri.conf.json` | Janela, CSP, build e bundle Windows/NSIS |

Correções já incluídas que devem ser preservadas na próxima revisão:

- Salvar deve esperar também pelas edições feitas enquanto uma gravação estava em andamento, antes de navegar ou fechar.
- Operações de navegação/mutação usam estado ocupado; o editor fica temporariamente indisponível.
- Rascunhos de arquivos removidos podem ser restaurados ao reabrir o último documento.
- Rascunhos em conflito mantêm a revisão original, inclusive após editar e reiniciar novamente; não devem sobrescrever a versão externa automaticamente.
- Eventos de acesso do watcher são ignorados para evitar ciclos provocados pelas próprias leituras.

## Validação efetivamente realizada

**Passou:** `npm run test:core` / `node scripts/check-core.mjs`. Verifica funções puras de caminhos relativos, Unicode, detecção Markdown, isolamento e recuperação de rascunhos e cache corrompido.

**Passou, com alcance limitado:** análise sintática de sete módulos TypeScript sem JSX após remoção de tipos e leitura dos JSONs do projeto. Script auxiliar em `.tooling/check-source.mjs` (pasta ignorada). Isso não substitui TypeScript, ESLint ou build e não verifica TSX.

**Bloqueios observados:**

- `npm install`: registro npm retornou `EACCES` nas conexões.
- Instalação offline: `ENOTCACHED`; dependências necessárias ausentes no cache.
- Lint, Vitest e build foram tentados, mas não iniciaram: `eslint`, `vitest` e `tsc` não instalados.
- Rust/Cargo não estavam disponíveis no PATH; a localização habitual de Cargo também não estava disponível.
- Sem build nativo, inspeção visual, teste real da janela ou instalador gerado.
- `package-lock.json` e `Cargo.lock` ainda não foram gerados. Versionar os lockfiles após uma resolução bem-sucedida.

Não interpretar testes escritos como testes aprovados. Há detalhes e roteiro de aceite em `docs/VALIDATION.md`.

## Próximos passos, em ordem

1. Resolver o ambiente: acesso ao registro npm/crates.io, Rust estável MSVC, Visual Studio Build Tools com C++/Windows SDK e WebView2.
2. Instalar dependências e gerar os lockfiles reais.
3. Executar os comandos abaixo e corrigir erros de lint, tipos, testes ou APIs/dependências que surgirem. Essas verificações completas ainda não ocorreram.
4. Iniciar o aplicativo desktop e validar o roteiro de `docs/VALIDATION.md` usando uma pasta temporária.
5. Priorizar integridade dos arquivos: digitação durante salvamento, troca/fechamento com texto pendente, conflitos, erro de escrita, recuperação após encerramento forçado e tentativas de sair do workspace.
6. Inspecionar visualmente os quatro modos, sidebar, diálogos e resoluções menores; ajustar problemas encontrados.
7. Gerar o executável/instalador NSIS e testar seu fluxo essencial. Atualizar a documentação com os resultados observados antes de declarar o MVP concluído.

```powershell
cd C:\codes\CodeHolistic\MarkVault
npm install
npm run lint
npm test
npm run build
npm run test:rust
npm run app
# Depois de validar o aplicativo:
npm run desktop:build
```

Se a rede continuar bloqueada, `npm run test:core` funciona sem instalar dependências, mas não valida o aplicativo completo.

## Limites mantidos para esta versão

Um documento por vez; busca apenas por nome/caminho; tema escuro; sem sync, login, banco de dados de documentos, IA, grafo ou plugins. Limites de 16 MB por documento, 20 MB por imagem e 64 níveis de diretórios. Pastas `.git` e `node_modules` não aparecem na árvore.

As verificações de revisão e a substituição atômica não constituem uma transação com outros processos. Não há proteção completa contra alterações maliciosas de caminhos durante a operação, hardlinks existentes ou múltiplas instâncias. Trabalhar com pastas locais confiáveis e manter essas limitações explícitas.

Para retomar em outra conversa: **“Leia `docs/CONTINUIDADE.md` e continue o MarkVault a partir da validação do ambiente e do MVP.”**
