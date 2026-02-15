use anyhow::Result;
use candle_core::{quantized::gguf_file, Device};
use candle_transformers::models::quantized_phi3::ModelWeights;
use hf_hub::{api::sync::Api, Repo, RepoType};
use memmap2::Mmap;
use std::fs::File;
use tokenizers::Tokenizer;

pub fn load_llama_model(device: &Device) -> Result<(ModelWeights, Tokenizer)> {
    let api = Api::new()?;
    let model_id = "microsoft/Phi-3-mini-4k-instruct-gguf";

    let repo = api.repo(Repo::new(model_id.to_string(), RepoType::Model));
    let model_path = repo.get("Phi-3-mini-4k-instruct-q4.gguf")?;
    
    // 1. Open the file
    let file = File::open(&model_path)?;

    // 2. Memory map the file (Unsafe required for mmap operations)
    // This maps the file into memory without reading the whole thing immediately.
    let mmap = unsafe { Mmap::map(&file)? };
    
    // 3. Create a Cursor wrapper around the mmap slice
    let mut reader = std::io::Cursor::new(&*mmap);

    // 4. Parse the GGUF headers
    let content = gguf_file::Content::read(&mut reader)?;

    // 5. Load weights using the mmap reader
    // This is much faster as it relies on OS-level paging
    let model = ModelWeights::from_gguf(false, content, &mut reader, device)?;

    // Tokenizer setup remains the same
    let tokenizer_repo = api.repo(Repo::new("microsoft/Phi-3-mini-4k-instruct".to_string(), RepoType::Model));
    let tokenizer_filename = tokenizer_repo.get("tokenizer.json")?;
    let tokenizer = Tokenizer::from_file(tokenizer_filename).map_err(anyhow::Error::msg)?;

    Ok((model, tokenizer))
}