pub fn split_chunks(text: &str, chunk_size: usize) -> Vec<(String, usize, usize)> {
    let mut chunks = Vec::new();

    let mut start = 0;

    while start < text.len() {
        let end = (start + chunk_size).min(text.len());

        let slice = text[start..end].to_string();

        chunks.push((slice, start, end));

        start = end;
    }

    chunks
}