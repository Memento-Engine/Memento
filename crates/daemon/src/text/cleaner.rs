use once_cell::sync::Lazy; // You'll need the 'once_cell' crate
use regex::Regex;
use std::borrow::Cow;


// Compile regexes only ONCE globally
static CODE_INDICATORS: Lazy<Regex> = Lazy::new(|| {
    // Looks for typical code patterns: { }, trailing ;, or keywords
    Regex::new(r"(\{|\}|;|fn |let |const |impl |import )").unwrap()
});

static GARBAGE_CHARS: Lazy<Regex> = Lazy::new(|| {
    // Matches isolated noisy chars often found in OCR (e.g., "| " or " _ ")
    Regex::new(r"(?m)^\s*[|_~]\s*$").unwrap()
});


pub fn smart_clean(raw_text: &str) -> Cow<str> {
    // Step 1: Heuristic - Is this code?
    // If we find 3 or more "code indicators", assume it's code.
    let matches = CODE_INDICATORS.find_iter(raw_text).count();

    if matches >= 3 {
        // IT IS CODE: Return as-is or do minimal whitespace trim
        // Using Cow::Borrowed means 0 memory allocation if we don't change it.
        return Cow::Borrowed(raw_text.trim());
    }

    // IT IS TEXT: Aggressive cleaning
    // 1. Remove OCR garbage lines
    let cleaned = GARBAGE_CHARS.replace_all(raw_text, "");

    // 2. Fix multiple spaces (e.g., "Hello    World" -> "Hello World")
    let space_fixer = Regex::new(r"\s+").unwrap();
    let final_text = space_fixer.replace_all(&cleaned, " ");

    // Using Cow::Owned because we modified the string
    Cow::Owned(final_text.into_owned())
}
