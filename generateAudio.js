// generateAudio.js
// Generates Sage TTS MP3s for all English in 50deck.html
// Saves everything into /audio/
// Ignores quiz items and duplicates
// Run in Terminal: caffeinate node generateAudio.js

const fs = require("fs");
const https = require("https");
const path = require("path");

const delay = 90000;       // 90s between requests
const retryWait = 300000;  // 5min wait on 429
const baseUrl = "https://bryanharper.tokyo/_functions/tts?voice=sage&text=";
const deckFile = path.join(__dirname, "50deck.html");
const outDir = path.join(__dirname, "audio");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// Extract all en:"..." lines (ignore quiz q:"...")
function extractEnglish(filePath) {
  const text = fs.readFileSync(filePath, "utf8");

  // Match only inside VOCAB, SENTENCES, QUESTIONS — skip QUIZ
  const sectionMatches = [...text.matchAll(/const\s+(VOCAB|SENTENCES|QUESTIONS)\s*=\s*\[[\s\S]*?\];/g)];
  const english = [];

  for (const section of sectionMatches) {
    const part = section[0];
    const lines = [...part.matchAll(/\ben\s*:\s*"([^"]+)"/g)];
    lines.forEach(m => english.push(m[1].trim()));
  }

  return english.filter(Boolean);
}

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
    const fileName = safeName(text);
    const filePath = path.join(outDir, fileName);
    if (fs.existsSync(filePath)) return resolve("skipped");

    const url = baseUrl + encodeURIComponent(text);
    const file = fs.createWriteStream(filePath);
    https
      .get(url, (res) => {
        if (res.statusCode === 200) {
          res.pipe(file);
          file.on("finish", () => file.close(() => resolve("ok")));
        } else {
          file.close(() => fs.unlink(filePath, () => reject(`HTTP ${res.statusCode}`)));
        }
      })
      .on("error", (err) => {
        fs.unlink(filePath, () => reject(err.message));
      });
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log("🎧 Generating Sage audio from 50deck.html (no duplicates)…\n");
  const seen = new Set();
  const lines = extractEnglish(deckFile);
  console.log(`📂 Found ${lines.length} English items\n`);

  for (const line of lines) {
    const clean = line.trim();
    const key = clean.toLowerCase();
    const fileName = safeName(clean);
    const filePath = path.join(outDir, fileName);

    if (seen.has(key)) {
      console.log(`↩️ skipped duplicate: ${clean}`);
      continue;
    }
    seen.add(key);
    if (fs.existsSync(filePath)) {
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

  console.log("\n✨ All Sage audio saved in /audio/");
})();
