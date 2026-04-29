#![deny(warnings)]

// PRD draft file IO commands. v0.2 M1.3a.
//
// Renderer reads/writes <workspace>/.beaver/prd-draft.md through these
// commands so the PRDPane can show the current refiner output and
// persist user edits. The orchestrator (Node sidecar) writes the same
// file after each refinement call (M1.3b — separate iter).
//
// Path resolution reuses workspace::resolve_workspace so a
// canonicalised, traversal-safe project root is the only filesystem
// surface. The cap defends against runaway editors filling the disk
// through this command.

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;

use crate::workspace::resolve_workspace;

const DRAFT_FILE: &str = "prd-draft.md";
const BEAVER_DIR: &str = ".beaver";
const MAX_DRAFT_BYTES: usize = 256 * 1024;

#[derive(Serialize)]
pub struct PrdDraftResult {
    /// File contents, or empty when `exists` is false.
    pub markdown: String,
    /// False when the file is missing — caller renders an empty pane.
    pub exists: bool,
    /// On-disk size in bytes (0 when absent).
    pub bytes: u64,
}

/// Read `<workspace>/.beaver/prd-draft.md`. Returns empty markdown
/// with `exists=false` when the file is missing so the renderer can
/// show an empty-state placeholder without an error round-trip.
pub fn prd_get_draft() -> Result<PrdDraftResult, String> {
    let workdir = resolve_workspace(None).map_err(|e| e.to_string())?;
    let path = workdir.join(BEAVER_DIR).join(DRAFT_FILE);
    if !path.is_file() {
        return Ok(PrdDraftResult {
            markdown: String::new(),
            exists: false,
            bytes: 0,
        });
    }
    let bytes = fs::metadata(&path)
        .map(|m| m.len())
        .map_err(|e| format!("stat {}: {e}", path.display()))?;
    if (bytes as usize) > MAX_DRAFT_BYTES {
        return Err(format!(
            "prd draft exceeds {MAX_DRAFT_BYTES}-byte cap (got {bytes})"
        ));
    }
    let markdown =
        fs::read_to_string(&path).map_err(|e| format!("read {}: {e}", path.display()))?;
    Ok(PrdDraftResult {
        markdown,
        exists: true,
        bytes,
    })
}

#[derive(Deserialize)]
pub struct PrdSaveArgs {
    /// New full markdown body. Replaces the previous draft entirely.
    pub markdown: String,
}

#[derive(Serialize)]
pub struct PrdSaveResult {
    /// Number of bytes written to disk (== markdown utf-8 length).
    pub bytes_written: usize,
}

/// Write the supplied markdown to `<workspace>/.beaver/prd-draft.md`.
/// Creates `.beaver/` if missing. Caps at `MAX_DRAFT_BYTES` so a
/// runaway editor cannot fill the disk through this command. The
/// write is full-replace, not append, because the draft has a single
/// authoritative body at any time.
pub fn prd_save_draft(args: PrdSaveArgs) -> Result<PrdSaveResult, String> {
    let workdir = resolve_workspace(None).map_err(|e| e.to_string())?;
    let beaver_dir = workdir.join(BEAVER_DIR);
    fs::create_dir_all(&beaver_dir)
        .map_err(|e| format!("create {}: {e}", beaver_dir.display()))?;
    let path = beaver_dir.join(DRAFT_FILE);
    let bytes = args.markdown.as_bytes();
    if bytes.len() > MAX_DRAFT_BYTES {
        return Err(format!(
            "prd draft exceeds {MAX_DRAFT_BYTES}-byte cap (got {})",
            bytes.len()
        ));
    }
    let mut file =
        fs::File::create(&path).map_err(|e| format!("create {}: {e}", path.display()))?;
    file.write_all(bytes)
        .map_err(|e| format!("write {}: {e}", path.display()))?;
    Ok(PrdSaveResult {
        bytes_written: bytes.len(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// MAX_DRAFT_BYTES is the public contract for both commands and is
    /// referenced by the renderer's input validation. Pinning it as a
    /// test guards against an accidental change here that would leave
    /// the renderer rejecting valid drafts.
    #[test]
    fn max_draft_bytes_is_pinned() {
        assert_eq!(MAX_DRAFT_BYTES, 256 * 1024);
    }
}
