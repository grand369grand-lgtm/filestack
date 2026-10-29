//! Minimal C ABI so plain `WebAssembly.instantiate` can drive the core —
//! no wasm-bindgen, no JS toolchain, ~1 file of glue (see `src/core/wasm.ts`).
//!
//! WASM protocol (little-endian):
//!   in : `{ "op": "search", "payload": <json> }` as UTF-8 bytes in linear memory
//!   out: [u32 len][utf8 json] at the pointer returned by `fc_invoke`
//!
//! Native C ABI (non-wasm targets):
//!   `fc_invoke_json(ptr, len, &mut out_len)` -> allocated UTF-8 response
//!   `fc_free_json(ptr, out_len)` releases that response
use crate::invoke;
use std::cell::RefCell;

/// Convert the shared JSON request envelope into a JSON response envelope.
fn dispatch_json(text: &str) -> String {
    match serde_json::from_str::<serde_json::Value>(text) {
        Ok(v) => {
            let op = v.get("op").and_then(|o| o.as_str()).unwrap_or("").to_string();
            let payload = v
                .get("payload")
                .map(|p| p.to_string())
                .unwrap_or_else(|| "null".to_string());
            match invoke(&op, &payload) {
                Ok(s) => format!("{{\"ok\":true,\"data\":{s}}}"),
                Err(e) => serde_json::json!({ "ok": false, "error": e }).to_string(),
            }
        }
        Err(e) => serde_json::json!({ "ok": false, "error": format!("bad request: {e}") }).to_string(),
    }
}

thread_local! {
    /// Keeps the last response alive so JS can copy it out.
    static LAST: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

/// Allocate `len` bytes and hand ownership to the caller.
#[no_mangle]
pub extern "C" fn fc_alloc(len: usize) -> *mut u8 {
    let mut buf = Vec::<u8>::with_capacity(len);
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

/// Free a buffer previously returned by `fc_alloc`.
///
/// # Safety
/// `ptr`/`len` must come from a matching `fc_alloc` call.
#[no_mangle]
pub unsafe extern "C" fn fc_free(ptr: *mut u8, len: usize) {
    if ptr.is_null() || len == 0 {
        return;
    }
    drop(Vec::from_raw_parts(ptr, 0, len));
}

/// Run a request. Returns a pointer to `[u32 len][bytes]` valid until the next call.
///
/// # Safety
/// `ptr`/`len` must describe a valid UTF-8 buffer in linear memory.
#[no_mangle]
pub unsafe extern "C" fn fc_invoke(ptr: *const u8, len: usize) -> *const u8 {
    if ptr.is_null() {
        return std::ptr::null();
    }
    let input = std::slice::from_raw_parts(ptr, len);
    let text = String::from_utf8_lossy(input).to_string();
    let response = dispatch_json(&text);

    LAST.with(|cell| {
        let mut buf = cell.borrow_mut();
        buf.clear();
        buf.extend_from_slice(&(response.len() as u32).to_le_bytes());
        buf.extend_from_slice(response.as_bytes());
        buf.as_ptr()
    })
}

/// Byte length of the last response body (excluding the 4-byte header).
#[no_mangle]
pub extern "C" fn fc_last_len() -> usize {
    LAST.with(|cell| cell.borrow().len().saturating_sub(4))
}

/// Native-only C ABI. Invoke one operation and return an owned JSON response.
///
/// # Safety
/// - `ptr` must point to `len` readable bytes (or be null only when `len` is 0).
/// - `out_len` may be null; otherwise it must point to a writable `usize`.
/// - The returned pointer must be released exactly once by `fc_free_json` with
///   the returned length.
#[cfg(not(target_arch = "wasm32"))]
#[no_mangle]
pub unsafe extern "C" fn fc_invoke_json(
    ptr: *const u8,
    len: usize,
    out_len: *mut usize,
) -> *mut u8 {
    let response = if ptr.is_null() {
        if len == 0 {
            dispatch_json("")
        } else {
            serde_json::json!({ "ok": false, "error": "null request pointer" }).to_string()
        }
    } else {
        let input = std::slice::from_raw_parts(ptr, len);
        dispatch_json(&String::from_utf8_lossy(input))
    };

    let boxed = response.into_bytes().into_boxed_slice();
    let len = boxed.len();
    if !out_len.is_null() {
        *out_len = len;
    }
    Box::into_raw(boxed) as *mut u8
}

/// Free the response returned by `fc_invoke_json`.
///
/// # Safety
/// `ptr`/`len` must be the exact pair returned by `fc_invoke_json`, and must
/// not have been freed before.
#[cfg(not(target_arch = "wasm32"))]
#[no_mangle]
pub unsafe extern "C" fn fc_free_json(ptr: *mut u8, len: usize) {
    if ptr.is_null() {
        return;
    }
    let slice = std::ptr::slice_from_raw_parts_mut(ptr, len);
    drop(Box::from_raw(slice));
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod native_ffi_tests {
    use super::{fc_free_json, fc_invoke_json};

    #[test]
    fn c_abi_round_trips_and_releases_owned_json() {
        let request = br#"{"op":"ping","payload":null}"#;
        let mut len = 0usize;
        let ptr = unsafe { fc_invoke_json(request.as_ptr(), request.len(), &mut len) };
        assert!(!ptr.is_null());
        let response = unsafe { std::slice::from_raw_parts(ptr, len) };
        let value: serde_json::Value = serde_json::from_slice(response).unwrap();
        assert_eq!(value["ok"], true);
        assert_eq!(value["data"]["engine"], "filecore");
        unsafe { fc_free_json(ptr, len) };
    }
}
