//! JNI entry points for the Android Expo module (`modules/filecore`).
//!
//! The Kotlin side declares `external fun invoke(request: String): String` on
//! `expo.modules.filecore.FileCoreNative`; the symbol name below must match
//! that class exactly. Requests and responses use the same JSON envelope as the
//! C ABI in `ffi.rs`, so there is one protocol and one dispatcher.
//!
//! Built only with `--features jni` (see `scripts/build-core-android.sh`).
#![cfg(feature = "jni")]

use crate::ffi::dispatch_json;
use jni::objects::{JObject, JString};
use jni::sys::jstring;
use jni::JNIEnv;

const BAD_REQUEST: &str = r#"{"ok":false,"error":"invalid request string"}"#;

#[no_mangle]
pub extern "system" fn Java_expo_modules_filecore_FileCoreNative_invoke<'local>(
    mut env: JNIEnv<'local>,
    _this: JObject<'local>,
    request: JString<'local>,
) -> jstring {
    // Copy the request out first: the JavaStr borrow of `env` must end before
    // we allocate the response string.
    let text: String = match env.get_string(&request) {
        Ok(value) => value.into(),
        Err(_) => BAD_REQUEST.to_string(),
    };

    let response = if text == BAD_REQUEST {
        BAD_REQUEST.to_string()
    } else {
        dispatch_json(&text)
    };

    match env.new_string(response) {
        Ok(value) => value.into_raw(),
        Err(_) => std::ptr::null_mut(),
    }
}
