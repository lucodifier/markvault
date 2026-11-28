# Runbook: Geração de Versão e Release do Executável Desktop

**Objetivo:** Descrever o processo de versionamento, validação e publicação automatizada do instalador do Windows (`.exe` NSIS) via GitHub Actions.

---

## Como Funciona

A geração da release do aplicativo desktop é **totalmente automatizada** pelo workflow [`.github/workflows/release.yml`](../../.github/workflows/release.yml).

- **Gatilho:** Push ou merge na branch `main` contendo alterações no código do app (`src/`, `src-tauri/`, `package.json`, etc.).
- **Detecção Inteligente:** O workflow verifica a versão declarada no `package.json` / `src-tauri/tauri.conf.json`.
  - Se a tag `v<versao>` correspondente **já existir**, ele não gera release duplicada.
  - Se a tag for **nova**, ele compila o instalador em uma VM Windows, roda os testes e cria a Release automaticamente.
- **Resultado:** O instalador NSIS `MarkVault_<versao>_x64-setup.exe` é anexado automaticamente à Release pública em `https://github.com/lucodifier/markvault/releases`.

---

## Passo a Passo para Lançar uma Nova Versão

### 1. Incrementar a Versão na Branch de Trabalho
Ao finalizar uma funcionalidade ou correção (ex: bump para `0.8.0`), atualize a versão nos arquivos:
- `package.json` (`"version": "0.8.0"`)
- `package-lock.json`
- `src-tauri/tauri.conf.json` (`"version": "0.8.0"`)
- `src-tauri/Cargo.toml` (`version = "0.8.0"`)
- `docs/CONTINUIDADE.md` e `docs/VALIDATION.md`

### 2. Validar Localmente
Antes de abrir o PR ou fazer o merge:
```bash
npm run lint          # Zero avisos
npm test              # Testes Vitest do frontend
npm run test:rust     # Testes unitários do Rust em src-tauri
npm run build         # Build Vite + TypeScript
```

### 3. Fazer o Merge para a `main`
```bash
git checkout main
git merge feature/<sua-branch>
git push origin main
```

O GitHub Actions iniciará o job `release`:
1. Valida todos os testes no ambiente Windows.
2. Compila o executável do Tauri e gera o instalador NSIS.
3. Cria a tag Git `v0.8.0`.
4. Publica a Release no GitHub com o `.exe` anexado.

---

## Compilação Local de Emergência (Opcional)

Se você precisar gerar o instalador localmente sem passar pelo GitHub Actions:
```bash
npm run desktop:build
```
O instalador será gerado em:
`src-tauri/target/release/bundle/nsis/MarkVault_<versao>_x64-setup.exe`
