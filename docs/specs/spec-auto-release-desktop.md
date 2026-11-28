# Especificação: Automação de Release e Geração do Executável Desktop via GitHub Actions

**Status:** executada  
**Data:** 2026-11-28  
**Autor:** Antigravity  
**Versão:** 1.0  

---

## 1. Resumo

Automatizar a compilação e publicação das releases do MarkVault Desktop (`.exe` instalador NSIS para Windows) diretamente via GitHub Actions no evento de push/merge na branch `main`.

A automação deve detectar alterações de versão em `package.json` / `tauri.conf.json`. Se a tag da versão atual ainda não existir, o workflow executa a suíte de testes de integridade (lint, vitest, testes unitários Rust), compila o instalador em ambiente Windows nativo e publica a release no GitHub anexando o binário do instalador.

---

## 2. Motivação e Situação Atual

### 2.1 Situação Atual
- A compilação do executável desktop (`MarkVault_<versao>_x64-setup.exe`) é feita manualmente no ambiente local do desenvolvedor (`npm run desktop:build`).
- O desenvolvedor precisa anexar manualmente o instalador ao GitHub via `gh release create`.
- Não há verificação automática de compilação do instalador em pipeline de CI/CD para commits na `main`.

### 2.2 Situação Desejada
- Ao aprovar um PR ou fazer merge na `main` com nova versão:
  1. O GitHub Actions valida os testes do frontend e backend Rust.
  2. Executa a compilação do instalador NSIS via `tauri-apps/tauri-action`.
  3. Gera a tag Git (ex: `v0.8.0`) e cria a Release no GitHub com o `.exe` disponível para download público.
- Commits na `main` que **não** alteram a versão do app não geram releases duplicadas.

---

## 3. Arquitetura da Solução

### 3.1 Workflow do GitHub Actions (`.github/workflows/release.yml`)
- **Runner:** `windows-latest` (necessário para compilar o executável Windows e instalador NSIS com Rust MSVC).
- **Gatilhos (`on`):**
  - `push` na branch `main` com paths do código fonte (`src/**`, `src-tauri/**`, `package.json`, `package-lock.json`, `.github/workflows/release.yml`).
  - `workflow_dispatch` para permitir disparos manuais caso necessário.
- **Permissões:**
  - `contents: write` (para criar tags e releases com upload de assets via `GITHUB_TOKEN`).

### 3.2 Etapas do Pipeline
1. `actions/checkout@v4` (checkout completo do repositório).
2. `actions/setup-node@v4` (Node.js 22 com cache npm).
3. `dtolnay/rust-toolchain@stable` (toolchain Rust estável).
4. `swatinem/rust-cache@v2` (cache de compilação Cargo para agilizar os builds).
5. `npm ci` (instalação exata de dependências do frontend).
6. Validação:
   - `npm run lint`
   - `npm test`
   - `npm run test:rust`
7. Ação de Release:
   - `tauri-apps/tauri-action@v0` com:
     - `tagName: v__VERSION__`
     - `releaseName: 'MarkVault __VERSION__'`
     - `releaseDraft: false`
     - `prerelease: false`

---

## 4. Requisitos

### Requisitos Funcionais (RF)
- **RF-01:** Detectar se a versão do projeto é nova (tag inexistente).
- **RF-02:** Rodar a suíte completa de testes antes de qualquer empacotamento; se um teste falhar, a release não é gerada.
- **RF-03:** Compilar o instalador NSIS de 64-bit para Windows.
- **RF-04:** Publicar a Release oficial no GitHub com a tag `v<versao>` e o instalador anexado.

### Requisitos Não Funcionais (RNF)
- **RNF-01:** Utilizar `GITHUB_TOKEN` padrão sem exigir tokens adicionais com privilégios excessivos.
- **RNF-02:** Utilizar cache do Rust (`swatinem/rust-cache`) para reduzir tempo de execução em runners Windows.
