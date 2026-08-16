import type { Browser, BrowserContext, Page } from 'playwright';
import path from 'path';

const PROFILE_DIR = path.join(process.cwd(), '.local-browser-profile');

let context: BrowserContext | null = null;

function getBrowser(): Browser | null {
  return context?.browser() ?? null;
}

export async function isBrowserOpen(): Promise<boolean> {
  return getBrowser()?.isConnected() ?? false;
}

export async function getCurrentPage(): Promise<Page | null> {
  if (!context) return null;
  const pages = context.pages();
  if (pages.length === 0) return null;
  return pages[pages.length - 1];
}

export async function getContext(): Promise<BrowserContext | null> {
  return context;
}

export async function openBrowser(systemUrl?: string): Promise<Page> {
  if (context) {
    const pages = context.pages();
    let page = pages.length > 0 ? pages[pages.length - 1] : await context.newPage();
    if (systemUrl && (page.url() === 'about:blank' || page.url() === '')) {
      await page.goto(systemUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }
    return page;
  }

  await closeBrowser();

  const { chromium } = await import('playwright');

  context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    acceptDownloads: true,
  });

  const pages = context.pages();
  let page: Page;
  if (pages.length > 0) {
    page = pages[0];
  } else {
    page = await context.newPage();
  }

  if (systemUrl) {
    await page.goto(systemUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  }

  return page;
}

export async function closeBrowser(): Promise<void> {
  if (context) {
    await context.close().catch(() => {});
    context = null;
  }
}

process.on('exit', () => {
  if (context) context.close().catch(() => {});
});
