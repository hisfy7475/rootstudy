const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const inputPath = path.join(__dirname, '../src/app/icon.png');
const outputDir = path.join(__dirname, '../public/icons');

// Create output directory if it doesn't exist
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

async function generateIcons() {
  console.log('Generating PWA icons from:', inputPath);
  
  for (const size of sizes) {
    const outputPath = path.join(outputDir, `icon-${size}.png`);
    
    await sharp(inputPath)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .png()
      .toFile(outputPath);
    
    console.log(`Generated: icon-${size}.png`);
  }
  
  // Also generate favicon.ico (16x16, 32x32, 48x48 in one file)
  // For simplicity, we'll create a 32x32 png as favicon
  const faviconPath = path.join(__dirname, '../public/favicon.ico');
  await sharp(inputPath)
    .resize(32, 32, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 0 }
    })
    .png()
    .toFile(faviconPath);
  console.log('Generated: favicon.ico (32x32)');
  
  console.log('\nAll icons generated successfully!');
}

generateIcons().catch(console.error);
