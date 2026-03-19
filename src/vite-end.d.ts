/// <reference types="vite/client" />
declare const GITHUB_RUNTIME_PERMANENT_NAME: string
declare const BASE_KV_SERVICE_URL: string

interface SparkLLMPromptType {
  (strings: TemplateStringsArray, ...values: unknown[]): unknown;
}

interface UserInfo {
  avatarUrl?: string;
  email?: string;
  id: string;
  isOwner: boolean;
  login: string;
}

interface Spark {
  llmPrompt: SparkLLMPromptType;
  llm(prompt: unknown, model: string, parseJSON: boolean): Promise<string>;
  user(): Promise<UserInfo>;
  kv: {
    keys(): Promise<string[]>;
    get<T>(key: string): Promise<T | undefined>;
    set<T>(key: string, value: T): Promise<void>;
    delete(key: string): Promise<void>;
  };
}

declare const spark: Spark;