#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Platform {
    Windows,
    MacOS,
    Linux,
    FreeBSD,
    IOS,
    Android,
}

impl Platform {
    pub fn current() -> Self {
        #[cfg(target_os = "windows")]
        {
            Self::Windows
        }
        #[cfg(target_os = "macos")]
        {
            Self::MacOS
        }
        #[cfg(target_os = "linux")]
        {
            Self::Linux
        }
        #[cfg(target_os = "freebsd")]
        {
            Self::FreeBSD
        }
        #[cfg(target_os = "ios")]
        {
            Self::IOS
        }
        #[cfg(target_os = "android")]
        {
            Self::Android
        }
        #[cfg(not(any(
            target_os = "windows",
            target_os = "macos",
            target_os = "linux",
            target_os = "freebsd",
            target_os = "ios",
            target_os = "android"
        )))]
        {
            Self::Linux
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Windows => "windows",
            Self::MacOS => "macos",
            Self::Linux => "linux",
            Self::FreeBSD => "freebsd",
            Self::IOS => "ios",
            Self::Android => "android",
        }
    }
}

pub fn platform_supported(collector_platforms: &[Platform]) -> bool {
    collector_platforms.contains(&Platform::current())
}
