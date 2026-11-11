# Discovery da ferramenta multiagente

Referência localizada e inspecionada somente para leitura: `C:\codes\CodeHolistic\alethe-agents-local`. A descrição do README identifica o Alethe como workspace local de múltiplos agentes. Há outra cópia em `C:\codes\agents\alethe-agents`; a referência utilizada foi a cópia em CodeHolistic. Nenhum arquivo do projeto original foi alterado.

Foram examinados `package.json`, cabeçalho e versões do `package-lock.json` (lockfile npm v3), `vite.config.ts`, `tsconfig.json`, `eslint.config.js`, `src-tauri/Cargo.toml`, README, diretórios de código, store de interface e CSS de tema.

| Área | Referência | MarkVault |
| --- | --- | --- |
| Frontend | React 18 | React 18 |
| Linguagem | TypeScript estrito | TypeScript estrito |
| Runtime desktop/backend | Tauri 2, Rust 2021 | Tauri 2, Rust 2021 |
| Comunicação | Comandos Tauri encapsulados em `src/lib/tauri`, eventos | `LocalFilesystemProvider` encapsula IPC; eventos de workspace |
| Componentes | React próprio, Radix Dialog/Focus Scope | React próprio, Radix Dialog |
| Estilização | CSS próprio, variáveis de tema | CSS próprio, variáveis de tema |
| Estado | Zustand 5 em `src/stores` | Zustand 5 em `src/stores` |
| Ícones | Lucide React | Lucide React |
| Markdown | React Markdown 9, remark-gfm 4 | Mesmas bibliotecas |
| Build | Vite 6, TypeScript, Tauri CLI | Mesma família |
| Qualidade | ESLint, Vitest, testes Rust; WDIO para E2E | ESLint, Vitest, testes Rust; roteiro manual Windows |
| Pacotes | npm/package-lock | npm; instalação bloqueada nesta sessão |

O projeto de referência contém `src/components`, `src/hooks`, `src/lib`, `src/stores`, `src/styles`, `src/test` e `src-tauri`. São reaproveitados os padrões de separação entre componentes, hooks, estado e IPC, o uso de tipos explícitos e o backend Rust para recursos nativos. Não há servidor HTTP adicional.

CodeMirror 6 é a adição especializada para edição Markdown, fornecendo realce, histórico e números de linha. Não altera os frameworks da aplicação. `notify`, já utilizado no Alethe, monitora o disco. `sha2` gera revisões de conteúdo; `tempfile` evita truncar o arquivo de destino durante a escrita; `base64` transporta imagens locais validadas para a webview. O plugin oficial Tauri Opener abre anexos e links aprovados pelo backend.

Os componentes foram escritos para MarkVault; nenhum código, fonte, ícone ou marca do Alethe foi copiado. Ferramentas exclusivas do multiplexer, terminais, agentes e banco de dados não foram trazidas para este MVP.

A organização adotada é `src/components` para UI/editor/renderização, `src/hooks` para ciclo de vida, `src/stores` para workspace/rascunhos, `src/storage` para contrato e adaptador e `src-tauri/src` para comandos e operações de arquivos. Essa estrutura mantém o editor independente dos detalhes do provedor.
