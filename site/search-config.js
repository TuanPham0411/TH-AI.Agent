// Missing provider preserves older Perplexity workflows; changing it requires Check again.
export const searchProvider=node=>node.config.provider==='openai'?'openai':'perplexity';
