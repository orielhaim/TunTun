use crate::config::Args;
use secrecy::ExposeSecret;
use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;

pub async fn connect(args: &Args) -> anyhow::Result<PgPool> {
    let url = args.database_url.expose_secret();
    let pool = PgPoolOptions::new()
        .max_connections(20)
        .acquire_timeout(std::time::Duration::from_secs(5))
        .connect(url)
        .await?;
    Ok(pool)
}
