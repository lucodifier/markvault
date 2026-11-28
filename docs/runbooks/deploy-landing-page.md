# Runbook: Publicação da Landing Page (GitHub Pages)

**Objetivo:** Publicar atualizações da página pública de apresentação do MarkVault (`site/index.html` e `site/assets/`).

---

## Como Funciona

- O site é servido pelo **GitHub Pages** na URL: `https://lucodifier.github.io/markvault/`.
- O workflow responsável é o [`.github/workflows/pages.yml`](../../.github/workflows/pages.yml).
- **Gatilho configurado:**
  - Push na branch `main` contendo alterações nos caminhos:
    - `site/**`
    - `.github/workflows/pages.yml`
  - Disparo manual via `workflow_dispatch` (aba Actions no GitHub ou via `gh workflow run`).

> **Importante:** Alterações que afetem apenas o código do aplicativo (`src/`, `src-tauri/`, `docs/`, etc.) **não** devem disparar este deploy.

---

## Passos para Publicar Alterações no Site

1. Edite os arquivos dentro da pasta `site/` (ex: `site/index.html` ou imagens em `site/assets/`).
2. Teste localmente abrindo `site/index.html` no navegador.
3. Faça o commit e envie para a branch `main`:
   ```bash
   git add site/
   git commit -m "docs: atualiza informacoes na landing page"
   git push origin main
   ```
4. O GitHub Actions executará o job `deploy` automaticamente em ~15 a 30 segundos.

---

## Como Rodar Manualmente ou Reexecutar em Caso de Falha

Se o deploy falhar por instabilidade passageira do GitHub Pages:
- **Pela CLI:**
  ```bash
  # Disparar nova execução:
  gh workflow run pages.yml

  # Ou reexecutar um run que falhou:
  gh run rerun <ID_DO_RUN>
  ```
- **Pela Interface Web:**
  Acesse a aba **Actions** no repositório -> selecione **Deploy landing page** -> clique em **Run workflow**.
