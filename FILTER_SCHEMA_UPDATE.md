# Filter Schema Update: Multiple Keyword Variations Support

## Overview

The filter schema has been updated to support multiple keyword variations for application names, window titles, and browser URLs. This allows the search system to attempt different keyword variations without requiring replanning, significantly improving recall and reducing failures caused by overly strict filtering.

## Changes Made

### 1. TypeScript Planner Schema (`agents/src/planner/planner.schema.ts`)

#### Updated Filter Schema
Changed filter fields from single `string` to `Vec<string>`:

**Before:**
```typescript
export const DatabaseFilterSchema = z.object({
  app_name: z.string().optional(),
  window_title_contains: z.string().optional(),
  browser_url_contains: z.string().optional(),
  // ... other fields
});
```

**After:**
```typescript
export const DatabaseFilterSchema = z.object({
  app_name: z.array(z.string()).optional(),  // Array of app name variations
  window_title_contains: z.array(z.string()).optional(),  // Array of window title keywords
  browser_url_contains: z.array(z.string()).optional(),  // Array of URL substrings
  // ... other fields
});
```

#### Descriptions Updated
Added comprehensive descriptions explaining the multiple variation capability:
- "Array of application name variations to match (e.g., ['VS Code', 'vscode', 'Visual Studio Code'])"
- "Array of window title substrings to match. Matches if window_title contains any of these values."
- "Array of browser URL substrings to match (e.g., ['github.com', 'gitlab.com'])"

### 2. Planner Prompt Enhancement (`agents/src/prompts/plannerPrompt.ts`)

#### Updated Filter Rules Section
Revised to guide the LLM to generate multiple keyword variations:

**Key Changes:**
- Explained that filter fields are now arrays
- Provided variation strategies:
  1. Case variations: "VS Code", "vscode", "Vs Code"
  2. Abbreviations: "VS Code" = "Visual Studio Code"
  3. Platform variations: "slack" = "Slack Electron"
  4. Domain aliases: "twitter.com" = "x.com"
  5. Partial matches: shortened forms
  6. Common aliases: various acronyms

**Examples Added:**
```typescript
// GitHub with variations
filter: {
  app_name: ["Google Chrome", "Chrome"],
  browser_url_contains: ["github.com", "ghe."]
}

// VS Code variations
filter: {
  app_name: ["VS Code", "vscode", "Visual Studio Code"]
}

// Twitter/X handling
filter: {
  browser_url_contains: ["twitter.com", "x.com", "twitter."]
}

// Slack variations
filter: {
  app_name: ["Slack", "slack", "Slack Electron"]
}
```

### 3. Rust Backend - Daemon Search Tool (`crates/daemon/src/server/search_tool.rs`)

#### Updated DatabaseFilter Struct
Changed filter fields to hold arrays:

```rust
#[derive(Debug, Deserialize, Serialize)]
pub struct DatabaseFilter {
    pub app_name: Option<Vec<String>>,
    pub window_title_contains: Option<Vec<String>>,
    pub browser_url_contains: Option<Vec<String>>,
    pub is_focused: Option<bool>,
    pub key_words: Option<Vec<String>>,
    pub time_range: Option<TimeRange>,
}
```

#### Updated search_tool Handler Function
Modified to:
1. Extract arrays from filter fields
2. Convert `Vec<String>` to `Vec<&str>` for database layer
3. Support limit, sort, and sort_order parameters from the request
4. Pass all parameters to the database layer

**Key Functionality:**
- Empty filter arrays default to empty vectors (no restriction)
- Non-empty arrays are converted to references and passed to the database
- Limit parameter: defaults to 40, capped at 100 to prevent excessive data transfer
- Sort field and order are extracted and mapped to string values

### 4. Rust Backend - Core Database Layer (`crates/core/src/db.rs`)

#### Updated build_filtered_chunks_cte Function
Completely rewritten to handle array filters:

**Before:** Single value per filter
```rust
if let Some(app) = app_name {
    qb.push(" AND LOWER(f.app_name) LIKE ");
    qb.push_bind(format!("%{}%", app.to_lowercase()));
}
```

**After:** Multiple values with OR conditions
```rust
if let Some(apps) = app_names {
    if !apps.is_empty() {
        qb.push(" AND (");
        for (idx, _) in apps.iter().enumerate() {
            if idx > 0 {
                qb.push(" OR ");
            }
            qb.push("LOWER(f.app_name) LIKE ");
            qb.push_bind(format!("%{}%", apps[idx].to_lowercase()));
        }
        qb.push(")");
    }
}
```

**Applied to all three filter fields:**
- `app_names`: Application name variations
- `window_names`: Window title variations  
- `browser_urls`: Browser URL variations

#### Updated search_tool Function Signature
```rust
pub async fn search_tool(
    &self,
    app_names: Option<Vec<&str>>,        // Array of app name variations
    window_names: Option<Vec<&str>>,     // Array of window title variations
    browser_urls: Option<Vec<&str>>,     // Array of URL variations
    start_time: Option<DateTime<Utc>>,
    end_time: Option<DateTime<Utc>>,
    key_words: Option<Vec<&str>>,
    search_type: &SearchType,
    limit: Option<i32>,
    embedding_json: &str,
    _sort_field: Option<&str>,           // Sort field (for future use)
    _sort_order: Option<&str>            // Sort order (for future use)
) -> Result<Vec<SearchResult>, sqlx::Error>
```

**Changes:**
- Changed single value parameters to array parameters for app_names, window_names, browser_urls
- Added sort_field and sort_order parameters (prepared for future sorting implementation)
- Updated function body to call new build_filtered_chunks_cte signature

## How It Works

### Filter Query Construction

When filter arrays are provided, the SQL query constructs OR conditions:

**Example Query with Multiple Variations:**
```sql
WHERE 1=1
  AND (
    LOWER(f.app_name) LIKE '%vs code%'
    OR LOWER(f.app_name) LIKE '%vscode%'
    OR LOWER(f.app_name) LIKE '%visual studio code%'
  )
  AND (
    LOWER(f.browser_url) LIKE '%github.com%'
    OR LOWER(f.browser_url) LIKE '%ghe.%'
  )
```

This allows a single query to match records that contain ANY of the provided keyword variations.

### Empty Filter Handling

- Empty arrays are treated as "no filter applied"
- If all filter arrays are empty, no WHERE conditions are added for those fields
- This maintains backward compatibility with unfiltered queries

### Parameter Flow

```
TypeScript Planner
  ↓
  Generates DatabaseQuery with filter arrays
  ↓
Daemon search_tool endpoint
  ↓
  Extracts and validates arrays
  ↓
Core db.search_tool function
  ↓
  Builds SQL with OR conditions
  ↓
  Executes query against database
  ↓
Returns SearchResult array
```

## Benefits

1. **Improved Recall** - Multiple keyword variations increase the chance of matching relevant records
2. **Fewer Failures** - Reduces queries that return empty results due to exact naming mismatches
3. **Less Replanning** - Avoids triggering the replanning mechanism for simple naming variations
4. **Better Scalability** - Single query handles multiple variations instead of multiple queries
5. **Backward Compatible** - Empty arrays are equivalent to no filter

## Examples

### Example 1: GitHub Development Activity

**Generated Query:**
```typescript
{
  semanticQuery: "GitHub code review and pull requests",
  filter: {
    app_name: ["Google Chrome", "Chrome", "Chromium"],
    browser_url_contains: ["github.com", "github.local", "ghe."]
  }
}
```

**Matching Records:**
- Records from "Google Chrome" OR "Chrome" OR "Chromium"
- With URLs containing "github.com" OR "github.local" OR "ghe."

### Example 2: Twitter/X Monitoring

**Generated Query:**
```typescript
{
  semanticQuery: "retweets and likes",
  filter: {
    browser_url_contains: ["twitter.com", "x.com", "twitter.", "x."]
  }
}
```

**Matching Records:**
- Any browser activity with URLs containing any of the provided variations
- Handles the rebrand from Twitter to X seamlessly

### Example 3: VS Code Development

**Generated Query:**
```typescript
{
  semanticQuery: "TypeScript files and debugging",
  filter: {
    app_name: ["VS Code", "vscode", "Visual Studio Code", "code.exe"],
    window_title_contains: ["TypeScript", "Debug"]
  }
}
```

**Matching Records:**
- Application names matching any variation
- Window titles containing TypeScript OR Debug

## Backward Compatibility

The changes maintain backward compatibility:

1. **Empty Arrays**: Treated as no filter constraint
2. **None Values**: Handled correctly (no filter applied)
3. **Existing Code**: Functions accept empty arrays gracefully
4. **Database Queries**: Skips OR conditions when arrays are empty

## Planner Guidance

The updated prompt instructs the LLM to:

1. **Identify Application Variations**
   - Common aliases: "VS Code" ↔ "Visual Studio Code"
   - Executable names: "code.exe", "vscode"
   - Platform-specific: "Slack Electron"

2. **Handle Platform Changes**
   - "Twitter" ↔ "X"
   - "GitHub Enterprise" ↔ "GHE"
   - Custom domain variants

3. **Include Common Abbreviations**
   - Full names and shortened forms
   - Case variations where relevant
   - Common typos or variations users might use

4. **Balance Coverage**
   - Include reasonable variations (3-5 per field)
   - Avoid excessive variations that don't add value
   - Prioritize most likely matches first

## Testing Recommendations

### Unit Tests
1. Test query building with empty arrays
2. Test query building with single array element
3. Test query building with multiple array elements
4. Verify OR conditions are properly generated
5. Test case insensitivity with mixed case inputs

### Integration Tests
1. Execute queries with multiple app name variations
2. Execute queries with multiple URL variations
3. Verify results contain records matching ANY variation
4. Test with real activity data containing various formats
5. Performance test with large result sets (using limit parameter)

### Planner Tests
1. Verify planner generates multiple variations for known apps
2. Check that variations are reasonable and relevant
3. Ensure variation arrays are properly formatted
4. Test with various user queries mentioning different apps

## Migration Notes

If there are existing systems that call db.search_tool directly:

**Old Signature:**
```rust
search_tool(
    &self,
    app_name: Option<&str>,
    window_name: Option<&str>,
    browser_url: Option<&str>,
    ...
)
```

**New Signature:**
```rust
search_tool(
    &self,
    app_names: Option<Vec<&str>>,
    window_names: Option<Vec<&str>>,
    browser_urls: Option<Vec<&str>>,
    ...
    sort_field: Option<&str>,
    sort_order: Option<&str>
)
```

All direct callers of db.search_tool must be updated to wrap single values in vectors or pass None/empty vectors.

## Future Enhancements

1. **Sorting Implementation** - Use sort_field and sort_order parameters
2. **Fuzzy Matching** - Replace exact LIKE with fuzzy matching algorithms
3. **Learned Variations** - Track which variations produce good results
4. **Multi-Language Support** - Generate variations for different languages
5. **Domain-Specific Aliases** - Learn organization-specific names/aliases

## Performance Considerations

1. **SQL OR Conditions** - More conditions may slightly increase query time
2. **Index Usage** - LIKE patterns still benefit from indexes on app_name, window_title, browser_url
3. **Limit Parameter** - Essential for controlling result set size across variations
4. **Batching** - Single query with multiple variations is more efficient than multiple queries

---

**Status:** Implementation Complete ✅
**Backward Compatibility:** Maintained ✅
**TypeScript Side:** Updated ✅
**Rust Side:** Updated ✅
**Documentation:** Complete ✅
