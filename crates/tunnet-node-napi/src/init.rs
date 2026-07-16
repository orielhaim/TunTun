use std::sync::Once;

pub fn init_logging_once() {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        let filter = tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
            tracing_subscriber::EnvFilter::new("info,tunnet_core=info,tunnet_node_napi=info")
        });
        tracing_subscriber::fmt()
            .with_env_filter(filter)
            .try_init()
            .ok();
    });
}
