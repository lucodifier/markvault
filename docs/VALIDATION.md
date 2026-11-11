# Validação da implementação inicial

## Resultado observado nesta sessão

| Verificação | Resultado |
| --- | --- |
| `node scripts/check-core.mjs` | PASS: confinamento de links relativos, Unicode, identificação Markdown, isolamento e recuperação de rascunhos, cache corrompido |
| `npm install` | Bloqueado: conexões com `registry.npmjs.org` retornaram `EACCES` |
| `npm install --offline` | Bloqueado: `ENOTCACHED` para dependências necessárias |
| `npm run lint` | Não iniciou: `eslint` não instalado |
| `npm test` | Não iniciou: `vitest` não instalado |
| `npm run build` | Não iniciou: `tsc` não instalado |
| `cargo test --manifest-path src-tauri/Cargo.toml` | Não iniciou: Cargo não encontrado |
| Executável/instalador Windows | Não gerado; depende da instalação e compilação acima |
| Inspeção visual e operação real da janela Windows | Pendente; não foi possível iniciar o aplicativo |

Os checks Node exercitam somente funções puras, não provam funcionamento de React, Zustand, watcher nativo ou Tauri. A presença de testes no código não significa que eles foram executados. Não há conclusão de aceite do MVP nesta entrega.

## Testes escritos

- Vitest: abrir/restaurar workspace, listar documentos, ler, editar, salvar, criar, renomear, excluir, receber notificações externas, conflitos, decisões local/disco, falhas de leitura/escrita, recuperação após remoção externa e salvamentos concorrentes.
- Rust: CRUD em diretórios temporários reais, conteúdo UTF-8, revisão, alterações externas, falhas, preservação em operações inválidas, nomes Windows, travessia de caminhos e symlinks/junctions.

## Roteiro manual Windows antes do aceite

Use uma pasta temporária com documentos e anexos de teste, sem dados únicos.

1. Execute `npm install`, `npm run lint`, `npm test`, `npm run build` e `npm run test:rust`; corrija eventuais erros antes de prosseguir.
2. Execute `npm run app`. Verifique abertura da janela e ausência de erros na webview.
3. Abra a pasta pelo seletor; confirme cancelamento sem trocar workspace. Expanda/recolha diretórios e ajuste a largura da sidebar com mouse e teclado.
4. Abra um `.md` UTF-8 com acentos/emoji. Edite, desfaça/refaça, aguarde autosave e confira o arquivo no disco. Digite enquanto salva; troque rapidamente de nota e feche a janela. Confirme o último texto no disco.
5. Verifique os quatro modos com títulos, listas, tabelas GFM, tarefas, citações, código, imagens locais e HTTPS, link para outra nota e PDF relativo. Leitura deve aproveitar a área da janela. Teste também em 800×600.
6. Crie documento e diretório na raiz e em uma subpasta. Renomeie ambos com nota aberta. Tente nomes duplicados, nomes reservados, extensão inválida e caminhos fora da raiz; confirme mensagens de erro sem modificar arquivos existentes.
7. Cancele uma exclusão. Confirme outra usando arquivos de teste e confira o resultado no disco, inclusive anexos de uma pasta excluída.
8. Crie, renomeie e exclua arquivos no Explorer com o aplicativo aberto. Confirme atualização da árvore. Altere a nota limpa por outro editor e confirme releitura.
9. Edite localmente e externamente antes do autosave; confirme que o texto externo não é substituído silenciosamente. Teste usar disco, substituir pelo texto local e salvar cópia. Remova externamente a nota aberta e salve uma cópia.
10. Torne um documento somente leitura e tente salvar. Confirme erro, preservação do texto e bloqueio de navegação/fechamento até resolver. Force o encerramento com um rascunho e reabra para verificar recuperação, incluindo arquivo removido externamente.
11. Teste imagens e links com `../` dentro da raiz e tentativa de sair dela. Teste uma junction para outra pasta; não deve aparecer nem permitir leitura/escrita.
12. Feche e reabra normalmente. Confirme restauração da pasta/nota e permanência do conteúdo. Compile com `npm run desktop:build` e repita o fluxo essencial no executável e no instalador NSIS.

Registre versões de Node, Rust, Windows e WebView2 e os resultados efetivos antes de marcar o MVP concluído.
