use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use std::collections::HashSet;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, error, info, warn};

/// Type of masked item
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MaskedItemType {
    Web,
    App,
}

impl MaskedItemType {
    pub fn as_str(&self) -> &'static str {
        match self {
            MaskedItemType::Web => "web",
            MaskedItemType::App => "app",
        }
    }
}

impl std::fmt::Display for MaskedItemType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl std::str::FromStr for MaskedItemType {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "web" => Ok(MaskedItemType::Web),
            "app" => Ok(MaskedItemType::App),
            _ => Err(format!("Invalid item type: {}", s)),
        }
    }
}

/// A masked item stored in the database
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct MaskedItem {
    pub id: i64,
    pub name: String,
    pub item_type: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Request to create a new masked item
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateMaskedItemRequest {
    pub name: String,
    pub item_type: MaskedItemType,
}

/// Request to update a masked item
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateMaskedItemRequest {
    pub name: String,
}

/// Result of a privacy operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrivacyResult {
    pub success: bool,
    pub message: String,
}

/// Cache for fast lookup of masked items during capture
#[derive(Debug, Clone)]
pub struct PrivacyCache {
    /// Set of masked website domains (lowercase)
    masked_websites: Arc<RwLock<HashSet<String>>>,
    /// Set of masked app names (lowercase)
    masked_apps: Arc<RwLock<HashSet<String>>>,
    /// Last refresh timestamp
    last_refresh: Arc<RwLock<Option<std::time::Instant>>>,
}

impl PrivacyCache {
    pub fn new() -> Self {
        Self {
            masked_websites: Arc::new(RwLock::new(HashSet::new())),
            masked_apps: Arc::new(RwLock::new(HashSet::new())),
            last_refresh: Arc::new(RwLock::new(None)),
        }
    }

    /// Reload cache from database
    pub async fn refresh(&self, pool: &SqlitePool) -> Result<(), sqlx::Error> {
        let items: Vec<MaskedItem> = sqlx::query_as(
            "SELECT id, name, item_type, created_at, updated_at FROM masked_items"
        )
        .fetch_all(pool)
        .await?;

        let mut websites = HashSet::new();
        let mut apps = HashSet::new();

        for item in items {
            let name_lower = item.name.to_lowercase();
            match item.item_type.as_str() {
                "web" => {
                    websites.insert(name_lower);
                }
                "app" => {
                    apps.insert(name_lower);
                }
                _ => {
                    warn!("Unknown masked item type: {}", item.item_type);
                }
            }
        }

        {
            let mut cache = self.masked_websites.write().await;
            *cache = websites;
        }
        {
            let mut cache = self.masked_apps.write().await;
            *cache = apps;
        }
        {
            let mut last = self.last_refresh.write().await;
            *last = Some(std::time::Instant::now());
        }

        debug!("Privacy cache refreshed");
        Ok(())
    }

    /// Check if a website URL should be masked
    pub async fn is_website_masked(&self, url: &str) -> bool {
        // Extract domain from URL
        let domain = extract_domain(url);
        let domain_lower = domain.to_lowercase();

        let cache = self.masked_websites.read().await;
        
        // Check exact match
        if cache.contains(&domain_lower) {
            return true;
        }

        // Check if any cached domain is a suffix of the URL domain
        // e.g., "facebook.com" should match "www.facebook.com" and "m.facebook.com"
        for masked_domain in cache.iter() {
            if domain_lower == *masked_domain || domain_lower.ends_with(&format!(".{}", masked_domain)) {
                return true;
            }
        }

        false
    }

    /// Check if an app should be masked
    pub async fn is_app_masked(&self, app_name: &str) -> bool {
        let app_lower = app_name.to_lowercase();
        let cache = self.masked_apps.read().await;

        // Check exact match
        if cache.contains(&app_lower) {
            return true;
        }

        // Check partial match (app name contains masked name or vice versa)
        for masked_app in cache.iter() {
            if app_lower.contains(masked_app) || masked_app.contains(&app_lower) {
                return true;
            }
        }

        false
    }

    /// Check if a window should be masked based on app name and browser URL
    pub async fn should_mask_window(&self, app_name: &str, browser_url: Option<&str>) -> bool {
        // Check app first
        if self.is_app_masked(app_name).await {
            return true;
        }

        // Check browser URL if present
        if let Some(url) = browser_url {
            if self.is_website_masked(url).await {
                return true;
            }
        }

        false
    }

    /// Add item to cache (used when creating new masked item)
    pub async fn add_item(&self, name: &str, item_type: MaskedItemType) {
        let name_lower = name.to_lowercase();
        match item_type {
            MaskedItemType::Web => {
                let mut cache = self.masked_websites.write().await;
                cache.insert(name_lower);
            }
            MaskedItemType::App => {
                let mut cache = self.masked_apps.write().await;
                cache.insert(name_lower);
            }
        }
    }

    /// Remove item from cache (used when deleting masked item)
    pub async fn remove_item(&self, name: &str, item_type: MaskedItemType) {
        let name_lower = name.to_lowercase();
        match item_type {
            MaskedItemType::Web => {
                let mut cache = self.masked_websites.write().await;
                cache.remove(&name_lower);
            }
            MaskedItemType::App => {
                let mut cache = self.masked_apps.write().await;
                cache.remove(&name_lower);
            }
        }
    }

    /// Get all cached items (for debugging)
    pub async fn get_stats(&self) -> (usize, usize) {
        let websites = self.masked_websites.read().await.len();
        let apps = self.masked_apps.read().await.len();
        (websites, apps)
    }
}

impl Default for PrivacyCache {
    fn default() -> Self {
        Self::new()
    }
}

/// Extract domain from a URL
fn extract_domain(url: &str) -> String {
    // Handle URLs with or without protocol
    let url_with_protocol = if url.starts_with("http://") || url.starts_with("https://") {
        url.to_string()
    } else {
        format!("http://{}", url)
    };

    match url::Url::parse(&url_with_protocol) {
        Ok(parsed) => parsed.host_str().unwrap_or(url).to_string(),
        Err(_) => {
            // Fallback: try to extract domain manually
            let without_protocol = url
                .trim_start_matches("http://")
                .trim_start_matches("https://")
                .trim_start_matches("www.");
            
            // Take everything before the first slash or end
            without_protocol
                .split('/')
                .next()
                .unwrap_or(url)
                .to_string()
        }
    }
}

/// Database operations for masked items
pub struct PrivacyManager {
    pool: SqlitePool,
    cache: Arc<PrivacyCache>,
}

impl PrivacyManager {
    pub async fn new(pool: SqlitePool) -> Result<Self, sqlx::Error> {
        let cache = Arc::new(PrivacyCache::new());
        let manager = Self {
            pool,
            cache,
        };
        
        // Initial cache load
        manager.cache.refresh(&manager.pool).await?;
        
        Ok(manager)
    }

    pub fn cache(&self) -> Arc<PrivacyCache> {
        Arc::clone(&self.cache)
    }

    /// List all masked items
    pub async fn list_all(&self) -> Result<Vec<MaskedItem>, sqlx::Error> {
        sqlx::query_as(
            "SELECT id, name, item_type, created_at, updated_at FROM masked_items ORDER BY item_type, name"
        )
        .fetch_all(&self.pool)
        .await
    }

    /// List masked items by type
    pub async fn list_by_type(&self, item_type: MaskedItemType) -> Result<Vec<MaskedItem>, sqlx::Error> {
        sqlx::query_as(
            "SELECT id, name, item_type, created_at, updated_at FROM masked_items WHERE item_type = ? ORDER BY name"
        )
        .bind(item_type.as_str())
        .fetch_all(&self.pool)
        .await
    }

    /// Create a new masked item
    pub async fn create(&self, request: CreateMaskedItemRequest) -> Result<MaskedItem, sqlx::Error> {
        let name = request.name.trim().to_lowercase();
        let item_type = request.item_type.as_str();

        let result = sqlx::query(
            "INSERT INTO masked_items (name, item_type) VALUES (?, ?) RETURNING id, name, item_type, created_at, updated_at"
        )
        .bind(&name)
        .bind(item_type)
        .fetch_one(&self.pool)
        .await;

        match result {
            Ok(row) => {
                let item = MaskedItem {
                    id: sqlx::Row::get(&row, "id"),
                    name: sqlx::Row::get(&row, "name"),
                    item_type: sqlx::Row::get(&row, "item_type"),
                    created_at: sqlx::Row::get(&row, "created_at"),
                    updated_at: sqlx::Row::get(&row, "updated_at"),
                };

                // Update cache
                self.cache.add_item(&item.name, request.item_type).await;
                info!("Created masked item: {} ({})", item.name, item.item_type);

                Ok(item)
            }
            Err(e) => {
                error!("Failed to create masked item: {}", e);
                Err(e)
            }
        }
    }

    /// Update a masked item
    pub async fn update(&self, id: i64, request: UpdateMaskedItemRequest) -> Result<MaskedItem, sqlx::Error> {
        // Get the old item first to update cache
        let old_item: Option<MaskedItem> = sqlx::query_as(
            "SELECT id, name, item_type, created_at, updated_at FROM masked_items WHERE id = ?"
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;

        let new_name = request.name.trim().to_lowercase();

        let result = sqlx::query(
            "UPDATE masked_items SET name = ? WHERE id = ? RETURNING id, name, item_type, created_at, updated_at"
        )
        .bind(&new_name)
        .bind(id)
        .fetch_one(&self.pool)
        .await;

        match result {
            Ok(row) => {
                let item = MaskedItem {
                    id: sqlx::Row::get(&row, "id"),
                    name: sqlx::Row::get(&row, "name"),
                    item_type: sqlx::Row::get(&row, "item_type"),
                    created_at: sqlx::Row::get(&row, "created_at"),
                    updated_at: sqlx::Row::get(&row, "updated_at"),
                };

                // Update cache
                if let Some(old) = old_item {
                    let item_type: MaskedItemType = old.item_type.parse().unwrap_or(MaskedItemType::App);
                    self.cache.remove_item(&old.name, item_type).await;
                    self.cache.add_item(&item.name, item_type).await;
                }

                info!("Updated masked item {}: {}", id, item.name);
                Ok(item)
            }
            Err(e) => {
                error!("Failed to update masked item {}: {}", id, e);
                Err(e)
            }
        }
    }

    /// Delete a masked item
    pub async fn delete(&self, id: i64) -> Result<PrivacyResult, sqlx::Error> {
        // Get the item first to update cache
        let item: Option<MaskedItem> = sqlx::query_as(
            "SELECT id, name, item_type, created_at, updated_at FROM masked_items WHERE id = ?"
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;

        let rows_affected = sqlx::query("DELETE FROM masked_items WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?
            .rows_affected();

        if rows_affected > 0 {
            // Update cache
            if let Some(item) = item {
                let item_type: MaskedItemType = item.item_type.parse().unwrap_or(MaskedItemType::App);
                self.cache.remove_item(&item.name, item_type).await;
                info!("Deleted masked item {}: {}", id, item.name);
            }

            Ok(PrivacyResult {
                success: true,
                message: "Item deleted successfully".to_string(),
            })
        } else {
            Ok(PrivacyResult {
                success: false,
                message: format!("Item with id {} not found", id),
            })
        }
    }

    /// Search masked items by name
    pub async fn search(&self, query: &str) -> Result<Vec<MaskedItem>, sqlx::Error> {
        let search_pattern = format!("%{}%", query.to_lowercase());
        
        sqlx::query_as(
            "SELECT id, name, item_type, created_at, updated_at FROM masked_items WHERE LOWER(name) LIKE ? ORDER BY item_type, name"
        )
        .bind(&search_pattern)
        .fetch_all(&self.pool)
        .await
    }

    /// Check if a window should be masked (convenience method)
    pub async fn should_mask(&self, app_name: &str, browser_url: Option<&str>) -> bool {
        self.cache.should_mask_window(app_name, browser_url).await
    }

    /// Refresh the cache from database
    pub async fn refresh_cache(&self) -> Result<(), sqlx::Error> {
        self.cache.refresh(&self.pool).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_domain() {
        assert_eq!(extract_domain("https://www.facebook.com/path"), "www.facebook.com");
        assert_eq!(extract_domain("http://facebook.com"), "facebook.com");
        assert_eq!(extract_domain("facebook.com/path"), "facebook.com");
        assert_eq!(extract_domain("www.facebook.com"), "www.facebook.com");
    }
}
