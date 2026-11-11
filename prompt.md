# Projeto: Personal Knowledge Base — Editor Markdown Local

## 1. Objetivo

Quero desenvolver um aplicativo desktop de gerenciamento de conhecimento pessoal, inspirado na experiência do Obsidian.

A proposta inicial é simples: um aplicativo que permite selecionar uma pasta local, navegar pelos seus arquivos Markdown (`.md`), editar documentos e visualizar o conteúdo renderizado.

Os documentos devem continuar sendo arquivos Markdown convencionais no sistema de arquivos. O aplicativo não deve depender de banco de dados para armazenar o conteúdo.

O projeto deverá ser preparado arquiteturalmente para futuras integrações com Google Drive, Box e GitHub, permitindo sincronizar os documentos com serviços externos em versões futuras.

**Importante: não quero construir um concorrente completo do Obsidian neste primeiro momento. Quero um MVP funcional, bem estruturado e com uma boa experiência de uso.**

## 2. Antes de começar: analisar meu projeto anterior

Tenho um projeto anterior de uma ferramenta de chat multiagente. Quero aproveitar a mesma stack tecnológica e os padrões utilizados nele.

Antes de implementar:

1. Localize o projeto da ferramenta multiagente no workspace ou nos diretórios disponíveis.
2. Analise sua estrutura de diretórios.
3. Examine os arquivos `package.json`, lockfiles e configurações.
4. Identifique:
   - Framework frontend.
   - Linguagem de programação.
   - Framework backend, caso exista.
   - Runtime desktop, caso exista.
   - Biblioteca de componentes.
   - Sistema de estilização.
   - Gerenciamento de estado.
   - Padrão de comunicação entre frontend e backend.
   - Biblioteca de ícones.
   - Ferramentas de build, lint e testes.
5. Identifique padrões de arquitetura, convenções de código e componentes reutilizáveis.

### Regra fundamental

**Reutilize a stack do projeto multiagente anterior.**

Não introduza uma nova stack apenas por preferência pessoal.

Não faça migrações desnecessárias de framework, linguagem ou bibliotecas.

Não modifique ou prejudique o projeto multiagente original. Utilize-o somente como referência.

Caso o projeto anterior não esteja acessível, informe isso e solicite o caminho antes de escolher outra stack.

## 3. Conceito do aplicativo

O aplicativo deverá ter uma interface semelhante a um editor de conhecimento, com três áreas principais:

### A. Sidebar — Explorador de arquivos

Uma barra lateral para navegar pelos documentos e diretórios.

Funcionalidades:

- Selecionar uma pasta local como workspace.
- Exibir estrutura de diretórios em árvore.
- Expandir e recolher diretórios.
- Identificar arquivos Markdown.
- Abrir arquivos ao clicar.
- Criar novos arquivos Markdown.
- Criar diretórios.
- Renomear arquivos e diretórios.
- Excluir arquivos e diretórios, com confirmação.
- Atualizar a árvore automaticamente quando houver alterações externas.

Exemplo de estrutura:

Knowledge Base/
├── Arquitetura/
│   ├── ADR-001.md
│   ├── Microsserviços.md
│   └── Event-Driven-Architecture.md
├── Estudos/
│   ├── Kubernetes.md
│   ├── Inteligencia-Artificial.md
│   └── Desenvolvimento.md
├── Projetos/
│   ├── Projeto-A.md
│   └── Projeto-B.md
└── README.md

Não armazenar os documentos em banco de dados. A estrutura física de pastas e arquivos deve ser preservada.

### B. Editor de documentos

Ao selecionar um documento Markdown, exibir seu conteúdo em uma área central.

Implementar três modos de visualização:

**1. Markdown**
- Exibir o conteúdo Markdown original.
- Permitir edição do texto.
- Aplicar realce de sintaxe.
- Suportar numeração de linhas, quando viável.

**2. Preview**
- Renderizar o Markdown.
- Exibir títulos, listas, tabelas, imagens, links, citações e blocos de código.
- Permitir visualizar o resultado formatado.
- Permitir alternar rapidamente entre edição e preview.

**3. Leitura**
- Apresentar o documento em uma interface limpa.
- Ocultar ferramentas de edição.
- Priorizar tipografia, espaçamento e legibilidade.
- Utilizar toda a área disponível para leitura.

Também considerar um modo dividido (Split View), com Markdown de um lado e Preview do outro.

### C. Barra superior

Criar uma barra de ferramentas com:

- Nome do documento atual.
- Indicador de alterações não salvas.
- Botão para alternar Markdown, Preview e Leitura.
- Opção de Split View.
- Botão para criar documento.
- Botão para localizar documentos.
- Indicador do workspace atual.

## 4. Persistência e gerenciamento de arquivos

O sistema deverá trabalhar diretamente com o sistema de arquivos local.

Requisitos:

- Abrir uma pasta local.
- Ler arquivos `.md`.
- Salvar alterações diretamente nos arquivos.
- Implementar salvamento automático com debounce.
- Evitar perda de conteúdo durante a edição.
- Monitorar alterações externas com file watcher.
- Atualizar a interface quando arquivos forem modificados externamente.
- Tratar conflitos quando um arquivo for alterado simultaneamente pelo aplicativo e por outro processo.
- Preservar nomes, diretórios e extensões originais.
- Suportar arquivos UTF-8.
- Suportar imagens e anexos usando caminhos relativos ao workspace.

A aplicação deve validar operações de arquivo e impedir acesso acidental fora do diretório autorizado do workspace.

## 5. Preparação para integrações futuras

Embora não devamos implementar sincronização agora, a arquitetura precisa permitir adicionar diferentes provedores de armazenamento.

Criar uma abstração de armazenamento, por exemplo:

`StorageProvider`

Com operações equivalentes a:

- listFiles()
- readFile()
- writeFile()
- createFile()
- deleteFile()
- renameFile()
- createDirectory()
- watchChanges()

Implementar inicialmente:

`LocalFilesystemProvider`

Preparar conceitualmente futuras implementações:

- GoogleDriveProvider
- BoxProvider
- GitHubProvider

Não implementar essas integrações neste MVP.

Não simular integrações que ainda não existem.

A arquitetura não deve obrigar o editor a conhecer os detalhes de cada provedor.

Observação: GitHub deverá ser tratado como um provedor baseado em repositórios Git, com regras próprias de versionamento e sincronização, e não simplesmente como um sistema de arquivos remoto.

## 6. Interface e experiência de usuário

Quero uma interface moderna, minimalista e profissional, inspirada no Obsidian, mas sem copiar sua identidade visual.

Características desejadas:

- Interface desktop.
- Tema escuro como padrão.
- Possibilidade de tema claro no futuro.
- Sidebar com largura ajustável.
- Editor ocupando a maior parte da tela.
- Tipografia agradável para leitura de documentos técnicos.
- Ícones consistentes.
- Interface sem excesso de botões.
- Navegação simples.
- Boa experiência em diferentes resoluções.

Referências de experiência:

- Obsidian: organização de documentos.
- VS Code: experiência de edição.
- Notion: legibilidade e apresentação de conteúdo.

Não quero uma interface com aparência de dashboard administrativo.

O aplicativo deve parecer uma ferramenta de produtividade para leitura, escrita e organização de conhecimento.

## 7. Funcionalidades que ficam fora do MVP

Não implementar nesta primeira versão:

- Integração com Google Drive.
- Integração com Box.
- Integração com GitHub.
- Sincronização entre computadores.
- Login ou autenticação.
- Banco de dados para armazenar documentos.
- Colaboração em tempo real.
- Inteligência artificial.
- Sistema avançado de plugins.
- Grafo de relacionamentos entre documentos.
- Sistema complexo de versionamento.

Esses recursos poderão ser considerados posteriormente.

## 8. Arquitetura e organização do código

Organize o projeto com separação clara de responsabilidades.

Evite concentrar toda a lógica em componentes React.

Separar, quando aplicável:

- Interface e componentes visuais.
- Gerenciamento de estado.
- Editor Markdown.
- Renderização Markdown.
- Manipulação de arquivos.
- Workspace.
- Abstrações de armazenamento.
- Configurações da aplicação.

Criar componentes reutilizáveis.

Aplicar TypeScript e tipagem adequada.

Seguir os padrões de arquitetura encontrados no projeto multiagente anterior.

Priorizar simplicidade, legibilidade e facilidade de manutenção.

Não criar abstrações complexas sem necessidade real.

## 9. Testes e qualidade

Implementar testes para as funcionalidades principais:

- Abrir workspace.
- Listar diretórios.
- Ler arquivos Markdown.
- Criar arquivos.
- Editar e salvar documentos.
- Renomear documentos.
- Excluir documentos.
- Atualizar arquivos alterados externamente.
- Tratar erros de leitura e escrita.

Executar lint, testes e build.

Corrigir erros encontrados antes de considerar o MVP concluído.

## 10. Critérios de aceite

Considerarei o MVP funcional quando conseguir:

1. Abrir o aplicativo.
2. Selecionar uma pasta local do computador.
3. Visualizar sua estrutura de diretórios.
4. Clicar em um arquivo Markdown.
5. Editar seu conteúdo.
6. Alternar para Preview.
7. Alternar para Leitura.
8. Utilizar o modo dividido entre edição e preview.
9. Criar documentos e diretórios.
10. Salvar alterações diretamente nos arquivos originais.
11. Fechar e abrir novamente o aplicativo sem perder as alterações.
12. Fazer alterações externas nos arquivos e visualizar a atualização no aplicativo.

## 11. Forma de execução

Trabalhe como um engenheiro de software sênior responsável pela implementação.

Não quero apenas uma proposta arquitetural ou documentação. Quero que você desenvolva o aplicativo funcionalmente.

Execute nesta ordem:

**Fase 1 — Discovery**
- Inspecionar a ferramenta multiagente anterior.
- Identificar a stack e os padrões existentes.
- Apresentar uma proposta objetiva de arquitetura.
- Definir a estrutura de diretórios do novo projeto.

**Fase 2 — Fundação**
- Criar o projeto.
- Configurar dependências.
- Implementar a estrutura principal da aplicação.
- Preparar a camada de acesso ao sistema de arquivos.

**Fase 3 — MVP**
- Implementar sidebar.
- Implementar navegação por diretórios.
- Implementar editor Markdown.
- Implementar Preview e Leitura.
- Implementar salvamento e monitoramento de arquivos.
- Implementar criação e gerenciamento de documentos.

**Fase 4 — Qualidade**
- Implementar testes.
- Corrigir problemas.
- Validar build.
- Validar funcionamento real no Windows.

**Fase 5 — Entrega**
- Criar README com instruções de instalação e execução.
- Documentar a arquitetura.
- Documentar as decisões técnicas relevantes.
- Informar como gerar o executável do aplicativo.
- Apresentar funcionalidades implementadas e limitações conhecidas.

Não avance apenas criando telas estáticas ou mocks. As funcionalidades precisam operar de verdade.

Priorize entregar uma primeira versão funcional antes de adicionar recursos que não fazem parte do escopo.

**Resultado esperado: um aplicativo desktop funcional de conhecimento pessoal, baseado em arquivos Markdown locais, preparado para receber futuramente integrações com serviços externos de armazenamento.**