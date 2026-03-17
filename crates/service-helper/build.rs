fn main() {
    // Only embed resources on Windows
    #[cfg(windows)]
    {
        // Embed the Windows manifest that requests admin elevation
        embed_resource::compile("service-helper.rc", embed_resource::NONE);
    }
}
