// generateAudio.js
// Booha Sage TTS Generator – scans vocab.html, sentences.html, and 50deck.html
// Saves all English TTS audio into /assets/audio/
// Skips duplicates and ignores QUIZ sections
// Run in Terminal: caffeinate -i node generateAudio.js

const fs = require("fs");
const https = require("https");
const path = require("path");

// -------------------------------------
// SETTINGS
// -------------------------------------
const delay = 8000;         // 8 seconds between requests (safe)
const retryWait = 300000;   // 5 minutes wait on 429 errors
const baseUrl = "https://bryanharper.tokyo/_functions/tts?voice=sage&text=";

// The 3 Booha deck files to scan
const htmlFiles = ["vocab.html", "sentences.html", "50deck.html"]
  .map(f => path.join(__dirname, f))
  .filter(f => fs.existsSync(f));

// Output directory (assets/audio/)
const outDir = path.join(__dirname, "assets", "audio");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// -------------------------------------
// EXTRACT ENGLISH (VOCAB, SENTENCES, QUESTIONS only)
// -------------------------------------
function extractEnglish(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const sections = [...text.matchAll(/const\s+(VOCAB|SENTENCES|QUESTIONS)\s*=\s*\[[\s\S]*?\];/g)];
  const english = [];

  for (const section of sections) {
    const part = section[0];
    const lines = [...part.matchAll(/\ben\s*:\s*"([^"]+)"/g)];
    lines.forEach(m => english.push(m[1].trim()));
  }
  return english.filter(Boolean);
}

// -------------------------------------
// HELPERS
// -------------------------------------
function safeName(t) {
  return (
    t
      .toLowerCase()
      .replace(/[^\wぁ-んァ-ン一-龯０-９a-zA-Z0-9]/g, "")
      .substring(0, 100) + ".mp3"
  );
}

function download(text) {
  return new Promise((resolve, reject) => {
    const filename = safeName(text);
    const filepath = path.join(outDir, filename);
    if (fs.existsSync(filepath)) return resolve("skipped");

    const url = baseUrl + encodeURIComponent(text);
    const file = fs.createWriteStream(filepath);
    https
      .get(url, (res) => {
        if (res.statusCode === 200) {
          res.pipe(file);
          file.on("finish", () => file.close(() => resolve("ok")));
        } else {
          file.close(() => {
            fs.unlink(filepath, () => reject(`HTTP ${res.statusCode}`));
          });
        }
      })
      .on("error", (err) => {
        fs.unlink(filepath, () => reject(err.message));
      });
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// -------------------------------------
// MAIN PROCESS
// -------------------------------------
(async () => {
  console.log("🎧 Generating Sage audio for all decks (VOCAB + SENTENCES + QUESTIONS)…\n");

  let lines = [];
  for (const file of htmlFiles) {
    console.log(`📖 Reading ${path.basename(file)}`);
    lines.push(...extractEnglish(file));
  }
  console.log(`\n📂 Found ${lines.length} English entries before filtering.\n`);

  const seen = new Set();

  for (const line of lines) {
    const clean = line.trim();
    const key = clean.toLowerCase();
    const filename = safeName(clean);
    const filepath = path.join(outDir, filename);

    if (seen.has(key)) {
      console.log(`↩️ skipped duplicate: ${clean}`);
      continue;
    }
    seen.add(key);

    if (fs.existsSync(filepath)) {
      console.log(`⏭️ already have: ${clean}`);
      continue;
    }

    let done = false;
    while (!done) {
      try {
        await download(clean);
        console.log(`✅ ${clean}`);
        done = true;
      } catch (e) {
        if (String(e).includes("HTTP 429")) {
          console.warn(`⚠️ 429 Too Many Requests → waiting ${retryWait / 60000} minutes`);
          await wait(retryWait);
        } else {
          console.error(`❌ ${clean} → ${e}`);
          done = true;
        }
      }
    }

    await wait(delay);
  }

  console.log("\n✨ All Sage audio saved in /assets/audio/");
})();
