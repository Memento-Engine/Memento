use candle_core::{Device, Tensor, DType};
use candle_transformers::models::bert::{BertModel, Config};
use candle_nn::VarBuilder;
use tokenizers::{Tokenizer, PaddingParams};
use anyhow::Result;

pub struct EmbeddingModel {
    model: BertModel,
    tokenizer: Tokenizer,
    device: Device,
}

impl EmbeddingModel {
    pub fn new() -> Result<Self> {
        // 1. Setup Device (CPU is fine for embeddings, use Device::cuda_if_available(0) for GPU)
        let device = Device::Cpu;

        // 2. Fetch Model Files
        let api = hf_hub::api::sync::Api::new()?;
        let repo = api.model("sentence-transformers/all-MiniLM-L6-v2".to_string());
        
        let config_filename = repo.get("config.json")?;
        let tokenizer_filename = repo.get("tokenizer.json")?;
        let weights_filename = repo.get("model.safetensors")?;

        // 3. Load Components
        let config: Config = serde_json::from_str(&std::fs::read_to_string(config_filename)?)?;
        let mut tokenizer = Tokenizer::from_file(tokenizer_filename).map_err(anyhow::Error::msg)?;
        
        // Setup the tokenizer to pad lines to the same length
        let pp = PaddingParams {
            strategy: tokenizers::PaddingStrategy::BatchLongest,
            ..Default::default()
        };
        tokenizer.with_padding(Some(pp));

        let vb = unsafe { VarBuilder::from_mmaped_safetensors(&[weights_filename], DType::F32, &device)? };
        let model = BertModel::load(vb, &config)?;

        Ok(Self { model, tokenizer, device })
    }

    pub fn generate_embedding(&mut self, text: &str) -> Result<Vec<f32>> {
        // 1. Encode the text
        // "true" here adds special tokens like [CLS] and [SEP]
        let tokens = self.tokenizer.encode(text, true).map_err(anyhow::Error::msg)?;

        // 2. Prepare Tensors
        // We unsqueeze(0) to add a batch dimension: [Sequence_Len] -> [1, Sequence_Len]
        let token_ids = Tensor::new(tokens.get_ids(), &self.device)?.unsqueeze(0)?;
        let token_type_ids = Tensor::new(tokens.get_type_ids(), &self.device)?.unsqueeze(0)?;
        let attention_mask = Tensor::new(tokens.get_attention_mask(), &self.device)?.unsqueeze(0)?;

        // 3. Run Inference (Pass all 3 arguments)
        // Note: Some versions of `candle-transformers` might accept `&token_ids` directly, 
        // others need `&token_ids`. Adjust references if compiler complains.
        let embeddings = self.model.forward(&token_ids, &token_type_ids, Some(&attention_mask))?;

        // 4. Mean Pooling
        // BERT returns [Batch, Seq_Len, Hidden_Size]. We want to average over Seq_Len.
        let (_batch_size, n_tokens, _hidden_size) = embeddings.dims3()?;
        
        // Sum along the sequence dimension (dim 1) and divide by number of tokens
        let embeddings = (embeddings.sum(1)? / (n_tokens as f64))?;
        
        // Normalize the vector
        let embeddings = normalize_l2(&embeddings)?;

        // 5. Convert to Vec<f32>
        // Squeeze removes the batch dimension: [1, 384] -> [384]
        let vec = embeddings.squeeze(0)?.to_vec1::<f32>()?;
        
        Ok(vec)
    }
}

// Corrected Normalize Function
pub fn normalize_l2(v: &Tensor) -> Result<Tensor> {
    // 1. Calculate the Square Sum: v^2 -> sum
    let sum_squares = v.sqr()?.sum_keepdim(1)?;
    
    // 2. Calculate the Norm: sqrt(sum)
    let norm = sum_squares.sqrt()?;
    
    // 3. Divide original vector by norm
    // Note: No extra '?' outside the parentheses
    let v = v.broadcast_div(&norm)?;
    
    Ok(v)
}