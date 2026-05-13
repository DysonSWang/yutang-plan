const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SLIDES_DIR = path.join(__dirname, '幻灯片');
const OUTPUT_DIR = path.join(__dirname, '配图');

const slides = [
  'slide-01-cover.html',
  'slide-02-scenarios.html',
  'slide-03-pitfall1.html',
  'slide-04-pitfall2.html',
  'slide-05-pitfall3.html',
  'slide-06-formula.html',
  'slide-07-cta.html'
];

const outputFiles = [
  '01-cover.png',
  '02-cover.png',
  '03-cover.png',
  '04-cover.png',
  '05-cover.png',
  '06-cover.png',
  '07-cover.png'
];

async function renderSlides() {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewportSize({ width: 540, height: 720 });

  for (let i = 0; i < slides.length; i++) {
    const htmlPath = path.join(SLIDES_DIR, slides[i]);
    const outputPath = path.join(OUTPUT_DIR, outputFiles[i]);

    console.log(`Rendering ${slides[i]}...`);

    await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: outputPath, fullPage: false });

    console.log(`  -> ${outputFiles[i]}`);
  }

  await browser.close();
  console.log('All slides rendered!');
}

renderSlides().catch(console.error);