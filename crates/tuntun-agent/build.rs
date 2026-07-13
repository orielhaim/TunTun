//! On Windows, copy `resources/wintun/<arch>/wintun.dll` next to the built binary.
//!
//! See https://github.com/tun-rs/tun-rs - TUN mode requires wintun.dll beside the exe.

fn main() {
    #[cfg(windows)]
    bundle_wintun_dll();
}

#[cfg(windows)]
fn bundle_wintun_dll() {
    use std::path::PathBuf;

    let manifest_dir =
        PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let arch_dir = match std::env::var("CARGO_CFG_TARGET_ARCH")
        .expect("CARGO_CFG_TARGET_ARCH")
        .as_str()
    {
        "x86_64" => "amd64",
        "x86" => "x86",
        "aarch64" => "arm64",
        "arm" => "arm",
        other => {
            println!("cargo:warning=unsupported Windows arch for wintun bundling: {other}");
            return;
        }
    };

    let src = manifest_dir
        .join("resources")
        .join("wintun")
        .join(arch_dir)
        .join("wintun.dll");

    println!("cargo:rerun-if-changed={}", src.display());

    if !src.exists() {
        println!(
            "cargo:warning=wintun.dll not found at {}. \
             Download https://wintun.net/ and extract bin/{arch_dir}/wintun.dll there, \
             or place wintun.dll next to tuntun-agent.exe.",
            src.display()
        );
        return;
    }

    let profile = std::env::var("PROFILE").expect("PROFILE");
    let target_dir = std::env::var("CARGO_TARGET_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| manifest_dir.join("..").join("..").join("target"));

    let dest_dir = target_dir.join(&profile);
    std::fs::create_dir_all(&dest_dir).expect("create target profile dir");

    let dest = dest_dir.join("wintun.dll");
    std::fs::copy(&src, &dest).unwrap_or_else(|e| {
        panic!("failed to copy wintun.dll to {}: {e}", dest.display());
    });
}
