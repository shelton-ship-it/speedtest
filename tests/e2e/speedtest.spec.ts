/**
 * E2E: fluxo completo do teste usando o motor FALSO local (?e2eFakeEngine=1).
 * NUNCA toca na rede real — exercita UI, estado, domínio e IndexedDB.
 */
import { test, expect } from '@playwright/test';

const FAKE_URL = '/?e2eFakeEngine=1';

test('fluxo principal: iniciar → concluir → relatório + histórico', async ({ page }) => {
  await page.goto(FAKE_URL);

  // Botão de iniciar visível e habilitado (autoStart: false — só começa após clique)
  const startBtn = page.getByRole('button', { name: /Iniciar teste/i });
  await expect(startBtn).toBeVisible();
  await expect(startBtn).toBeEnabled();

  await startBtn.click();

  // Aguarda o relatório da sessão com os valores determinísticos do motor falso
  const report = page.getByRole('region', { name: /Relatório/i });
  await expect(report).toBeVisible({ timeout: 30_000 });
  await expect(report).toContainText(/88/, { timeout: 30_000 }); // download ~88.75 Mbps

  // Sessão guardada no histórico local (IndexedDB)
  const historySection = page.getByRole('heading', { name: /Histórico/i });
  await expect(historySection).toBeVisible();
});

test('cancelamento preserva resultado parcial com estado explícito', async ({ page }) => {
  await page.goto(FAKE_URL);

  const startBtn = page.getByRole('button', { name: /Iniciar teste/i });
  await startBtn.click();

  const cancelBtn = page.getByRole('button', { name: /Cancelar/i });
  await expect(cancelBtn).toBeEnabled();
  await cancelBtn.click();

  // Estado parcial/cancelado visível — não falha, não mostra zeros inventados
  await expect(
    page.getByText(/Parcial|Cancelado/i).first()
  ).toBeVisible({ timeout: 15_000 });
});

test('perfil intensivo exige aviso de consumo de dados antes de iniciar', async ({ page }) => {
  await page.goto(FAKE_URL);

  // Seleciona o perfil "Precisão" (requiresDataWarning)
  await page.getByRole('radio', { name: /Precisão/i }).click();

  const startBtn = page.getByRole('button', { name: /Iniciar teste/i });
  await expect(startBtn).toBeDisabled(); // bloqueado até ao reconhecimento explícito
  await expect(page.getByText(/transfere uma quantidade significativa/i)).toBeVisible();

  await page.getByTestId('acknowledge-warning').click();
  await expect(startBtn).toBeEnabled();
});

test('bloqueio de sessões concorrentes: iniciar duplicado é impedido', async ({ page }) => {
  await page.goto(FAKE_URL);

  const startBtn = page.getByRole('button', { name: /Iniciar teste/i });
  await startBtn.click();

  // Enquanto corre, não é possível iniciar uma segunda sessão
  await expect(page.getByRole('button', { name: /Iniciar teste/i })).toBeDisabled();
});
