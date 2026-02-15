use anyhow::{ Result, Error, anyhow };
use candle_nn::VarBuilder;
use candle_transformers::{
    generation::LogitsProcessor,
    models::phi3::{ Config as Phi3Config, Model as Phi3 },
};
use daemon::query::query_processing::GroupedResult;
use tracing::{ info, warn, debug, error };
use hf_hub::{ api::sync::Api, Repo, RepoType };
use tokenizers::Tokenizer;

use candle_core::{ DType, Device, Tensor, quantized::gguf_file };
use memmap2::Mmap;
use std::fs::File;
use chrono::{ DateTime, Utc };
use candle_transformers::models::quantized_phi3 as model; // Use the quantized module
use std::io::Read;
use model::ModelWeights;

// Return type is now direct, not a Result
pub fn load_llama_model(device: &Device) -> (model::ModelWeights, Tokenizer) {
    info!("Initialize API...");
    let api = Api::new().expect("Failed to create API instance");

    let model_id = "microsoft/Phi-3-mini-4k-instruct-gguf";
    let repo = api.repo(Repo::new(model_id.to_string(), RepoType::Model));

    info!("Downloading/Fetching Model Weights...");
    let model_path = repo
        .get("Phi-3-mini-4k-instruct-q4.gguf")
        .expect("Failed to download model weights. Check internet or filename.");

    let tokenizer_repo = api.repo(
        Repo::new("microsoft/Phi-3-mini-4k-instruct".to_string(), RepoType::Model)
    );

    info!("Fetching Tokenizer...");
    let tokenizer_filename = tokenizer_repo
        .get("tokenizer.json")
        .expect("Failed to download tokenizer.json");

    let tokenizer = Tokenizer::from_file(tokenizer_filename).expect(
        "Failed to parse tokenizer file"
    );

    info!("Opening File...");
    let file = File::open(&model_path).expect("Failed to open model file");

    // SAFETY: We trust the file system here.
    let mmap = unsafe { Mmap::map(&file).expect("Failed to map file to memory") };
    let mut reader = std::io::Cursor::new(&*mmap);

    info!("Reading GGUF Content...");
    let content = candle_core::quantized::gguf_file::Content
        ::read(&mut reader)
        .expect("Failed to read GGUF headers");

    info!("Loading Weights into Model...");
    // 3rd argument `device` is required
    let model = model::ModelWeights
        ::from_gguf(false, content, &mut reader, device)
        .expect("Failed to construct model from weights");

    info!("Model loaded successfully on {:?}", device);

    (model, tokenizer)
}

#[allow(clippy::too_many_arguments)]
pub fn generate_text_streaming<F>(
    model: &mut model::ModelWeights,
    tokenizer: &Tokenizer,
    prompt: &str,
    max_tokens: usize,
    temperature: f64,
    repeat_penalty: f32,
    repeat_last_n: usize,
    seed: u64,
    top_p: f64,
    device: &Device,
    mut callback: F
) -> Result<()>
    where F: FnMut(String) -> Result<()>
{
    // ------------------------------------------------
    // 1. Setup sampler
    // ------------------------------------------------
    let mut logits_processor = LogitsProcessor::new(seed, Some(temperature), Some(top_p));

    // ------------------------------------------------
    // 2. Encode prompt
    // ------------------------------------------------
    let encoding = match tokenizer.encode(prompt, true) {
        Ok(enc) => enc,
        Err(e) => {
            info!("Tokenizer encode failed: {:?}", e);
            return Err(Error::msg(e.to_string()));
        }
    };

    let mut tokens = encoding.get_ids().to_vec();

    if tokens.is_empty() {
        info!("Empty prompt detected");
        return Err(anyhow::anyhow!("Empty prompt"));
    }

    // ------------------------------------------------
    // 3. EOS token setup
    // ------------------------------------------------
    let eos_token = tokenizer
        .token_to_id("<|endoftext|>")
        .ok_or_else(|| anyhow!("EOS token not found"))?;

    // ------------------------------------------------
    // 4. Generation loop
    // ------------------------------------------------
    // NEW: Track the full decoded text to handle spacing correctly
    let mut prev_text = String::new();

    for step in 0..max_tokens {
        // A. KV-cache logic (Prepare Input)
        let input_tokens: Vec<u32> = if step == 0 {
            tokens.clone()
        } else {
            vec![*tokens.last().unwrap()]
        };

        // B. Build tensor
        let input = match Tensor::new(input_tokens.as_slice(), device) {
            Ok(t) =>
                match t.unsqueeze(0) {
                    Ok(u) => u,
                    Err(e) => {
                        return Err(e.into());
                    }
                }
            Err(e) => {
                return Err(e.into());
            }
        };

        // C. Calculate position for RoPE
        let position = tokens.len() - input_tokens.len();

        // D. Forward Pass
        let logits = match model.forward(&input, position) {
            Ok(l) => l,
            Err(e) => {
                return Err(e.into());
            }
        };

        // E. Process Logits (Squeeze -> Float -> Last Token)
        let logits = match logits.squeeze(0) {
            Ok(l) =>
                match l.to_dtype(DType::F32) {
                    Ok(x) => x,
                    Err(e) => {
                        return Err(e.into());
                    }
                }
            Err(e) => {
                return Err(e.into());
            }
        };

        let logits = if logits.dims().len() > 1 {
            let last_idx = logits.dim(0)? - 1;
            logits.get(last_idx)?
        } else {
            logits
        };

        // F. Apply Repeat Penalty
        let logits = if repeat_penalty == 1.0 {
            logits
        } else {
            let start_at = tokens.len().saturating_sub(repeat_last_n);
            candle_transformers::utils::apply_repeat_penalty(
                &logits,
                repeat_penalty,
                &tokens[start_at..]
            )?
        };

        // G. Sample Token
        let next_token = logits_processor.sample(&logits)?;
        tokens.push(next_token);

        if next_token == eos_token {
            info!("EOS reached, stopping generation");
            break;
        }

        // ------------------------------------------------
        // H. Decode Streaming (FIXED LOGIC)
        // ------------------------------------------------
        // We decode the *entire* sequence so far. This lets the tokenizer
        // handle context-dependent spaces correctly.
        match tokenizer.decode(&tokens, true) {
            Ok(current_text) => {
                // Calculate what part of the text is actually new
                let new_text = if current_text.len() > prev_text.len() {
                    // Safe slicing because we know prev_text is a prefix of current_text
                    current_text[prev_text.len()..].to_string()
                } else {
                    String::new()
                };

                // Only send non-empty updates
                if !new_text.is_empty() {
                    callback(new_text)?;
                }

                // Update our tracker
                prev_text = current_text;
            }
            Err(e) => {
                info!("Decode failed: {:?}", e);
                // Don't crash on decode error, just skip this frame
            }
        }
    }

    info!("Generation finished.");
    Ok(())
}

pub fn answer_query_with_context<F>(
    query: &str,
    results: &[GroupedResult], // Pass your search results here
    model: &mut model::ModelWeights,
    tokenizer: &Tokenizer,
    device: &Device,
    callback: F
) -> Result<()>
    where F: FnMut(String) -> Result<()>
{
    // 1. Build the Context String from your structs
    let mut context_str = String::new();

    if results.is_empty() {
        context_str.push_str("No relevant context found.\n");
    } else {
        for (i, result) in results.iter().enumerate() {
            // Format each result nicely
            context_str.push_str(
                &format!(
                    "Memory ID: {index}\n\
                 App Used: {app}\n\
                 Window Title: {title}\n\
                 User Viewed At: {time}\n\
                 Text Content: {content}\n\n",
                    index = i + 1,
                    time = result.captured_at.format("%Y-%m-%d at %H:%M:%S"), // "Viewed At" is key
                    app = result.app_name,
                    title = result.window_title,
                    content = result.matches.join(" ... ")
                )
            );
        }
    }

    // 2. Construct the Full Prompt (Phi-3 Template)
    // We give it a "System" role (optional in Phi-3, but good for context)
    // Then we pass the context and the user query.
    let final_prompt = format!(
        "<|user|>
You are a precise personal memory assistant.

TASK:
Answer the user's question using ONLY the MEMORY CONTEXT.

RULES:
- Only use information explicitly present in MEMORY CONTEXT.
- Do not invent or assume missing details.
- If relevant information exists, give a concise natural answer.
- If no relevant information exists, politely state that no matching activity was found.
- Keep response short and clear.
- Do NOT explain your reasoning.
- Do NOT repeat instructions.

=== MEMORY CONTEXT ===
{context}
=== END CONTEXT ===

QUESTION:
{query}

<|assistant|>
",
        context = context_str,
        query = query
    );

    // 3. Call your generator
    generate_text_streaming(
        model,
        tokenizer,
        &final_prompt,
        500, // Max tokens (give it space to answer)
        0.2, // Temperature
        1.1, // Repeat penalty
        64, // Repeat last n
        42, // Seed
        0.9, // Top p
        device,
        callback
    )?;

    Ok(())
}

// ----------------- Testing -----------------
pub async fn test_prompt(
    mut model: ModelWeights,
    tokenizer: Tokenizer,
    device: Device
) -> Result<()> {
    // A. Pretend we have results from your search engine
    let results = vec![
        GroupedResult {
            captured_at: "2026-02-14T07:42:15.102345600Z".parse::<DateTime<Utc>>().unwrap(),
            app_name: "Visual Studio Code".to_string(),
            window_title: "daemon/src/embedding_engine.rs".to_string(),
            matches: vec![
                "refactored embedding pipeline to async processing".to_string(),
                "added Arc wrapping for embedding model".to_string(),
                "fixed trait bound error for NdArray".to_string(),
                "improved logging for model initialization".to_string(),
                "debugged memory usage spike during batch embedding".to_string()
            ],
        },

        GroupedResult {
            captured_at: "2026-02-14T08:55:33.881200100Z".parse::<DateTime<Utc>>().unwrap(),
            app_name: "Google Chrome".to_string(),
            window_title: "Rust async programming tutorial".to_string(),
            matches: vec![
                "async vs threads in Rust explanation".to_string(),
                "tokio runtime basics".to_string(),
                "using async channels for background processing".to_string(),
                "how to avoid blocking operations".to_string()
            ],
        },

        GroupedResult {
            captured_at: "2026-02-14T10:14:07.551923400Z".parse::<DateTime<Utc>>().unwrap(),
            app_name: "Postman".to_string(),
            window_title: "Local API Testing".to_string(),
            matches: vec![
                "tested concurrent requests for booking endpoint".to_string(),
                "verified response time for search API".to_string(),
                "checked error handling for duplicate insert".to_string()
            ],
        },

        GroupedResult {
            captured_at: "2026-02-14T12:36:10.792988900Z".parse::<DateTime<Utc>>().unwrap(),
            app_name: "Google Chrome".to_string(),
            window_title: "What Is Microservices Architecture? | Google Cloud".to_string(),
            matches: vec![
                "microservices architecture overview".to_string(),
                "independent deployment strategies".to_string(),
                "containerization advantages".to_string(),
                "scalability patterns for microservices".to_string()
            ],
        },

        GroupedResult {
            captured_at: "2026-02-14T14:22:44.902113000Z".parse::<DateTime<Utc>>().unwrap(),
            app_name: "Slack".to_string(),
            window_title: "Team Chat - Backend Discussion".to_string(),
            matches: vec![
                "discussed database schema optimization".to_string(),
                "reviewed API design changes".to_string(),
                "clarified service responsibilities".to_string()
            ],
        },

        GroupedResult {
            captured_at: "2026-02-14T16:03:51.334561200Z".parse::<DateTime<Utc>>().unwrap(),
            app_name: "Terminal".to_string(),
            window_title: "cargo run --bin daemon --release".to_string(),
            matches: vec![
                "ran release build for performance testing".to_string(),
                "investigated missing logs issue".to_string(),
                "checked environment variables".to_string(),
                "verified daemon startup sequence".to_string()
            ],
        },

        GroupedResult {
            captured_at: "2026-02-14T18:11:09.110998200Z".parse::<DateTime<Utc>>().unwrap(),
            app_name: "YouTube".to_string(),
            window_title: "System Design Interview - Microservices vs Monolith".to_string(),
            matches: vec![
                "tradeoffs between monolith and microservices".to_string(),
                "service communication patterns".to_string(),
                "real-world architecture examples".to_string()
            ],
        }
    ];

    let user_query = "Can you please summarize my day today?";

    // B. Call the helper function
    let mut output = String::new();

    let _ = answer_query_with_context(
        user_query,
        &results,
        &mut model,
        &tokenizer,
        &device,
        |token| {
            output.push_str(&token);
            Ok(())
        }
    );

    info!("{}", output);
    
    Ok(())
}
