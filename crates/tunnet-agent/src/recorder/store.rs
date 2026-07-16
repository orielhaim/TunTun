//! On-disk asciinema cast store + SQLite index.

use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use anyhow::Context;
use rusqlite::{Connection, params};
use sha2::{Digest, Sha256};
use tunnet_common::recording::{
    RecordingMeta, asciinema_header_line, asciinema_output_event, asciinema_resize_event,
};

pub struct RecordingStore {
    dir: PathBuf,
    db: Mutex<Connection>,
}

pub struct ActiveCastWriter {
    file: File,
    path: PathBuf,
    start: std::time::Instant,
    hasher: Sha256,
    byte_size: u64,
    header_written: bool,
    pub meta: RecordingMeta,
}

pub struct FinalizedCast {
    pub path: PathBuf,
    pub byte_size: u64,
    pub sha256_hex: String,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct RecordingIndexEntry {
    pub session_id: String,
    pub peer_endpoint: String,
    pub peer_hostname: Option<String>,
    pub user: String,
    pub machine: String,
    pub network: String,
    pub path: String,
    pub byte_size: u64,
    pub sha256_hex: String,
    pub duration_ms: u64,
    pub started_at: i64,
}

impl RecordingStore {
    pub fn open(dir: PathBuf) -> anyhow::Result<Self> {
        fs::create_dir_all(&dir).context("create recordings dir")?;
        let db_path = dir.join("index.sqlite");
        let db = Connection::open(&db_path).context("open recordings sqlite")?;
        db.execute_batch(
            "CREATE TABLE IF NOT EXISTS recordings (
                session_id TEXT PRIMARY KEY,
                peer_endpoint TEXT NOT NULL,
                peer_hostname TEXT,
                user_name TEXT NOT NULL,
                machine TEXT NOT NULL,
                network TEXT NOT NULL,
                path TEXT NOT NULL,
                byte_size INTEGER NOT NULL,
                sha256_hex TEXT NOT NULL,
                duration_ms INTEGER NOT NULL,
                started_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS recordings_by_started ON recordings(started_at DESC);",
        )?;
        Ok(Self {
            dir,
            db: Mutex::new(db),
        })
    }

    pub fn begin(&self, meta: &RecordingMeta) -> anyhow::Result<ActiveCastWriter> {
        let path = self.dir.join(format!("{}.cast", meta.session_id));
        let file =
            File::create(&path).with_context(|| format!("create cast {}", path.display()))?;
        let mut writer = ActiveCastWriter {
            file,
            path,
            start: std::time::Instant::now(),
            hasher: Sha256::new(),
            byte_size: 0,
            header_written: false,
            meta: meta.clone(),
        };
        writer.write_header()?;
        Ok(writer)
    }

    /// Open an existing cast for appending streamed raw cast bytes (remote path).
    pub fn begin_stream_sink(&self, meta: &RecordingMeta) -> anyhow::Result<StreamCastSink> {
        let path = self.dir.join(format!("{}.cast", meta.session_id));
        let file =
            File::create(&path).with_context(|| format!("create cast {}", path.display()))?;
        Ok(StreamCastSink {
            file,
            path,
            hasher: Sha256::new(),
            byte_size: 0,
            meta: meta.clone(),
        })
    }

    pub fn index_finished(
        &self,
        meta: &RecordingMeta,
        path: &Path,
        byte_size: u64,
        sha256_hex: &str,
        duration_ms: u64,
    ) -> anyhow::Result<()> {
        let started_at = chrono::Utc::now().timestamp();
        let db = self.db.lock().unwrap_or_else(|e| e.into_inner());
        db.execute(
            "INSERT OR REPLACE INTO recordings
             (session_id, peer_endpoint, peer_hostname, user_name, machine, network,
              path, byte_size, sha256_hex, duration_ms, started_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                meta.session_id,
                meta.peer_endpoint,
                meta.peer_hostname,
                meta.user,
                meta.machine,
                meta.network,
                path.display().to_string(),
                byte_size as i64,
                sha256_hex,
                duration_ms as i64,
                started_at,
            ],
        )?;
        Ok(())
    }

    #[allow(dead_code)]
    pub fn list(&self, limit: usize) -> anyhow::Result<Vec<RecordingIndexEntry>> {
        let db = self.db.lock().unwrap_or_else(|e| e.into_inner());
        let mut stmt = db.prepare(
            "SELECT session_id, peer_endpoint, peer_hostname, user_name, machine, network,
                    path, byte_size, sha256_hex, duration_ms, started_at
             FROM recordings ORDER BY started_at DESC LIMIT ?1",
        )?;
        let rows = stmt.query_map(params![limit as i64], |row| {
            Ok(RecordingIndexEntry {
                session_id: row.get(0)?,
                peer_endpoint: row.get(1)?,
                peer_hostname: row.get(2)?,
                user: row.get(3)?,
                machine: row.get(4)?,
                network: row.get(5)?,
                path: row.get(6)?,
                byte_size: row.get::<_, i64>(7)? as u64,
                sha256_hex: row.get(8)?,
                duration_ms: row.get::<_, i64>(9)? as u64,
                started_at: row.get(10)?,
            })
        })?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    }

    #[allow(dead_code)]
    pub fn get(&self, session_id: &str) -> anyhow::Result<Option<RecordingIndexEntry>> {
        let db = self.db.lock().unwrap_or_else(|e| e.into_inner());
        let mut stmt = db.prepare(
            "SELECT session_id, peer_endpoint, peer_hostname, user_name, machine, network,
                    path, byte_size, sha256_hex, duration_ms, started_at
             FROM recordings WHERE session_id = ?1",
        )?;
        let mut rows = stmt.query_map(params![session_id], |row| {
            Ok(RecordingIndexEntry {
                session_id: row.get(0)?,
                peer_endpoint: row.get(1)?,
                peer_hostname: row.get(2)?,
                user: row.get(3)?,
                machine: row.get(4)?,
                network: row.get(5)?,
                path: row.get(6)?,
                byte_size: row.get::<_, i64>(7)? as u64,
                sha256_hex: row.get(8)?,
                duration_ms: row.get::<_, i64>(9)? as u64,
                started_at: row.get(10)?,
            })
        })?;
        Ok(rows.next().transpose()?)
    }

    #[allow(dead_code)]
    pub fn read_cast(&self, session_id: &str) -> anyhow::Result<Option<String>> {
        let Some(entry) = self.get(session_id)? else {
            return Ok(None);
        };
        Ok(Some(fs::read_to_string(&entry.path)?))
    }
}

impl ActiveCastWriter {
    fn write_header(&mut self) -> anyhow::Result<()> {
        if self.header_written {
            return Ok(());
        }
        let ts = chrono::Utc::now().timestamp();
        let line = asciinema_header_line(&self.meta, ts);
        self.write_line(&line)?;
        self.header_written = true;
        Ok(())
    }

    pub fn write_output(&mut self, data: &[u8]) -> anyhow::Result<()> {
        self.write_header()?;
        let text = String::from_utf8_lossy(data);
        let t = self.start.elapsed().as_secs_f64();
        let line = asciinema_output_event(t, &text);
        self.write_line(&line)
    }

    pub fn write_resize(&mut self, cols: u16, rows: u16) -> anyhow::Result<()> {
        self.write_header()?;
        let t = self.start.elapsed().as_secs_f64();
        let line = asciinema_resize_event(t, cols, rows);
        self.write_line(&line)
    }

    fn write_line(&mut self, line: &str) -> anyhow::Result<()> {
        let mut bytes = line.as_bytes().to_vec();
        bytes.push(b'\n');
        self.file.write_all(&bytes)?;
        self.hasher.update(&bytes);
        self.byte_size += bytes.len() as u64;
        Ok(())
    }

    pub fn finish(mut self) -> anyhow::Result<FinalizedCast> {
        self.file.flush()?;
        let digest = self.hasher.finalize();
        Ok(FinalizedCast {
            path: self.path,
            byte_size: self.byte_size,
            sha256_hex: hex::encode(digest),
        })
    }
}

/// Sink for raw cast bytes arriving over the mesh (already formatted).
pub struct StreamCastSink {
    file: File,
    path: PathBuf,
    hasher: Sha256,
    byte_size: u64,
    meta: RecordingMeta,
}

impl StreamCastSink {
    pub fn write_all(&mut self, data: &[u8]) -> anyhow::Result<()> {
        self.file.write_all(data)?;
        self.hasher.update(data);
        self.byte_size += data.len() as u64;
        Ok(())
    }

    pub fn finish(mut self) -> anyhow::Result<(RecordingMeta, FinalizedCast)> {
        self.file.flush()?;
        let digest = self.hasher.finalize();
        Ok((
            self.meta,
            FinalizedCast {
                path: self.path,
                byte_size: self.byte_size,
                sha256_hex: hex::encode(digest),
            },
        ))
    }
}
