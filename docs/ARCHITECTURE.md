# Arquitetura e decisões

```text
src/
  components/    shell, árvore, diálogos, CodeMirror e MarkdownPreview
  hooks/         autosave, watcher, fechamento e restauração
  stores/        estado do workspace e cache de recuperação
  storage/       contrato StorageProvider e adaptador local Tauri
  styles/        tema escuro e layout
src-tauri/
  src/lib.rs     comandos IPC, seletor nativo, eventos e estado autorizado
  src/storage.rs operações de arquivos, limites e validação de caminhos
  capabilities/ permissões mínimas da webview
docs/            discovery e validação
```

## Fluxo de dados

Os componentes usam o store Zustand. O store recebe um `StorageProvider`, com operações de listagem, leitura, escrita, criação, renomeação, exclusão e observação. O adaptador `LocalFilesystemProvider` traduz essas operações em comandos Tauri. O backend mantém somente a pasta escolhida pelo seletor nativo ou a última pasta previamente autorizada, persistida nos dados da aplicação.

O editor recebe texto e devolve alterações; não conhece IPC, caminhos absolutos, Google Drive ou Git. A renderização recebe o documento e resolve links relativos pelo adaptador. Os componentes não chamam `invoke` diretamente.

## Persistência e conflitos

Arquivos Markdown são a fonte de verdade. Configurações mínimas ficam no diretório de dados da aplicação e no localStorage da webview; o cache de rascunhos serve somente para recuperação. Nenhum banco de dados é usado.

Cada leitura devolve conteúdo e revisão SHA-256. A escrita exige a revisão esperada, cria um temporário na mesma pasta, sincroniza, verifica a revisão novamente e substitui o arquivo. Um mutex serializa operações locais do backend. O frontend serializa salvamentos e espera que novas edições feitas durante uma gravação também sejam persistidas antes de navegar ou fechar.

O watcher `notify` dispara eventos sem conceder acesso a caminhos. O frontend agrupa eventos por 180 ms, relê a árvore e compara o documento aberto. Leituras não disparam ciclos de atualização porque eventos de acesso são ignorados. Erros do watcher são apresentados; atualização manual permanece disponível.

Documentos limpos recebem alterações externas; documentos alterados entram em conflito. Escolher a versão local exige nova verificação da revisão externa. Arquivos desaparecidos permitem salvar cópia. Esta abordagem detecta conflitos comuns sem introduzir merge automático ou versionamento.

## Limite do workspace

O frontend envia caminhos relativos. O backend rejeita caminhos absolutos, componentes de subida, prefixos Windows, nomes reservados, fluxos alternativos, links simbólicos e reparse points/junctions. Caminhos existentes são canonicalizados e comparados com a raiz autorizada. Novos arquivos exigem pai existente e usam criação exclusiva. A raiz não pode ser excluída nem renomeada pelos comandos.

Somente `.md` pode ser editado; imagens têm formatos e limites explícitos. Anexos abrem apenas por uma lista de extensões de documentos. Não se expõe um comando genérico de shell nem uma permissão ampla de filesystem à webview. A CSP restringe scripts, frames e protocolos; HTML Markdown não é executado.

A validação protege contra acessos acidentais. Não há garantia contra um processo hostil alterando links/arquivos entre a verificação e a operação, hardlinks previamente existentes ou uma gravação externa no intervalo final entre checagem e substituição. Também não existe lock cooperativo entre múltiplas instâncias. O MVP trabalha com pastas locais confiáveis.

## Evolução de provedores

`StorageProvider` delimita as operações consumidas pelo estado e editor. Implementações futuras para Google Drive e Box poderão traduzir listagem, identidade/revisão, escrita e eventos para suas APIs. O contrato de revisão deverá continuar representando controle de concorrência, sem assumir que todo provedor usa SHA-256.

GitHub exige uma implementação baseada em repositórios Git: clone/checkout, índice, commits, pull/push, autenticação e conflitos próprios. Não deverá ser tratado apenas como filesystem remoto. Se necessário, o contrato ganhará capacidades específicas de sincronização em uma camada separada. Não existem implementações vazias, botões de integração fictícios ou sincronização nesta versão.

## Interface

Quatro modos: Markdown, Preview, Leitura e Dividido. Leitura remove explorador e ferramentas de escrita, amplia tipografia e mantém acesso à troca de modo. A sidebar usa separador redimensionável e navegação por botões acessíveis. Diálogos Radix cuidam do foco e do fechamento por Escape. O tema usa variáveis CSS para permitir um tema claro futuro sem criar essa funcionalidade antecipadamente.
