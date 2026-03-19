/// <reference types="vite/client" />
declare const GITHUB_RUNTIME_PERMANENT_NAME: string
declare const BASE_KV_SERVICE_URL: string

interface SparkLLMPromptType {
  (strings: TemplateStringsArray, ...values: unknown[]): unknown;
}

interface Spark {
  llmPrompt: SparkLLMPromptType;
  llm(prompt: unknown, model: string, parseJSON: boolean): Promise<string>;
}

declare const spark: Spark;