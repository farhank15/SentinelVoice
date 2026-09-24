import fs from 'node:fs';
import path from 'node:path';
import mockExecutives from '../data/mockExecutives.json' with { type: 'json' };

const MODULE_DIR = import.meta.dir || path.dirname(new URL(import.meta.url).pathname);
const DATA_DIR = path.resolve(MODULE_DIR, '../data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const DB_PATH = path.join(DATA_DIR, 'voiceprints.sqlite');
const MOCK_FILE_PATH = path.join(DATA_DIR, 'mockExecutives.json');

// Graceful SQLite loader: Uses native bun:sqlite in Bun, or in-memory JSON fallback
let sqliteDb = null;
try {
  const { Database } = await import('bun:sqlite');
  sqliteDb = new Database(DB_PATH, { create: true });
  sqliteDb.run(`
    CREATE TABLE IF NOT EXISTS enrolled_voiceprints (
      executive_id TEXT PRIMARY KEY,
      executive_name TEXT NOT NULL,
      title TEXT,
      f0_target_hz REAL,
      f0_min_hz REAL,
      f0_max_hz REAL,
      formant_f1_hz REAL,
      formant_f2_hz REAL,
      vocal_timbre TEXT,
      jitter_baseline_pct REAL,
      sample_duration_sec REAL,
      enrolled_at TEXT,
      status TEXT DEFAULT 'ENROLLED',
      notes TEXT
    );
  `);
  console.log('[VoiceprintRepository] 🗄️ Native Bun SQLite connected at:', DB_PATH);

  // Schema migration: multi-utterance enrollment adds cross-sample variability
  // columns (idempotent — ignore "duplicate column" errors on restart)
  for (const col of [
    'ALTER TABLE enrolled_voiceprints ADD COLUMN f1_std_hz REAL',
    'ALTER TABLE enrolled_voiceprints ADD COLUMN f2_std_hz REAL',
    'ALTER TABLE enrolled_voiceprints ADD COLUMN f0_std_across_hz REAL',
    'ALTER TABLE enrolled_voiceprints ADD COLUMN sample_count INTEGER'
  ]) {
    try { sqliteDb.run(col); } catch (e) { /* column already exists */ }
  }
} catch (e) {
  console.warn('[VoiceprintRepository] bun:sqlite not available, falling back to JSON storage:', e.message);
}

export class VoiceprintRepository {
  /**
   * Seed SQLite database from mockExecutives.json if empty
   */
  static init() {
    if (!sqliteDb) return;
    try {
      const countRow = sqliteDb.query('SELECT COUNT(*) as count FROM enrolled_voiceprints').get();
      if (countRow.count === 0) {
        console.log('[VoiceprintRepository] Seeding SQLite database from mockExecutives.json baseline...');
        const insertStmt = sqliteDb.prepare(`
          INSERT INTO enrolled_voiceprints (
            executive_id, executive_name, title, f0_target_hz, f0_min_hz, f0_max_hz,
            formant_f1_hz, formant_f2_hz, vocal_timbre, jitter_baseline_pct,
            sample_duration_sec, enrolled_at, status, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const exec of mockExecutives.executives) {
          const vp = exec.enrolled_voiceprint || {};
          insertStmt.run(
            exec.id,
            exec.name,
            exec.title,
            vp.f0_target_hz || (exec.name.includes('Robert') ? 108.5 : 195.0),
            vp.f0_range_hz ? vp.f0_range_hz[0] : 85.0,
            vp.f0_range_hz ? vp.f0_range_hz[1] : 145.0,
            vp.formant_f1_hz || 500.0,
            vp.formant_f2_hz || 1350.0,
            vp.vocal_timbre || 'DEEP_BARITONE (LONG_VOCAL_TRACT)',
            vp.jitter_baseline_pct || 0.92,
            vp.sample_duration_sec || 60,
            vp.sample_date || new Date().toISOString().split('T')[0],
            vp.status || 'ENROLLED',
            vp.notes || 'Baseline seed profile'
          );
        }
        console.log(`[VoiceprintRepository] Seeded ${mockExecutives.executives.length} profiles to SQLite.`);
      }
    } catch (err) {
      console.error('[VoiceprintRepository] Init error:', err.message);
    }
  }

  /**
   * Get all registered voiceprint profiles
   */
  static getAllProfiles() {
    if (sqliteDb) {
      try {
        const rows = sqliteDb.query('SELECT * FROM enrolled_voiceprints ORDER BY executive_id ASC').all();
        if (rows && rows.length > 0) return rows;
      } catch (e) {}
    }
    // Fallback to JSON
    return mockExecutives.executives.map((e) => ({
      executive_id: e.id,
      executive_name: e.name,
      title: e.title,
      f0_target_hz: e.enrolled_voiceprint?.f0_target_hz || 108.5,
      f0_min_hz: e.enrolled_voiceprint?.f0_range_hz?.[0] || 85,
      f0_max_hz: e.enrolled_voiceprint?.f0_range_hz?.[1] || 145,
      formant_f1_hz: e.enrolled_voiceprint?.formant_f1_hz || 500,
      formant_f2_hz: e.enrolled_voiceprint?.formant_f2_hz || 1350,
      vocal_timbre: e.enrolled_voiceprint?.vocal_timbre || 'DEEP_BARITONE',
      jitter_baseline_pct: e.enrolled_voiceprint?.jitter_baseline_pct || 0.92,
      sample_duration_sec: e.enrolled_voiceprint?.sample_duration_sec || 60,
      enrolled_at: e.enrolled_voiceprint?.sample_date || '2025-11-12',
      status: e.enrolled_voiceprint?.status || 'ENROLLED'
    }));
  }

  /**
   * Find profile by name or ID
   */
  static getProfileByName(nameOrId) {
    const search = String(nameOrId || '').toLowerCase();
    if (sqliteDb) {
      try {
        const row = sqliteDb.query(`
          SELECT * FROM enrolled_voiceprints
          WHERE LOWER(executive_name) LIKE ? OR LOWER(executive_id) = ?
          LIMIT 1
        `).get(`%${search}%`, search);
        if (row) return row;
      } catch (e) {}
    }

    const exec = mockExecutives.executives.find((e) =>
      e.name.toLowerCase().includes(search) || e.id.toLowerCase() === search
    ) || mockExecutives.executives[0];

    return {
      executive_id: exec.id,
      executive_name: exec.name,
      title: exec.title,
      f0_target_hz: exec.enrolled_voiceprint?.f0_target_hz || 108.5,
      f0_min_hz: exec.enrolled_voiceprint?.f0_range_hz?.[0] || 85,
      f0_max_hz: exec.enrolled_voiceprint?.f0_range_hz?.[1] || 145,
      formant_f1_hz: exec.enrolled_voiceprint?.formant_f1_hz || 500,
      formant_f2_hz: exec.enrolled_voiceprint?.formant_f2_hz || 1350,
      vocal_timbre: exec.enrolled_voiceprint?.vocal_timbre || 'DEEP_BARITONE',
      jitter_baseline_pct: exec.enrolled_voiceprint?.jitter_baseline_pct || 0.92,
      status: exec.enrolled_voiceprint?.status || 'ENROLLED'
    };
  }

  /**
   * Save newly recorded biometric calibration profile to SQLite & mockExecutives.json
   */
  static saveVoiceprint(profile) {
    const {
      executive_id,
      executive_name,
      title,
      f0_target_hz,
      f0_min_hz,
      f0_max_hz,
      formant_f1_hz,
      formant_f2_hz,
      vocal_timbre,
      jitter_baseline_pct,
      sample_duration_sec,
      notes
    } = profile;

    const enrolled_at = new Date().toISOString().split('T')[0];

    // 1. Save to SQLite if available
    if (sqliteDb) {
      try {
        const upsert = sqliteDb.prepare(`
          INSERT INTO enrolled_voiceprints (
            executive_id, executive_name, title, f0_target_hz, f0_min_hz, f0_max_hz,
            formant_f1_hz, formant_f2_hz, vocal_timbre, jitter_baseline_pct,
            sample_duration_sec, enrolled_at, status, notes,
            f1_std_hz, f2_std_hz, f0_std_across_hz, sample_count
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ENROLLED', ?, ?, ?, ?, ?)
          ON CONFLICT(executive_id) DO UPDATE SET
            f0_target_hz=excluded.f0_target_hz,
            f0_min_hz=excluded.f0_min_hz,
            f0_max_hz=excluded.f0_max_hz,
            formant_f1_hz=excluded.formant_f1_hz,
            formant_f2_hz=excluded.formant_f2_hz,
            vocal_timbre=excluded.vocal_timbre,
            jitter_baseline_pct=excluded.jitter_baseline_pct,
            sample_duration_sec=excluded.sample_duration_sec,
            enrolled_at=excluded.enrolled_at,
            notes=excluded.notes,
            f1_std_hz=excluded.f1_std_hz,
            f2_std_hz=excluded.f2_std_hz,
            f0_std_across_hz=excluded.f0_std_across_hz,
            sample_count=excluded.sample_count
        `);

        upsert.run(
          executive_id,
          executive_name,
          title || 'Executive Leadership',
          f0_target_hz,
          f0_min_hz || Math.round(f0_target_hz * 0.8),
          f0_max_hz || Math.round(f0_target_hz * 1.25),
          formant_f1_hz,
          formant_f2_hz,
          vocal_timbre,
          jitter_baseline_pct,
          sample_duration_sec || 5,
          enrolled_at,
          notes || 'Calibrated via Web Live Microphone',
          profile.f1_std_hz ?? null,
          profile.f2_std_hz ?? null,
          profile.f0_std_across_hz ?? null,
          profile.sample_count ?? null
        );
        console.log(`[VoiceprintRepository] 💾 Successfully saved ${executive_name} to SQLite vault.`);
      } catch (err) {
        console.error('[VoiceprintRepository] SQLite save error:', err.message);
      }
    }

    // 2. Synchronize to mockExecutives.json for transparency & git tracking
    try {
      const exec = mockExecutives.executives.find((e) => e.id === executive_id || e.name.toLowerCase() === executive_name.toLowerCase());
      if (exec) {
        exec.enrolled_voiceprint = {
          status: 'ENROLLED',
          sample_duration_sec: sample_duration_sec || 5,
          sample_count: profile.sample_count || 1,
          sample_date: enrolled_at,
          f0_target_hz: f0_target_hz,
          f0_range_hz: [f0_min_hz || Math.round(f0_target_hz * 0.8), f0_max_hz || Math.round(f0_target_hz * 1.25)],
          f0_std_across_hz: profile.f0_std_across_hz ?? null,
          formant_f1_hz: formant_f1_hz,
          formant_f2_hz: formant_f2_hz,
          f1_std_hz: profile.f1_std_hz ?? null,
          f2_std_hz: profile.f2_std_hz ?? null,
          vocal_timbre: vocal_timbre,
          jitter_baseline_pct: jitter_baseline_pct,
          notes: notes || 'Calibrated via Web Live Microphone'
        };
        fs.writeFileSync(MOCK_FILE_PATH, JSON.stringify(mockExecutives, null, 2), 'utf-8');
        console.log(`[VoiceprintRepository] 📄 Synchronized ${executive_name} to mockExecutives.json.`);
      }
    } catch (err) {
      console.warn('[VoiceprintRepository] JSON sync error:', err.message);
    }

    return {
      success: true,
      executive_id,
      executive_name,
      enrolled_voiceprint: {
        status: 'ENROLLED',
        f0_target_hz,
        formant_f1_hz,
        formant_f2_hz,
        vocal_timbre,
        jitter_baseline_pct,
        sample_duration_sec,
        enrolled_at
      }
    };
  }
}

// Auto-initialize on module load
VoiceprintRepository.init();
