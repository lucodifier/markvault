# MarkVault

Aplicativo desktop de conhecimento pessoal baseado em arquivos Markdown locais. O conteúdo permanece em arquivos `.md` UTF-8; não há banco de dados de documentos, autenticação ou sincronização.

Para retomar o desenvolvimento, consulte [o registro da versão 0.1.0 e próximos passos](docs/CONTINUIDADE.md).

**Estado desta entrega:** implementação inicial criada; validação completa pendente. O ambiente de desenvolvimento desta sessão bloqueou o registro npm com `EACCES`, não tinha as dependências em cache e não disponibilizou Rust/Cargo. Portanto, o aplicativo e o instalador Windows ainda não foram compilados nem executados. Veja [VALIDATION.md](docs/VALIDATION.md).

## Instalar e executar no Windows

Pré-requisitos:

- Node.js 22 LTS ou posterior e npm.
- Rust estável com toolchain MSVC (`rustup`, `cargo`, `rustc` no PATH).
- Visual Studio Build Tools com **Desktop development with C++** e Windows SDK.
- Microsoft Edge WebView2 Runtime.
- Acesso aos registros npm e crates.io para a primeira instalação.

No PowerShell, dentro de MarkVault:

```powershell
npm install
npm run app
```

A primeira compilação Rust pode levar alguns minutos. `npm run app` inicia Vite e o aplicativo Tauri. `npm run dev` abre apenas o frontend: acesso a arquivos exige o aplicativo desktop; não existe backend simulado no navegador.

O lockfile npm e o Cargo.lock deverão ser gerados e versionados após a primeira resolução bem-sucedida. Não foram inventados lockfiles sem instalar as dependências.

## Usar

1. Clique em **Abrir pasta local** e autorize uma pasta no seletor nativo.
2. Navegue na árvore e abra um `.md`, ou crie um documento pelo ícone de nova nota.
3. Edite com realce Markdown, números de linha e desfazer/refazer.
4. Alterne entre **Markdown**, **Dividido**, **Preview** e **Leitura**.
5. O salvamento ocorre após 700 ms sem edição. `Ctrl+S` salva imediatamente.
6. Use as ações `…` de cada item para criar filhos, renomear ou excluir. A exclusão exige confirmação e é permanente; excluir uma pasta remove também seus anexos.

`Ctrl+P` localiza documentos pelo nome/caminho, `Ctrl+N` cria uma nota e `Ctrl+\` alterna o explorador. A largura da sidebar pode ser ajustada arrastando sua borda; o separador também aceita as setas do teclado.

A última pasta e o último documento são restaurados na próxima abertura. Rascunhos de emergência ficam no armazenamento local da webview, separados por workspace e caminho, e são removidos após salvar. Eles não substituem os arquivos Markdown e não constituem histórico ou backup.

## Alterações externas e conflitos

Um watcher nativo monitora a pasta. A árvore é atualizada; documentos sem alterações locais são recarregados. Foco da janela e o botão **Atualizar arquivos** também provocam releitura.

Quando há texto local pendente e uma versão externa diferente, o autosave é interrompido. Você pode comparar o texto externo e escolher:

- Usar a versão do disco, descartando explicitamente o rascunho atual.
- Substituir o disco pelo texto local; a revisão externa é conferida novamente antes de gravar.
- Salvar o texto local em uma cópia, preservando ambos.

Se o arquivo desaparecer, o texto permanece disponível para salvar uma cópia. Falhas de escrita bloqueiam a troca de documento e o fechamento normal da janela para permitir recuperação. O fechamento forçado do processo depende do cache de rascunhos e não garante durabilidade em caso de falha do sistema operacional.

## Markdown e anexos

Preview com títulos, listas, tarefas, tabelas GFM, citações, links, imagens e blocos de código. Links relativos para `.md` abrem no editor. Imagens locais PNG, JPEG, GIF, WebP e AVIF usam caminhos relativos ao documento, contidos no workspace. Imagens HTTPS também são suportadas.

Links relativos para PDF, TXT, CSV, documentos Office/OpenDocument e imagens abrem no aplicativo padrão do Windows. HTTP(S) e `mailto:` abrem externamente. Outros protocolos, executáveis, SVG e caminhos fora do workspace são recusados. HTML arbitrário não é executado.

## Qualidade

```powershell
npm run lint
npm test
npm run build
npm run test:rust
```

Com Node.js 22.13+ também é possível executar checks limitados de caminhos e recuperação sem instalar pacotes:

```powershell
node scripts/check-core.mjs
```

Esse comando não valida React, Zustand, Tauri ou o sistema de arquivos nativo. Os testes Vitest abrangem ciclo de edição, concorrência de salvamentos, conflitos, falhas e recuperação. Os testes Rust usam diretórios temporários reais para CRUD, UTF-8, listagem, conflitos e confinamento.

## Gerar executável e instalador

```powershell
npm run desktop:build
```

Após uma compilação bem-sucedida, o executável fica em `src-tauri/target/release/markvault.exe` e o instalador NSIS em `src-tauri/target/release/bundle/nsis/`. O instalador inicial não tem assinatura de código. O alvo configurado é Windows/NSIS; outros sistemas exigem configurar seus respectivos bundles.

## Limitações conhecidas

- Ainda é necessário executar lint, Vitest, compilação Rust e o roteiro manual Windows em um ambiente com as ferramentas e dependências.
- Um documento aberto por vez; busca por nome/caminho, sem busca no conteúdo.
- Limite de 16 MB por documento, 20 MB por imagem e 64 níveis de diretórios. A árvore é carregada integralmente; grandes coleções não foram avaliadas.
- `.git`, `node_modules`, arquivos temporários internos e links/junctions são omitidos da árvore. Anexos ficam no disco e são acessados por links, sem listagem própria.
- Gravação atômica com duas verificações de revisão reduz conflitos; não oferece bloqueio transacional contra processos externos nem proteção contra alterações maliciosas de caminhos no mesmo instante da operação. O workspace deve ser uma pasta local confiável.
- Tema escuro inicial; ainda não há tema claro, abas múltiplas, sincronização, grafo, IA ou plugins.

Detalhes em [arquitetura](docs/ARCHITECTURE.md), [discovery](docs/DISCOVERY.md) e [validação](docs/VALIDATION.md).
