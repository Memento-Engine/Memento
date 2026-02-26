use app_core::db::SearchResult;
use serde::{ Deserialize, Serialize };

use crate::server::search_web::{TavilyResponse, WebSearchResult};

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum KnowledgeSource {
    PersonalMemory,
    WebSearch,
    LLMKnowledge,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum RetrievalDepth {
    None,
    Shallow,
    Deep,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum CitationPolicy {
    Mandatory,
    Preferred,
    None,
}

/// Defines the explicit action to take regarding web search
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum WebAction {
    /// Return immediately (saying no results, or returning the found personal results)
    Return,
    /// Pause and ask the user for approval to search the web
    Offer,
    /// Proceed with web search automatically
    Auto,
}

/// Dictates what to do after checking PersonalMemory
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct WebIntegrationPolicy {
    pub on_results_found: WebAction,
    pub on_no_results: WebAction,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct ExecutionPlan {
    pub knowledge_priority: Vec<KnowledgeSource>,

    pub retrieval_depth: RetrievalDepth,

    pub citation_policy: CitationPolicy,

    pub include_images: bool,

    // Replacing the redundant intent_category
    pub web_policy: WebIntegrationPolicy,

    pub rewritten_query: String,

    pub personal_search_queries: Vec<String>,

    pub web_search_queries: Vec<String>,
}
impl ExecutionPlan {
    /// Consumes the raw ExecutionPlan and converts it into a concrete ExecutionStrategy
    pub fn into_strategy(self) -> ExecutionStrategy {
        if self.retrieval_depth == RetrievalDepth::None {
            ExecutionStrategy::DirectResponse
        } else if self.retrieval_depth == RetrievalDepth::Shallow {
            ExecutionStrategy::QuickLookup {
                sources: self.knowledge_priority,
                search_query: self.rewritten_query,
            }
        } else {
            ExecutionStrategy::DeepResearch {
                sources: self.knowledge_priority,
                search_query: self.rewritten_query,
            }
        }
    }
}
/// Represents the actionable strategy derived from the LLM's ExecutionPlan.
/// Dictates both the backend data pipeline and the frontend UI loading state.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type")]
pub enum ExecutionStrategy {
    /// Action: Skip vector databases entirely. Send prompt straight to LLM.
    /// UI State: Hidden. Do not show any loaders; immediately stream the text.
    /// Trigger: retrieval_depth == none
    DirectResponse,

    /// Action: Iterate through the fallback chain (`sources`). Perform a shallow
    /// search. Stop and break the loop at the first source that yields context.
    /// UI State: Minimal. Show a single string that updates (e.g., "Scanning LocalIndex...")
    /// as the backend loops through the vector array.
    /// Trigger: retrieval_depth == shallow
    QuickLookup {
        sources: Vec<KnowledgeSource>, // The fallback chain
        search_query: String, // The optimized query to search with
    },

    /// Action: Execute a deep, multi-source retrieval. This might involve running
    /// parallel searches or executing specific sub-tasks before calling the LLM.
    /// UI State: Detailed. Show a dropdown or list of `sub_tasks` checking off.
    /// Trigger: retrieval_depth == deep
    DeepResearch {
        sources: Vec<KnowledgeSource>, // All sources that will be actively scraped/queried
        search_query: String, // e.g., ["Fetch past 7 days of VS Code logs", "Cross-reference with Web"]
    },
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct GatheredContext {
    pub personal_results: Vec<SearchResult>,
    pub web_results: Vec<TavilyResponse>,
    // We can also store the final decided action here to pass to the LLM
    pub final_action: Option<WebAction>,
}
